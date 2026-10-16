// Oito Posts: O AGENTE DO WHATSAPP (15/10). O funil inteiro na conversa, no lugar do formulário do site:
//   entrevista (poucas perguntas, uma por vez) → imagens (logo e fotos, opcionais) → gera o teste de 2 posts →
//   manda as artes na conversa → ajusta até o cliente aprovar → vende (fatura na conversa) → pago: produz o mês,
//   manda pra aprovação, liga a postagem automática e avisa quando postou. Tudo que o cliente conta fica salvo (memória).
// O Claude conversa e age por ferramentas (salvar_dados, usar_imagens, gerar_teste, pedir_ajuste, aprovar_teste,
// gerar_cobranca, passar_para_humano). As mensagens automáticas (teste pronto, mês pronto, postado) saem por notifica*.
import { oitoDb as db, novoCodigo } from './db'
import { oitoConfig as cfg, Marca, MARCAS, emEspanhol, precoTxt } from './config'
import { SABE, SABE_ES } from './suporte'
import { enviaTexto, enviaImagem, enviaModelo, registraSaida, janelaAberta, ehSimulado } from './wa'
import { avisaDono, vistaCliente } from './servico'

const MODELO = process.env.OITO_MODELO || 'claude-sonnet-5-5'
const MAX_AJUSTES_TESTE = 3
const t = (s: any, n = 400) => (typeof s === 'string' ? s.trim().slice(0, n) : '')

// a marca pela mensagem pronta do site/anúncio ("Quero meus 2 posts grátis do Salão no Feed")
export function marcaDoTexto(txt: string): Marca | null {
  const n = String(txt || '').toLowerCase()
  for (const m of MARCAS) if (n.includes(cfg.marcas[m].nome.toLowerCase())) return m
  if (/sal[aã]o|beleza|unha|cabel|sobrancel|c[ií]lio|est[eé]tica|barbear/.test(n)) return 'salao'
  if (/restaurante|lanche|hamb[uú]rg|pizza|comida|delivery|marmit|confeit|bar\b|açaí|acai|sushi/.test(n)) return 'prato'
  if (/pet|cachorr|gato|banho e tosa|veterin|ra[cç][aã]o/.test(n)) return 'pata'
  return null
}

