// Recado Encantado: o atendente automático do suporte (11/10, decisão do Guto: "responde tudo sozinho").
// Para cada conversa aberta cuja última mensagem é do cliente: olha o pedido de verdade, escreve a resposta com o Claude
// e manda pelo mesmo fio (responde, em suporte-email.ts). Reembolso, reclamação, vídeo com erro ou dado errado: acolhe,
// diz que a equipe vai resolver e avisa o Guto no celular. Nunca promete o que não está na base nem inventa prazo.
import { recadoDb as db } from '@/lib/recado/db'
import { recadoConfig as cfg } from '@/lib/recado/config'
import { linkFamilia, SUPORTE } from '@/lib/recado/email'
import { avisaDono, nomeProduto } from '@/lib/recado/avisa-dono'
import { responde } from '@/lib/recado/suporte-email'

const MODELO = process.env.RECADO_SUPORTE_MODELO || 'claude-sonnet-5'
const MAX_AUTO_24H = 3   // mais que isso na mesma conversa em 24 h: para e chama o Guto

// o que o site promete (FAQ das páginas e rodapé, 11/10). Mudou no site, muda aqui.
const BASE = `
O QUE É: vídeos personalizados feitos com inteligência artificial, em que um personagem fala com a criança pelo nome, com a foto dela.
PRODUTOS E PREÇOS: ${Object.entries(cfg.pacotes).flatMap(([per, pacs]: any) => Object.entries(pacs).map(([pac, v]: any) => `${nomeProduto(per, pac)}: R$ ${(+v.preco).toFixed(2).replace('.', ',')}${v.etapas ? ` (missão com ${v.etapas.length} vídeos, um por dia)` : ''}`)).join('; ')}.
COMO RECEBE: na página da família (o link chega no e-mail logo depois do pedido). Vídeo avulso (Fada, Papai Noel): em até 2 horas depois do pagamento confirmado aparece na página, pronto pra assistir e baixar, e chega um e-mail avisando. Missões: cada vídeo aparece na página no dia certo, sempre entre 7h e 21h (a Noite de Herói, às 18h), com e-mail a cada vídeo. Depois de cada vídeo da missão, a família marca na página "Cumpriu", "Tentou" ou "Ainda não", e o vídeo seguinte responde a isso, sem bronca.
E-MAIL QUE NÃO CHEGOU: olhar a caixa de spam ou de promoções. O link da página da família vale sempre.
PAGAMENTO: Pix ou cartão, na página segura do Asaas. O pedido só começa a ser feito depois que o pagamento confirma.
GARANTIA: se não ficar mágico, a gente refaz ou devolve o dinheiro. Se algo foi escrito errado no pedido, a gente refaz sem custo.
FOTO: usada só pra fazer o vídeo e apagada em 30 dias. Ninguém vê além da família, nunca usada em propaganda sem autorização.
IDADES: Papai Noel de 2 a 10 anos; Tchau Chupeta de 2 a 5; Noite de Herói de 3 a 8; Coragem de 3 a 9.
MISSÃO COMO FUNCIONA: Tchau Chupeta: o Capitão Grandão convoca, combina o dia de entregar a chupeta pra um bebezinho e manda a medalha; se a criança chorar no dia, marca "ainda não" e o vídeo seguinte encoraja. Noite de Herói: o Guardião da Noite, uma estrela por noite na própria cama, medalha em 5 noites; nunca diz que monstro existe (ensina o spray anti-monstro, água num borrifador). Coragem: a Capitã Coragem prepara pra vacina, dentista, médico; fala a verdade com carinho ("pica rapidinho, e passa"); pode pedir até a véspera; no próprio dia, a preparação chega em até 2 horas. Os personagens nunca prometem presente que a família não contou no formulário.
PRESENTE: avó, avô, dinda podem pedir; o personagem diz pra criança quem pediu. Mais de um filho: cada um ganha o seu vídeo (opção do irmão no pagamento, quando aparece).
CONTATO: ${SUPORTE}.`

const SISTEMA = `Tu é o atendimento do Recado Encantado, por e-mail. Escreve em português do Brasil, tratando por "tu" (jeito gaúcho), caloroso, simples e curto: 2 a 6 frases, sem lista longa, sem emoji em excesso (no máximo um). Não assina (a assinatura "Equipe Recado Encantado" entra sozinha).

REGRAS:
- Usa SÓ o que está na BASE e nos DADOS DO PEDIDO. Nunca inventa prazo, preço, política, desconto, horário nem promessa. Se não sabe, diz que a equipe vai ver e responder.
- Se tem pedido: usa o status real. Já entregue: manda o link da página da família. Pago e ainda sendo feito: diz o prazo da BASE. Aguardando pagamento: explica que começa depois do pagamento e manda o link da página (lá tem o botão de pagar). Missão: diz quando é o próximo vídeo, pelos horários das etapas.
- Se não achou pedido e a pessoa fala de um: pede o código do pedido (vem no e-mail, tipo FADA-AB12C) ou o e-mail usado na compra.
- Reembolso, cancelamento, reclamação, vídeo com problema, dado errado no vídeo, cobrança em dobro, ou algo que precisa de alguém fazer uma ação: acolhe, lembra a garantia quando couber ("se não ficou mágico, a gente refaz ou devolve o dinheiro"), diz que a equipe já recebeu e vai resolver, e marca precisa_dono = true. Tu NÃO executa reembolso nem promete data pra isso.
- Se perguntarem se é robô ou pessoa: diz com honestidade que é o atendimento automático do Recado Encantado e que a equipe acompanha tudo.
- Mensagem automática, propaganda, newsletter, aviso de sistema, ou algo que não é de cliente: acao = "ignorar".
- Nunca pede senha, dado de cartão ou documento.

Responde SÓ com um JSON, sem texto fora dele: {"acao":"responder"|"ignorar","resposta":"...","precisa_dono":true|false,"resumo_dono":"uma linha pro dono quando precisa_dono","problema":"o que a pessoa quer, em até 10 palavras","solucao":"o que tu respondeu ou encaminhou, em até 12 palavras"}`

async function dadosPedidos(conv: any) {
  const sel = 'id,codigo,status,personagem,pacote,preco,criado_em,pago_em,entregue_em,erro,crianca->>nome'
  let peds: any[] = []
  if (conv.codigo) peds = await db.busca('pedidos', `codigo=eq.${encodeURIComponent(conv.codigo)}&select=${sel}`).catch(() => [])
  if (!peds.length) peds = await db.busca('pedidos', `contato->>email=eq.${encodeURIComponent(conv.email)}&order=criado_em.desc&limit=5&select=${sel}`).catch(() => [])
  const out: string[] = []
  for (const p of peds) {
    const etapas = (cfg.pacotes as any)[p.personagem]?.[p.pacote]?.etapas ? await db.busca('etapas', `pedido_id=eq.${p.id}&order=ordem.asc&select=ordem,tipo,quando,status`).catch(() => []) : []
    const br = (t: string) => t ? new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'
    out.push(`Pedido ${p.codigo}: ${nomeProduto(p.personagem, p.pacote)}, criança ${p.nome || '-'}, status ${p.status}${p.status === 'falhou' ? ' (deu erro na produção: a equipe precisa refazer)' : ''}, criado ${br(p.criado_em)}, pago ${br(p.pago_em)}, entregue ${br(p.entregue_em)}. Página da família: ${linkFamilia(p.codigo)}` +
      (etapas.length ? `\n  Etapas da missão: ${etapas.map((e: any) => `${e.ordem}) ${e.tipo} ${br(e.quando)} ${e.status}`).join('; ')}` : ''))
  }
  return out.length ? out.join('\n') : 'Nenhum pedido encontrado com esse e-mail ou código.'
}