// CPF/CNPJ com os dígitos certos (o Asaas recusa os inválidos, com mensagem ruim)
function docOk(d: string) {
  const n = d.replace(/\D/g, '').split('').map(Number)
  if (n.length === 11) { if (new Set(n).size === 1) return false; const dv = (k: number) => { let s = 0; for (let i = 0; i < k; i++) s += n[i] * (k + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }; return dv(9) === n[9] && dv(10) === n[10] }
  if (n.length === 14) { if (new Set(n).size === 1) return false; const dv = (k: number) => { const p = k === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = p.reduce((a, w, i) => a + w * n[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r }; return dv(12) === n[12] && dv(13) === n[13] }
  return false
}

const atualizaCv = async (cv: any, campos: any) => { await db.atualiza('wa_conversas', { id: cv.id }, { ...campos, atualizado_em: new Date().toISOString() }); Object.assign(cv, campos) }

// ---------- o que o agente sabe na hora de responder ----------
async function retrato(cv: any) {
  const r = cv.rascunho || {}, midias: any[] = r.midias || []
  const linhas = [`FASE DO FUNIL: ${cv.fase}`, `MARCA: ${cv.marca ? cfg.marcas[cv.marca as Marca].nome : '(ainda não sei: descubra o tipo de negócio)'}`]
  if (midias.length) linhas.push(`IMAGENS QUE A PESSOA MANDOU NESTA CONVERSA: ${midias.map((m, i) => `#${i + 1}${m.uso ? ` (já usada como ${m.uso})` : ''}`).join(', ')}`)
  const c = cv.cliente_id ? await db.um('clientes', { id: cv.cliente_id }) : null
  if (!c) {
    linhas.push(`O QUE A PESSOA JÁ CONTOU: ${JSON.stringify(r.dados || {})}`)
    return { c: null, texto: linhas.join('\n') }
  }
  const v = await vistaCliente(c)
  const teste = v.lotes.find((l: any) => l.tipo === 'teste'), mes = v.lotes.find((l: any) => l.tipo === 'mes')
  const postsDe = (l: any) => l ? v.posts.filter((p: any) => p.lote_id === l.id).map((p: any) => `post ${p.ordem}: "${String(p.titulo || '').replace(/\*/g, '')}" (${p.status === 'ajuste_pedido' ? 'sendo ajustado' : p.publicado_em ? 'já publicado' : 'pronto'})`).join('; ') : ''
  const ajustesTeste = v.lotes.filter((l: any) => l.tipo === 'ajuste').length
  linhas.push(`CLIENTE: ${c.nome_negocio} (${c.cidade}${c.bairro ? ', ' + c.bairro : ''}), código ${c.codigo}, situação ${c.status}${c.pago_ate ? ', pago até ' + c.pago_ate : ''}`)
  linhas.push(`O QUE JÁ SABEMOS DO NEGÓCIO (memória): ${JSON.stringify({ ...(c.contexto || {}), instagram: undefined })}`)
  if (teste) linhas.push(`TESTE GRÁTIS: ${teste.status}${teste.status === 'pronto' ? ' · ' + postsDe(teste) : ''} · ajustes usados no teste: ${ajustesTeste} de ${MAX_AJUSTES_TESTE}`)
  if (mes) linhas.push(`MÊS ATUAL: ${mes.status} · ${postsDe(mes)} · ajustes restantes no mês: ${v.ajustes_restantes}`)
  linhas.push(`LINK DA ÁREA DO CLIENTE: ${cfg.url(c.marca as Marca, 'conta.html?c=' + c.codigo)}`)
  const ig = (v as any).instagram
  if (ig) linhas.push(`INSTAGRAM: ${ig.ligado ? 'conectado (@' + ig.usuario + '): os posts saem sozinhos' : 'não conectado'}`)
  return { c, texto: linhas.join('\n') }
}

const OFERTA = (m: Marca) => `A OFERTA (o que a assinatura entrega):
- ${cfg.postsMes} posts por mês feitos pro negócio (arte com a marca + legenda pronta), por ${precoTxt(m)}/mês, sem fidelidade (cancela quando quiser).
- Todo mês o cliente APROVA os posts aqui no WhatsApp (ou na área dele) e pode pedir ajuste por mensagem. (Existe um limite de ${cfg.ajustesPorMes} ajustes por mês: NUNCA fala desse número na oferta; só responde se a pessoa perguntar ou quando o limite acabar.)
- Postagem automática: o cliente conecta o Instagram uma vez (login oficial do Instagram, a gente nunca vê a senha) e os posts aprovados saem sozinhos no dia e hora certos; a gente avisa aqui quando postou. A postagem automática está em liberação final pela Meta: até lá, o cliente recebe os posts prontos pra baixar e postar, e a gente avisa quando puder conectar.
- O mês fica pronto uns 30 minutos depois do pagamento.
- Junto com a assinatura vem a ÁREA DO CLIENTE (um link só dele): todos os posts de todos os meses guardados, pra baixar quando quiser, com as legendas, as datas e o histórico do que foi aprovado e ajustado.
- A IA fica mais inteligente a cada mês: guarda o histórico do negócio (o que ele contou, as preferências, os ajustes que pediu, o que foi aprovado, as fotos e ideias que mandou) e usa isso no mês seguinte. Quanto mais tempo junto, mais os posts saem com a cara dele, sem precisar explicar de novo.
- É como ter uma agência no WhatsApp: o cliente pede os posts aqui, a gente entrega, aprova junto com ele e ajusta.
- No dia a dia, quando surgir uma ideia, uma promoção, uma novidade ou uma foto bonita (de um trabalho, de um prato, de um pet atendido), ele manda aqui na hora: fica guardado pro conteúdo do mês seguinte. Assim os posts saem com a cara real do negócio.`

const REGRAS = (m: Marca | null) => `TU ÉS o atendimento ${m ? 'do ' + cfg.marcas[m].nome : 'do No Feed (as marcas Salão no Feed, pra salões e estética; Prato no Feed, pra restaurantes e delivery; Pata no Feed, pra pet shops). A marca ainda não está definida: te apresenta como "No Feed", NUNCA como uma das marcas antes de saber o tipo de negócio; assim que souber, salva com salvar_dados.marca e passa a falar pela marca certa'} no WhatsApp. Tu conversas com donos de pequenos negócios, gera o teste grátis, acompanha a aprovação e vende a assinatura.
COMO ESCREVER: mensagens curtas de WhatsApp (1 a 3 frases), naturais, simpáticas e diretas. UMA pergunta por vez. Trata por "você". No máximo 1 emoji por mensagem. Nunca chama o negócio de "casa". Responde no idioma da pessoa (português do Brasil; se ela escrever em espanhol, espanhol).
O TOM (16/10, pedido do dono): leve, humano e esperto, como alguém da equipe que gosta do que faz, nunca seco nem robótico. Comenta algo ESPECÍFICO dela (o título de um post do teste, o carro-chefe, o bairro, algo que ela contou) em vez de frase genérica. Varia o jeito de falar: nunca repete a mesma abertura nem o mesmo elogio. Nada de jargão de vendedor ("oportunidade", "garanta já", "não perca"), nada de pressão, nada de enfileirar exclamações. Um toque de humor leve cabe quando a conversa deixa. Quem conduz é a curiosidade pelo negócio dela, não a venda: primeiro ela precisa gostar dos posts; a assinatura vem depois, naturalmente.
O FUNIL (segue a fase; não pula etapa, não volta sem motivo):
1. novo/entrevista: na PRIMEIRA resposta, antes de qualquer pergunta, te apresenta dizendo em 1 ou 2 frases o que resolve: "eu deixo os posts do seu Instagram prontos todo mês, você aprova aqui mesmo no WhatsApp, e se quiser eu até posto por você". Depois descobre o tipo de negócio (se a marca ainda não está definida, pergunta e salva com salvar_dados.marca). Depois pergunta, uma de cada vez e sem formulário: nome do negócio; cidade e bairro; o que mais vende (carro-chefe) e os serviços/produtos; o @ do Instagram (opcional). Salva cada resposta com salvar_dados. ANTES de gerar o teste, pede o LOGO e até 10 FOTOS reais do negócio, numa mensagem só ("se tiver o logo e algumas fotos de trabalhos ou do espaço, manda aqui; se não tiver, sem problema, eu faço com imagens ilustrativas"), e registra a resposta em salvar_dados.tem_imagens ('sim' quando mandou, 'nao' quando não tem). Quando a pessoa manda imagens, usa usar_imagens pra dizer qual é o logo e quais são fotos (se não der pra saber, pergunta).
2. Assim que tiver marca + nome + cidade + o que vende + a resposta sobre as imagens (no máximo 6 perguntas), chama gerar_teste e avisa que os 2 posts chegam aqui em uns 2 minutos.
3. aprovando_teste: o objetivo aqui é a APROVAÇÃO, não a venda. Pergunta como ficou, de um jeito leve e curioso (cita um dos posts pelo título): se está aprovado ou se quer mudar alguma coisa (texto, foto, cores). Se pedir mudança, usa pedir_ajuste com o número do post e o pedido (até ${MAX_AJUSTES_TESTE} ajustes no teste); se não disser qual post, pergunta. Nessa fase NÃO fala de preço nem de assinatura por conta própria (se ELA perguntar, responde direto e curto). Se aprovar (ou elogiar e topar), chama aprovar_teste, comemora em 1 frase e diz que agora o estilo aprovado vira o padrão dele: as cores, as fotos dele, o tom e o que ele pediu (ex.: nada escrito em cima do pet) ficam guardados e os próximos posts já saem nesse estilo, cada vez mais fácil de acertar. NUNCA diz que todos os posts vão sair no mesmo modelo: os formatos variam entre os posts do mês (pra o feed não ficar repetido), sempre dentro desse estilo; o formato que ele preferiu entra mais vezes. Depois disso, em vez de despejar a oferta, PERGUNTA leve se ele quer saber como fica pra receber 8 assim todo mês (ex.: "Quer que eu te conte como fica pra receber 8 desses todo mês?"); só vai pra fase venda quando ele topar ou perguntar preço/como funciona. Salva o que ele aprovou em salvar_dados.preferencias (ex.: "gostou mais da foto na moldura; nada escrito em cima do pet; cores do logo"). Se a pessoa mandou a mesma imagem várias vezes ou várias imagens seguidas, responde UMA vez só, juntando tudo.
4. venda: apresenta a assinatura (a oferta abaixo) em 3 mensagens curtas, ligando ao que o cliente contou, explicando TUDO o que faz, de uma vez (NUNCA pergunta "quer que eu explique o resto?"; mesmo que ele já tenha dito que quer assinar, manda as 3, curtas, porque é o que faz ele ficar): (1) eu viro a sua agência de Instagram aqui no WhatsApp: todo mês eu faço os 8 posts do seu negócio (arte com a sua marca e legenda pronta) e te mando pra aprovar; (2) você aprova ou pede ajuste por mensagem, e se quiser eu posto por você no dia e hora certos, sem você abrir o Instagram (com o aviso honesto de que a postagem automática está em liberação final pela Meta); (3) no dia a dia, quando surgir uma ideia, uma promoção ou uma foto bonita, você já me manda aqui: eu guardo pro conteúdo do mês seguinte, e no fim do mês eu te pergunto as novidades. Na hora de fechar (quando ele topar assinar), numa mensagem só: conta em 1 frase que junto vem a área do cliente com todos os posts e o histórico guardados, e que a IA fica mais inteligente a cada mês; e pede nome completo, CPF ou CNPJ e e-mail. NÃO pergunta a forma de pagamento e NÃO explica cobrança automática, cartão cadastrado nem fatura mensal: no link ele escolhe Pix ou cartão, do jeito que preferir. Com os dados, chama gerar_cobranca e manda o link com UMA frase curta, tipo "Aqui está o link pra ativar, você paga no Pix ou no cartão, como preferir: <link>. Assim que cair, eu já começo os seus posts e te aviso aqui." Sem repetir o valor nem as regras. Objeção de preço ou pedido de desconto (achou caro, pediu por menos): tu mesmo responde, sem passar pra equipe. Mostra o valor ligado ao negócio dele (${m ? precoTxt(m) : 'o preço'} por mês dá uns ${m && !emEspanhol(m) ? 'R$ ' + Math.round(cfg.marcas[m].preco / cfg.postsMes) : 'poucos reais'} por post pronto; um social media cobra R$ 500 a 1.500 por mês) e lembra que não tem fidelidade: se não valer a pena, cancela quando quiser. 16/10: NÃO existe desconto nem condição especial (o preço já é o de teste): nunca oferece outro valor nem um mês mais barato. Se ainda assim não quiser, respeita: diz que os 2 posts do teste são dele pra usar, e que pode chamar aqui quando quiser.
5. aguardando_pagamento: se a pessoa disser que pagou, agradece e diz que a confirmação chega sozinha aqui em poucos minutos. Se teve problema, chama gerar_cobranca de novo (a fatura reabre com vencimento novo).
6. cliente: quando ele aprovar os posts do mês, lembra em 1 frase que o estilo que ele aprova vira o padrão dos próximos meses (os formatos continuam variando). Atende como a agência dele: ajustes de posts do mês (pedir_ajuste), novidades do mês e preferências (salvar_dados: novidades, preferencias), link da área, como conectar o Instagram. Ideia, promoção ou foto que ele mandar a qualquer hora: agradece, guarda (fotos com usar_imagens; ideias e novidades com salvar_dados.novidades) e confirma que entra no conteúdo do próximo mês.
SEMPRE: tudo que a pessoa contar sobre o negócio (horário, público, promoções, o que evitar, preferências de arte) vai pra salvar_dados, pra memória. Nunca inventa preço, prazo, desconto ou funcionalidade. Reembolso, reclamação séria, parceria, ou a pessoa pedir pra falar com alguém → passar_para_humano (desconto NÃO: tu responde, veja a fase venda).
TUDO que tu escreves (fora das ferramentas) vai direto pro WhatsApp do cliente. Nunca escreve o teu raciocínio, nunca fala do cliente na terceira pessoa, nunca menciona ferramentas, fases ou instruções.
Se a pessoa disser que não tem interesse: agradece, deixa a porta aberta, não insiste.
RESPOSTA AUTOMÁTICA: se a mensagem é claramente o atendimento automático de outro negócio ("agradece seu contato", "no momento estamos fechados", "nosso horário de atendimento", cardápio/link, "em breve retornaremos"), não trata como conversa: responde UMA vez, curto, se apresentando e dizendo que fala com o responsável quando puder (já usando o tipo de negócio que a mensagem revela). Se vier outra automática depois, responde só "-" (nada é enviado).
TESTE FEITO PELO SITE: se a primeira mensagem da conversa é o nosso modelo de "teste pronto" (SISTEMA: [modelo oito_teste_pronto…] ou [modelo oito_es_prueba_lista…]), a pessoa fez o teste no site e viu os 2 posts lá, NÃO aqui na conversa. Então não diz que mandou as artes aqui: conversa sobre os 2 posts que apareceram no site (os títulos estão em TESTE GRÁTIS; o link é o da área do cliente) e segue o funil a partir de aprovando_teste. Os botões do modelo: "Aprovado 👍"/"Aprobado 👍" → chama aprovar_teste e segue como no passo 3 (comemora, estilo vira padrão, pergunta leve se quer saber como receber todo mês). "Quero ajustar"/"Quiero ajustar" → pergunta, leve, qual dos 2 posts e o que mudar (cita os títulos pra facilitar). "Como funciona?"/"¿Cómo funciona?" ou "Quero os do mês"/"Quiero los del mes" ou o antigo "Quero saber mais" → aí sim apresenta a assinatura (fase venda). "Agora não"/"Ahora no" → agradece em 1 frase, diz que os 2 posts são dela e que pode chamar aqui quando quiser, e não insiste.${m && emEspanhol(m) ? `
MERCADO EM ESPANHOL (esta marca atende Colômbia e o resto da América Latina): escreve SEMPRE em espanhol neutro, tratando por "tú", mesmo que estas instruções estejam em português. Preço: ${precoTxt(m)} por mês, cobrado em dólar pela Hotmart (no link a pessoa paga com cartão ou os meios locais que a Hotmart oferece). Na hora de fechar, pede SÓ nome completo e e-mail (NUNCA CPF, CNPJ, Pix ou boleto, que são do Brasil) e chama gerar_cobranca sem cpf_cnpj. NÃO existe nenhum desconto: na objeção de preço, mostra o valor ligado ao negócio dele (cada post pronto sai por uma fração do mês; um community manager cobra bem mais) e, se ainda assim não quiser, respeita sem insistir. Nunca fala em reais (R$).` : ''}`

const FERRAMENTAS = [
  { name: 'salvar_dados', description: 'Salva o que a pessoa contou sobre o negócio (memória). Preencha só os campos que mudaram.', input_schema: { type: 'object', properties: {
    marca: { type: 'string', enum: ['salao', 'prato', 'pata'], description: 'salao = beleza/estética; prato = restaurante/comida; pata = pet shop/veterinária' },
    nome_negocio: { type: 'string' }, responsavel: { type: 'string', description: 'nome da pessoa' }, cidade: { type: 'string' }, bairro: { type: 'string' }, instagram: { type: 'string' }, email: { type: 'string' },
    servicos: { type: 'string' }, carro_chefe: { type: 'string' }, diferencial: { type: 'string' }, publico: { type: 'string' }, tom: { type: 'string' }, horario: { type: 'string' },
    preco_medio: { type: 'string' }, evitar: { type: 'string' }, tem_imagens: { type: 'string', enum: ['sim', 'nao'], description: 'resposta ao pedido de logo e fotos' }, novidades: { type: 'string', description: 'novidades/promoções do mês' }, preferencias: { type: 'string', description: 'preferências de arte, texto, logo' }, extra: { type: 'string' },
  } } },
  { name: 'usar_imagens', description: 'Diz o que é cada imagem que a pessoa mandou (pelo número #).', input_schema: { type: 'object', properties: { logo: { type: 'integer', description: 'número da imagem que é o logo' }, fotos: { type: 'array', items: { type: 'integer' }, description: 'números das imagens que são fotos do negócio' } } } },
  { name: 'gerar_teste', description: 'Gera os 2 posts grátis com o que já foi coletado. Os posts chegam nesta conversa sozinhos em ~2 minutos.', input_schema: { type: 'object', properties: {} } },
  { name: 'pedir_ajuste', description: 'Refaz um post com o pedido do cliente (no teste ou no mês). O post novo chega aqui sozinho.', input_schema: { type: 'object', properties: { post: { type: 'integer', description: 'número do post (1, 2...)' }, pedido: { type: 'string' } }, required: ['post', 'pedido'] } },
  { name: 'aprovar_teste', description: 'Registra que o cliente aprovou o teste (passa pra venda).', input_schema: { type: 'object', properties: {} } },
  { name: 'gerar_cobranca', description: 'Cria (ou reabre) a fatura da assinatura e devolve o link pra mandar. No link a pessoa escolhe Pix ou cartão. Só passe forma se ELE pediu uma forma específica.', input_schema: { type: 'object', properties: { nome_completo: { type: 'string' }, cpf_cnpj: { type: 'string' }, email: { type: 'string' }, forma: { type: 'string', enum: ['cartao', 'pix', 'tanto_faz'], description: 'tanto_faz (padrão): ele escolhe no link' } }, required: ['nome_completo', 'email'] } },
  { name: 'passar_para_humano', description: 'Chama alguém da equipe pra assumir a conversa.', input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] } },
]

// ---------- as ferramentas ----------
const CTX = ['servicos', 'carro_chefe', 'diferencial', 'publico', 'tom', 'horario', 'preco_medio', 'evitar', 'novidades', 'preferencias', 'extra']
async function ferramenta(cv: any, nome: string, inp: any): Promise<string> {
  if (nome === 'salvar_dados') {
    if (inp.marca && ['salao', 'prato', 'pata'].includes(inp.marca) && !cv.cliente_id) await atualizaCv(cv, { marca: inp.marca })
    if (cv.cliente_id) {
      const c: any = await db.um('clientes', { id: cv.cliente_id }), campos: any = {}, ctx = { ...(c.contexto || {}) }
      for (const k of ['nome_negocio', 'responsavel', 'cidade', 'bairro', 'email']) if (inp[k]) campos[k] = t(inp[k], 160)
      if (inp.instagram) campos.instagram = t(inp.instagram, 60).replace(/^@/, '')
      for (const k of CTX) if (inp[k]) ctx[k] = k === 'preferencias' && ctx[k] ? (ctx[k] + ' · ' + t(inp[k], 300)).slice(-900) : t(inp[k], 600)
      await db.atualiza('clientes', { id: c.id }, { ...campos, contexto: ctx })
      return 'salvo na memória do cliente'
    }
    const r = cv.rascunho || {}, dados = { ...(r.dados || {}) }
    for (const [k, v] of Object.entries(inp)) if (v && k !== 'marca') dados[k] = t(v as string, 600)
    await atualizaCv(cv, { rascunho: { ...r, dados }, fase: cv.fase === 'novo' ? 'entrevista' : cv.fase })
    return 'salvo'
  }
  if (nome === 'usar_imagens') {
    const r = cv.rascunho || {}, midias = [...(r.midias || [])]
    if (inp.logo && midias[inp.logo - 1]) midias[inp.logo - 1] = { ...midias[inp.logo - 1], uso: 'logo' }
    for (const i of inp.fotos || []) if (midias[i - 1]) midias[i - 1] = { ...midias[i - 1], uso: 'foto' }
    await atualizaCv(cv, { rascunho: { ...r, midias } })
    if (cv.cliente_id) await aplicaImagens(cv)
    return `ok: ${midias.filter(m => m.uso === 'logo').length ? 'logo marcado; ' : ''}${midias.filter(m => m.uso === 'foto').length} foto(s)`
  }
  if (nome === 'gerar_teste') return geraTeste(cv)
  if (nome === 'pedir_ajuste') return pedeAjuste(cv, +inp.post, t(inp.pedido, 500))
  if (nome === 'aprovar_teste') {
    if (cv.cliente_id) await db.evento('teste_aprovado', { cliente_id: cv.cliente_id, marca: cv.marca, detalhe: { origem: 'whatsapp' } })
    await atualizaCv(cv, { fase: 'venda', etapa: 'quer_assinar' })
    return 'aprovado: comemore em 1 frase, diga que esse estilo virou o padrão dele e PERGUNTE, leve, se ele quer saber como receber 8 assim todo mês. Só apresente a assinatura quando ele disser que sim (ou perguntar preço/como funciona)'
  }
  if (nome === 'gerar_cobranca') return geraCobranca(cv, inp)
  if (nome === 'passar_para_humano') {
    await atualizaCv(cv, { modo: 'humano' })
    avisaDono('WhatsApp: assumir conversa', `${cv.nome || cv.telefone}: ${t(inp.motivo, 160)}`)
    return 'a equipe foi chamada; diga que alguém continua a conversa aqui mesmo em breve'
  }
  return 'ferramenta desconhecida'
}

// as imagens marcadas viram logo e fotos do cliente
async function aplicaImagens(cv: any) {
  const c: any = await db.um('clientes', { id: cv.cliente_id }); if (!c) return
  const r = cv.rascunho || {}, midias: any[] = r.midias || []
  const logo = midias.find(m => m.uso === 'logo' && !m.aplicada)
  if (logo) await db.atualiza('clientes', { id: c.id }, { logo_path: logo.path })
  const fotos = midias.filter(m => m.uso === 'foto' && !m.aplicada)
  const ja = await db.lista('fotos', { cliente_id: c.id })
  for (const f of fotos.slice(0, Math.max(0, 20 - ja.length))) await db.insere('fotos', { cliente_id: c.id, path: f.path })
  if (fotos.length && c.fotos_modo !== 'enviar') await db.atualiza('clientes', { id: c.id }, { fotos_modo: 'enviar' })
  await atualizaCv(cv, { rascunho: { ...r, midias: midias.map(m => (m.uso ? { ...m, aplicada: true } : m)) } })
}

async function geraTeste(cv: any) {
  if (!cv.marca) return 'falta saber o tipo de negócio (salvar_dados.marca)'
  const dados = (cv.rascunho || {}).dados || {}
  if (cv.cliente_id) {
    const teste = await db.um('lotes', { cliente_id: cv.cliente_id, tipo: 'teste' })
    if (teste) return `esse cliente já tem o teste (${teste.status}); não dá pra gerar outro`
  }
  // trava de testes repetidos: o mesmo WhatsApp já teve teste (pelo site ou aqui) → não gera de novo
  if (!cv.simulado) {
    const ja = (await db.lista('clientes', { whatsapp: cv.telefone }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
    if (ja && !ja.exemplo) { await atualizaCv(cv, { cliente_id: ja.id, marca: ja.marca, fase: ja.status === 'ativo' ? 'cliente' : 'aprovando_teste' }); return `esse WhatsApp já fez o teste grátis (${ja.nome_negocio}); não gera outro. Ofereça os posts que ele já recebeu (link da área) e siga pra venda` }
  }
  const temImagens = !!dados.tem_imagens || ((cv.rascunho || {}).midias || []).length > 0
  const faltam = ['nome_negocio', 'cidade'].filter(k => !dados[k]).concat(dados.servicos || dados.carro_chefe ? [] : ['o que vende']).concat(temImagens ? [] : ['perguntar se tem logo e fotos (salvar_dados.tem_imagens)'])
  if (faltam.length) return 'ainda falta: ' + faltam.join(', ')
  const r = cv.rascunho || {}
  const c = await db.insere('clientes', {
    codigo: novoCodigo(), marca: cv.marca, status: 'teste', exemplo: !!cv.simulado, origem: 'whatsapp',
    nome_negocio: t(dados.nome_negocio, 120), responsavel: t(dados.responsavel || cv.nome, 120), whatsapp: cv.telefone, email: t(dados.email, 160).toLowerCase(),
    cidade: t(dados.cidade, 80), bairro: t(dados.bairro, 80), instagram: t(dados.instagram, 60).replace(/^@/, ''),
    contexto: Object.fromEntries(CTX.filter(k => dados[k]).map(k => [k, t(dados[k], 600)])),
    fotos_modo: (r.midias || []).some((m: any) => m.uso === 'foto') ? 'enviar' : 'ia', sessao: 'whatsapp',
  })
  await atualizaCv(cv, { cliente_id: c.id, fase: 'gerando_teste' })
  await aplicaImagens(cv)
  await db.insere('lotes', { cliente_id: c.id, tipo: 'teste', qtd: cfg.postsTeste, status: 'fila' })
  await db.evento('lead', { cliente_id: c.id, marca: c.marca, detalhe: { origem: 'whatsapp' } })
  await db.evento('teste_na_fila', { cliente_id: c.id, marca: c.marca })
  if (!cv.simulado) avisaDono('teste pedido (WhatsApp)', `${cfg.marcas[c.marca as Marca].nome} · ${c.nome_negocio} (${c.cidade})`)
  return `teste na fila (código ${c.codigo}); os 2 posts chegam nesta conversa sozinhos em uns 2 minutos`
}

async function pedeAjuste(cv: any, num: number, pedido: string) {
  if (!cv.cliente_id || !pedido) return 'sem cliente ou sem pedido'
  const c: any = await db.um('clientes', { id: cv.cliente_id }), v = await vistaCliente(c)
  const lote = c.status === 'ativo' ? v.lotes.find((l: any) => l.tipo === 'mes') : v.lotes.find((l: any) => l.tipo === 'teste')
  if (!lote) return 'ainda não tem posts pra ajustar'
  if (c.status === 'ativo' && v.ajustes_restantes <= 0) return `os ${cfg.ajustesPorMes} ajustes do mês já foram usados`
  // 16/10: cada rodada de ajuste do teste mexe nos 2 posts: o limite conta rodadas, não lotes (antes 1 rodada gastava 2 dos 3)
  if (c.status !== 'ativo' && v.lotes.filter((l: any) => l.tipo === 'ajuste').length >= MAX_AJUSTES_TESTE * cfg.postsTeste) return `os ${MAX_AJUSTES_TESTE} ajustes do teste já foram usados: proponha assinar pra continuar ajustando no mês`
  // 16/10: depois do 1º ajuste o post vivo mora num lote de ajuste (o original vira "substituido" e sai da vista): procura lá também
  const doLote = new Set(v.lotes.filter((l: any) => l.id === lote.id || l.tipo === 'ajuste').map((l: any) => l.id))
  const p = v.posts.filter((x: any) => doLote.has(x.lote_id) && x.ordem === num).pop() // a lista vem por data: o último é o atual
  if (!p) return `não achei o post ${num}`
  if (p.status === 'ajuste_pedido') return 'esse post já está sendo refeito'
  await db.atualiza('posts', { id: p.id }, { status: 'ajuste_pedido', ajuste_pedido: pedido })
  await db.insere('lotes', { cliente_id: c.id, tipo: 'ajuste', mes: p.id, qtd: 1, status: 'fila' })
  await db.evento('ajuste_pedido', { cliente_id: c.id, marca: c.marca, detalhe: { post: p.id, texto: pedido, origem: 'whatsapp' } })
  return `ajuste pedido no post ${num}; o post novo chega aqui sozinho em uns 2 minutos`
}

async function geraCobranca(cv: any, inp: any) {
  if (!cv.cliente_id) return 'ainda não tem cliente (gere o teste antes)'
  const c: any = await db.um('clientes', { id: cv.cliente_id }), m = c.marca as Marca
  if (c.status === 'ativo') return 'esse cliente já é assinante'
  if (cfg.marcas[m].gateway === 'hotmart') {
    const { linkCheckout } = await import('./hotmart')
    const url = linkCheckout(m, { ...c, email: t(inp.email, 160) || c.email, responsavel: t(inp.nome_completo, 120) })
    if (!url) return 'o pagamento está fora do ar agora; passe para humano'
    await db.atualiza('clientes', { id: c.id }, { status: 'aguardando_pagamento', gateway: 'hotmart' })
    await db.evento('assinatura_aberta', { cliente_id: c.id, marca: m, detalhe: { origem: 'whatsapp', gateway: 'hotmart' } }) // 16/10: pro funil ("quis assinar")
    await atualizaCv(cv, { fase: 'aguardando_pagamento' })
    return 'link de pagamento: ' + url
  }
  const { criaAssinatura, renovaFatura } = await import('./asaas')
  if (c.asaas_assinatura) {
    const url = await renovaFatura(c.asaas_assinatura).catch(() => null)
    if (url) { await atualizaCv(cv, { fase: 'aguardando_pagamento' }); return 'fatura reaberta: ' + url }
  }
  const nome = t(inp.nome_completo, 120), doc = String(inp.cpf_cnpj || '').replace(/\D/g, ''), email = t(inp.email, 160).toLowerCase()
  if (!nome || !docOk(doc)) return 'CPF ou CNPJ inválido: peça pra conferir os números'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'e-mail inválido: peça pra conferir'
  const primeiro: number | undefined = undefined // 16/10: com o preço de teste (R$ 99) saiu a condição do 1º mês por R$ 100
  if (cv.simulado) { await atualizaCv(cv, { fase: 'aguardando_pagamento' }); return `fatura (simulação${primeiro ? ', 1º mês R$ 100' : ''}): https://www.asaas.com/i/simulacao` }
  try {
    const a = await criaAssinatura({ codigo: c.codigo, marcaNome: cfg.marcas[m].nome, nome, documento: doc, email, whatsapp: c.whatsapp, valor: cfg.marcas[m].preco, forma: inp.forma === 'pix' ? 'PIX' : inp.forma === 'cartao' ? 'CREDIT_CARD' : 'UNDEFINED', primeiroValor: primeiro })
    await db.atualiza('clientes', { id: c.id }, { status: 'aguardando_pagamento', documento: doc, email, asaas_customer: a.customer, asaas_assinatura: a.assinatura })
    await db.evento('assinatura_aberta', { cliente_id: c.id, marca: m, detalhe: { origem: 'whatsapp', primeiro_mes: primeiro || null } })
    await atualizaCv(cv, { fase: 'aguardando_pagamento' })
    avisaDono('WhatsApp: fatura aberta 💰', `${c.nome_negocio} (${c.cidade})${primeiro ? ' · 1º mês R$ 100' : ''}`, true)
    return `fatura criada${primeiro ? ' (1º mês R$ 100, depois R$ ' + cfg.marcas[m].preco + ')' : ''}: ` + a.fatura
  } catch (e: any) { return 'não deu pra criar a fatura (' + String(e.message).slice(0, 120) + '); passe para humano' }
}

// ---------- a conversa ----------
export async function atende(id: string) {
  const cv: any = await db.um('wa_conversas', { id })
  if (!cv || cv.modo !== 'ia' || cv.optout) return
  const msgs = await db.lista('wa_msgs', { conversa_id: id }, { ordem: 'criado_em' })
  const { c, texto } = await retrato(cv)
  const m = ((c?.marca || cv.marca) as Marca | null)
  const sabe = m ? (emEspanhol(m) ? SABE_ES(m) : SABE(m)) + '\n\n' + OFERTA(m) : ''
  const historico = msgs.slice(-40).map(x => `${x.autor === 'cliente' ? 'CLIENTE' : x.autor === 'sistema' ? 'SISTEMA (mensagem automática já enviada)' : x.autor === 'dono' ? 'EQUIPE' : 'TU'}: ${x.texto}`).join('\n')
  // 16/10: a IA VÊ as imagens que a pessoa mandou (antes só lia "(mandou a imagem #n)" e ficava perguntando qual era o logo)
  const midias: any[] = ((cv.rascunho || {}).midias || []).map((md: any, i: number) => ({ ...md, n: i + 1 })).filter((md: any) => /^image\//.test(md.mime || 'image/')).slice(-6)
  const links = midias.length ? await db.links(midias.map((md: any) => md.path)).catch(() => [] as any[]) : []
  const imagens: any[] = []
  midias.forEach((md: any, i: number) => { if (links[i]) imagens.push({ type: 'text', text: `Imagem #${md.n} que a pessoa mandou (marcada como: ${md.uso || 'ainda não definido'}):` }, { type: 'image', source: { type: 'url', url: links[i] } }) })
  const pedidoFinal = `Responde a(s) última(s) mensagem(ns) do cliente. Usa as ferramentas quando precisar agir.${imagens.length ? ' As imagens que ele mandou estão acima: OLHA pra elas antes de perguntar qualquer coisa sobre elas (o que é logo, o que é foto, o que aparece).' : ''}
FORMATO OBRIGATÓRIO DA RESPOSTA: cada mensagem que vai pro WhatsApp vai entre <whatsapp> e </whatsapp> (1 a 3 mensagens). Tudo que estiver fora dessas marcas é descartado e o cliente nunca vê. Nada de raciocínio dentro das marcas. Se não for responder nada, escreve <whatsapp>-</whatsapp>.`
  const conversa: any[] = [{ role: 'user', content: [...imagens, { type: 'text', text: `${texto}\n\nCONVERSA:\n${historico}\n\n${pedidoFinal}` }] }]
  let resposta = ''
  for (let volta = 0; volta < 6; volta++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 1500, thinking: { type: 'between_tools' }, system: REGRAS(m) + (sabe ? '\n\nO QUE TU SABES DO PRODUTO:\n' + sabe : ''), tools: FERRAMENTAS, messages: conversa }),
      signal: AbortSignal.timeout(60000),
    })
    const j = await r.json()
    if (!r.ok) throw new Error('IA ' + r.status + ' ' + JSON.stringify(j).slice(0, 200))
    conversa.push({ role: 'assistant', content: j.content })
    const usos = j.content.filter((b: any) => b.type === 'tool_use')
    if (!usos.length) { resposta = j.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim(); break }
    const resultados = []
    for (const u of usos) {
      const out = await ferramenta(cv, u.name, u.input || {}).catch((e: any) => 'erro: ' + e.message)
      await db.insere('wa_msgs', { conversa_id: cv.id, autor: 'sistema', tipo: 'acao', texto: `[${u.name}] ${JSON.stringify(u.input || {}).slice(0, 300)} → ${out}`, status: 'interno' })
      resultados.push({ type: 'tool_result', tool_use_id: u.id, content: out })
    }
    conversa.push({ role: 'user', content: resultados })
  }
  // 16/10: só vai pro WhatsApp o que está entre <whatsapp></whatsapp>; o resto é raciocínio e fica de fora
  const marcadas = [...resposta.matchAll(/<whatsapp>([\s\S]*?)<\/whatsapp>/gi)].map(x => x[1].trim()).filter(x => x && x !== '-')
  let partes: string[]
  if (marcadas.length || /<whatsapp>/i.test(resposta)) partes = marcadas.slice(0, 3)
  else {
    // sem as marcas (raro): rede de segurança, tira parágrafo de raciocínio (fala do cliente em 3ª pessoa, das ferramentas, do que "vou" fazer)
    const limpo = resposta.split(/\n\s*\n/).filter(p => !/(\b(a ferramenta|chamar a ferramenta|gerar_cobranca|salvar_dados|usar_imagens|pedir_ajuste|passar_para_humano)\b|^\s*(o|a) client[ea]\b|\b(o|a) client[ea] (não|nao|disse|quer|pediu|está|esta|respondeu|mandou|escreveu)\b|\bvou (perguntar|chamar|registrar|marcar) (antes|de novo)\b|não deu pra saber)/i.test(p)).join('\n\n').trim()
    partes = limpo && limpo !== '-' ? limpo.split(/\n\s*---+\s*\n/).map(s => s.trim()).filter(Boolean).slice(0, 3) : []
  }
  if (!partes.length) return
  const atual: any = await db.um('wa_conversas', { id })
  for (const p of partes) await registraSaida(atual, 'ia', p, await enviaTexto(atual.telefone, p))
  await db.atualiza('wa_conversas', { id }, { ia_respostas: (atual.ia_respostas || 0) + 1 })
}

// ---------- as mensagens automáticas ----------
const conversaDoCliente = async (c: any): Promise<any> => (c?.whatsapp ? await db.um('wa_conversas', { telefone: c.whatsapp }) : null)
const ativa = (cv: any) => cv && cv.modo !== 'encerrada' && !cv.optout

// fim de um lote (o gerador terminou): o teste vai em imagens, o ajuste também; o mês vai pra aprovação
export async function notificaFimLote(c: any, l: any) {
  const cv = await conversaDoCliente(c)
  // 16/10: teste feito pelo site (sem conversa ainda) → o WhatsApp chama a pessoa na mesma hora, com o modelo aprovado
  if (!cv && l.tipo === 'teste' && c?.whatsapp && !c.exemplo && c.status === 'teste') {
    const { chamaNaHora } = await import('./vendedor')
    const r = await chamaNaHora(c).catch((e: any) => 'erro ' + e?.message)
    console.log('oito whats chama na hora', c.codigo, r)
    return
  }
  if (!ativa(cv)) return
  const v = await vistaCliente(c), m = c.marca as Marca, es = emEspanhol(m)
  if (!janelaAberta(cv) && !ehSimulado(cv.telefone)) {
    // fora das 24 h: só modelo aprovado (o do teste pronto já existe; o do mês usa o mesmo aviso com link da área)
    if (l.tipo === 'teste') {
      const { enviaModeloNovo } = await import('./vendedor')
      const r = await enviaModeloNovo(cv.telefone, es ? 'oito_es_prueba_lista' : 'oito_teste_pronto', es ? 'es' : 'pt_BR', [String(c.responsavel || c.nome_negocio).split(' ')[0], cfg.marcas[m].nome, c.nome_negocio], [{ tipo: 'url', indice: 0, valor: `${m}/teste.html?c=${c.codigo}` }])
      await registraSaida(cv, 'sistema', `[modelo ${r.modelo}]`, r, 'modelo')
    }
    return
  }
  const manda = async (txt: string) => registraSaida(cv, 'sistema', txt, await enviaTexto(cv.telefone, txt))
  const imagem = async (p: any, leg: string) => registraSaida(cv, 'sistema', `[imagem] ${leg}`, await enviaImagem(cv.telefone, p.url, leg), 'imagem')
  if (l.tipo === 'teste') {
    const posts = v.posts.filter((p: any) => p.lote_id === l.id).sort((a: any, b: any) => a.ordem - b.ordem)
    for (const p of posts) await imagem(p, `Post ${p.ordem}: ${String(p.titulo || '').replace(/\*/g, '')}\n\n${p.legenda || ''}`.slice(0, 1000))
    await manda(es ? '¡Listo, así quedaron! 👆 Cuéntame qué te parecieron. Si te gustan, dime "aprobado"; si quieres cambiar algo, dime el número del post y qué cambiarías, que lo ajusto.'
      : 'Prontinho, ficaram assim! 👆 Me conta o que achou. Se estiver do seu jeito, é só dizer "aprovado"; se quiser trocar alguma coisa, me diz o número do post e o que mudar, que eu ajusto.')
    await db.atualiza('wa_conversas', { id: cv.id }, { fase: 'aprovando_teste' })
  } else if (l.tipo === 'ajuste') {
    const novo = v.posts.filter((p: any) => p.lote_id === l.id)[0]
    if (novo) { await imagem(novo, `Post ${novo.ordem} ajustado: ${String(novo.titulo || '').replace(/\*/g, '')}`); await manda(es ? '¿Y ahora? ¿Así está bien?' : 'E agora, ficou do jeito que você queria?') }
  } else if (l.tipo === 'mes') {
    const link = cfg.url(m, 'conta.html?c=' + c.codigo)
    await manda(es ? `¡Tus ${cfg.postsMes} posts del mes están listos para aprobar! Míralos aquí: ${link}\nSi quieres cambiar alguno, dime el número del post y qué cambiar.`
      : `Seus ${cfg.postsMes} posts do mês estão prontos pra aprovar! Veja aqui: ${link}\nSe quiser mudar algum, me diz o número do post e o que mudar. Lá na área você também conecta o Instagram pra eles saírem sozinhos.`)
    await db.atualiza('wa_conversas', { id: cv.id }, { fase: 'cliente' })
  }
}

export async function notificaPagamento(c: any) {
  const cv = await conversaDoCliente(c); if (!ativa(cv) || !janelaAberta(cv)) return
  const es = emEspanhol(c.marca as Marca)
  const txt = es ? `¡Pago confirmado! 🎉 Ya estoy preparando tus ${cfg.postsMes} posts del mes. Te aviso aquí apenas estén listos (unos 30 minutos).

Esta es tu área de cliente, guárdala: ahí quedan todos tus posts de todos los meses, con los textos y el historial. ${cfg.url(c.marca as Marca, 'conta.html?c=' + c.codigo)}` : `Pagamento confirmado! 🎉 Já estou preparando os seus ${cfg.postsMes} posts do mês. Te aviso aqui assim que ficarem prontos (uns 30 minutos).

Essa é a sua área do cliente, salva ela: ali ficam todos os seus posts, de todos os meses, com as legendas e o histórico. ${cfg.url(c.marca as Marca, 'conta.html?c=' + c.codigo)}

E a cada mês eu fico mais afiado no seu negócio: tudo o que você me conta, aprova e ajusta fica guardado pro próximo mês. Ideia ou foto boa que surgir no dia a dia, já me manda aqui.`
  await registraSaida(cv, 'sistema', txt, await enviaTexto(cv.telefone, txt))
  await db.atualiza('wa_conversas', { id: cv.id }, { fase: 'cliente', etapa: 'assinou' })
}

export async function notificaPublicado(c: any, link: string | null) {
  const cv = await conversaDoCliente(c); if (!ativa(cv) || !janelaAberta(cv)) return
  const txt = emEspanhol(c.marca as Marca) ? `Acabo de publicar en tu Instagram ✅ ${link || ''}`.trim() : `Acabei de postar no seu Instagram ✅ ${link || ''}`.trim()
  await registraSaida(cv, 'sistema', txt, await enviaTexto(cv.telefone, txt))
}