async function pergunta(conv: any, msgs: any[]) {
  const historico = msgs.map(m => `${m.direcao === 'entrada' ? 'CLIENTE' : 'NÓS'} (${new Date(m.quando).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}): ${m.texto}`).join('\n\n')
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, max_tokens: 900, system: SISTEMA, messages: [{ role: 'user', content:
      `AGORA: ${agora}\n\nBASE:\n${BASE}\n\nDADOS DO PEDIDO:\n${await dadosPedidos(conv)}\n\nCONVERSA (assunto: ${conv.assunto || '-'}; e-mail: ${conv.email}; nome: ${conv.nome || '-'}):\n${historico}\n\nResponde à última mensagem do CLIENTE.` }] }) })
  const j: any = await r.json()
  if (!r.ok) throw new Error('Claude ' + r.status + ': ' + JSON.stringify(j).slice(0, 200))
  const txt = (j.content || []).map((c: any) => c.text || '').join('').trim()
  return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1))
}

export async function atendeSozinho(limite = 3) {
  const feitas: string[] = []
  if (!process.env.ANTHROPIC_API_KEY) return { feitas, erro: 'sem ANTHROPIC_API_KEY' }
  const abertas: any[] = await db.busca('suporte', 'status=eq.aberto&order=atualizado_em.asc&limit=30&select=*')
  for (const conv of abertas) {
    if (feitas.length >= limite) break
    const msgs: any[] = await db.busca('suporte_msgs', `suporte_id=eq.${conv.id}&order=quando.asc&select=quando,direcao,de,texto`)
    if (!msgs.length || msgs[msgs.length - 1].direcao !== 'entrada') continue   // já respondida
    if (conv.ia_erro_em && Date.now() - +new Date(conv.ia_erro_em) < 3600e3) continue   // falhou há pouco: o Guto já foi avisado
    const auto24 = msgs.filter(m => m.direcao === 'saida' && m.de === 'ia' && Date.now() - +new Date(m.quando) < 864e5).length
    if (auto24 >= MAX_AUTO_24H) {
      if (conv.nao_lidas > 0 && !conv.escalado_em) { await avisaDono('🙋 Suporte precisa de ti', `${conv.nome || conv.email}: a conversa continua depois de ${MAX_AUTO_24H} respostas automáticas. Abre no painel.`, 'raising_hand').catch(() => null); await db.atualiza('suporte', `id=eq.${conv.id}`, { escalado_em: new Date().toISOString() }).catch(() => null) }
      continue
    }
    try {
      const d = await pergunta(conv, msgs)
      const curto = (s: any, n: number) => String(s || '').trim().slice(0, n) || null
      if (d.acao === 'ignorar') { await db.atualiza('suporte', `id=eq.${conv.id}`, { status: 'resolvido', resolvido_em: new Date().toISOString(), nao_lidas: 0, problema: curto(d.problema, 120) || 'Mensagem automática ou propaganda', solucao: 'Ignorada (não é de cliente)' }); feitas.push(conv.id + ' ignorada'); continue }
      if (!d.resposta || String(d.resposta).trim().length < 5) throw new Error('resposta vazia')
      await responde(conv.id, String(d.resposta).trim(), 'ia')
      // a linha do chamado no painel: o problema e o que foi feito; o que precisa do Guto fica aberto, o resto se fecha
      await db.atualiza('suporte', `id=eq.${conv.id}`, { problema: curto(d.problema, 120), solucao: (d.precisa_dono ? 'Precisa de ti: ' : '') + (curto(d.solucao, 140) || 'Respondido'),
        ...(d.precisa_dono ? {} : { status: 'resolvido', resolvido_em: new Date().toISOString() }) })
      if (d.precisa_dono) await avisaDono('🙋 Suporte precisa de ti', `${conv.nome || conv.email}${conv.codigo ? ' · ' + conv.codigo : ''}: ${d.resumo_dono || 'ver a conversa'}\nJá respondi acolhendo e dizendo que a equipe vai resolver.`, 'raising_hand').catch(() => null)
      else await db.atualiza('suporte', `id=eq.${conv.id}`, { nao_lidas: 0 })
      feitas.push(conv.id)
    } catch (e: any) {
      console.error('recado/suporte-ia', conv.id, e)
      await db.atualiza('suporte', `id=eq.${conv.id}`, { ia_erro_em: new Date().toISOString() }).catch(() => null)
      await avisaDono('⚠️ Suporte automático falhou', `${conv.nome || conv.email}: ${String(e.message || e).slice(0, 160)}. Responde pelo painel.`, 'warning').catch(() => null)
    }
  }
  return { feitas }
}
