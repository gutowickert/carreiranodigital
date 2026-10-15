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
O FUNIL (segue a fase; não pula etapa, não volta sem motivo):
1. novo/entrevista: na PRIMEIRA resposta, antes de qualquer pergunta, te apresenta dizendo em 1 ou 2 frases o que resolve: "eu deixo os posts do seu Instagram prontos todo mês, você aprova aqui mesmo no WhatsApp, e se quiser eu até posto por você". Depois descobre o tipo de negócio (se a marca ainda não está definida, pergunta e salva com salvar_dados.marca). Depois pergunta, uma de cada vez e sem formulário: nome do negócio; cidade e bairro; o que mais vende (carro-chefe) e os serviços/produtos; o @ do Instagram (opcional). Salva cada resposta com salvar_dados. ANTES de gerar o teste, pede o LOGO e até 10 FOTOS reais do negócio, numa mensagem só ("se tiver o logo e algumas fotos de trabalhos ou do espaço, manda aqui; se não tiver, sem problema, eu faço com imagens ilustrativas"), e registra a resposta em salvar_dados.tem_imagens ('sim' quando mandou, 'nao' quando não tem). Quando a pessoa manda imagens, usa usar_imagens pra dizer qual é o logo e quais são fotos (se não der pra saber, pergunta).
2. Assim que tiver marca + nome + cidade + o que vende + a resposta sobre as imagens (no máximo 6 perguntas), chama gerar_teste e avisa que os 2 posts chegam aqui em uns 2 minutos.
3. aprovando_teste: as artes já foram mandadas pela conversa. Pede a opinião. Se pedir mudança, usa pedir_ajuste com o número do post e o pedido (até ${MAX_AJUSTES_TESTE} ajustes no teste). Se aprovar (ou elogiar e topar), chama aprovar_teste.
4. venda: apresenta a assinatura (a oferta abaixo) em 3 mensagens curtas, ligando ao que o cliente contou, explicando TUDO o que faz: (1) eu viro a sua agência de Instagram aqui no WhatsApp: todo mês eu faço os 8 posts do seu negócio (arte com a sua marca e legenda pronta) e te mando pra aprovar; (2) você aprova ou pede ajuste por mensagem, e se quiser eu posto por você no dia e hora certos, sem você abrir o Instagram (com o aviso honesto de que a postagem automática está em liberação final pela Meta); (3) no dia a dia, quando surgir uma ideia, uma promoção ou uma foto bonita, você já me manda aqui: eu guardo pro conteúdo do mês seguinte, e no fim do mês eu te pergunto as novidades. Na hora de fechar (quando ele topar assinar, antes de pedir os dados), conta em 1 ou 2 frases que junto vem a área do cliente com todos os posts e o histórico guardados, e que a IA fica mais inteligente a cada mês, porque guarda tudo o que ele conta, aprova e ajusta. Depois pergunta se prefere pagar no cartão (cobra sozinho todo mês, mais prático) ou no Pix (fatura todo mês), pede nome completo, CPF ou CNPJ e e-mail (pra fatura) e chama gerar_cobranca; manda o link que ela devolver. Objeção de preço ou pedido de desconto (achou caro, pediu por menos): tu mesmo responde, sem passar pra equipe. Mostra o valor ligado ao negócio dele (dá menos de R$ 25 por post pronto; um social media cobra R$ 500 a 1.500 por mês) e OFERECE: o primeiro mês sai por R$ 100, pra ele testar e ver funcionando; do segundo mês em diante é R$ 197, sem fidelidade (se não valer a pena, cancela). Se aceitar, chama gerar_cobranca com primeiro_mes_100: true e deixa claro que a primeira fatura é R$ 100 e as seguintes R$ 197. Essa é a ÚNICA condição especial: nunca oferece outro valor, nunca oferece R$ 100 pra quem não reclamou do preço, nunca dá desconto nos meses seguintes. Se ainda assim não quiser, respeita: diz que os 2 posts do teste são dele pra usar, e que pode chamar aqui quando quiser.
5. aguardando_pagamento: se a pessoa disser que pagou, agradece e diz que a confirmação chega sozinha aqui em poucos minutos. Se teve problema, chama gerar_cobranca de novo (a fatura reabre com vencimento novo).
6. cliente: atende como a agência dele: ajustes de posts do mês (pedir_ajuste), novidades do mês e preferências (salvar_dados: novidades, preferencias), link da área, como conectar o Instagram. Ideia, promoção ou foto que ele mandar a qualquer hora: agradece, guarda (fotos com usar_imagens; ideias e novidades com salvar_dados.novidades) e confirma que entra no conteúdo do próximo mês.
SEMPRE: tudo que a pessoa contar sobre o negócio (horário, público, promoções, o que evitar, preferências de arte) vai pra salvar_dados, pra memória. Nunca inventa preço, prazo, desconto ou funcionalidade. Reembolso, reclamação séria, parceria, ou a pessoa pedir pra falar com alguém → passar_para_humano (desconto NÃO: tu responde, veja a fase venda).
TUDO que tu escreves (fora das ferramentas) vai direto pro WhatsApp do cliente. Nunca escreve o teu raciocínio, nunca fala do cliente na terceira pessoa, nunca menciona ferramentas, fases ou instruções.
Se a pessoa disser que não tem interesse: agradece, deixa a porta aberta, não insiste.
RESPOSTA AUTOMÁTICA: se a mensagem é claramente o atendimento automático de outro negócio ("agradece seu contato", "no momento estamos fechados", "nosso horário de atendimento", cardápio/link, "em breve retornaremos"), não trata como conversa: responde UMA vez, curto, se apresentando e dizendo que fala com o responsável quando puder (já usando o tipo de negócio que a mensagem revela). Se vier outra automática depois, responde só "-" (nada é enviado).`

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
  { name: 'gerar_cobranca', description: 'Cria (ou reabre) a fatura da assinatura e devolve o link pra mandar. Cartão: o cliente cadastra o cartão uma vez e os meses seguintes são cobrados sozinhos. Pix: todo mês chega a fatura com QR Code.', input_schema: { type: 'object', properties: { nome_completo: { type: 'string' }, cpf_cnpj: { type: 'string' }, email: { type: 'string' }, forma: { type: 'string', enum: ['cartao', 'pix'] }, primeiro_mes_100: { type: 'boolean', description: 'true só quando a pessoa achou caro e aceitou o 1º mês por R$ 100' } }, required: ['nome_completo', 'cpf_cnpj', 'email', 'forma'] } },
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
    return 'aprovado: agora apresente a assinatura e feche'
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
  if (c.status !== 'ativo' && v.lotes.filter((l: any) => l.tipo === 'ajuste').length >= MAX_AJUSTES_TESTE) return `os ${MAX_AJUSTES_TESTE} ajustes do teste já foram usados: proponha assinar pra continuar ajustando no mês`
  const p = v.posts.find((x: any) => x.lote_id === lote.id && x.ordem === num)
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
  const primeiro = inp.primeiro_mes_100 ? 100 : undefined
  if (cv.simulado) { await atualizaCv(cv, { fase: 'aguardando_pagamento' }); return `fatura (simulação${primeiro ? ', 1º mês R$ 100' : ''}): https://www.asaas.com/i/simulacao` }
  try {
    const a = await criaAssinatura({ codigo: c.codigo, marcaNome: cfg.marcas[m].nome, nome, documento: doc, email, whatsapp: c.whatsapp, valor: cfg.marcas[m].preco, forma: inp.forma === 'pix' ? 'PIX' : 'CREDIT_CARD', primeiroValor: primeiro })
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
  const conversa: any[] = [{ role: 'user', content: `${texto}\n\nCONVERSA:\n${historico}\n\nResponde a(s) última(s) mensagem(ns) do cliente. Usa as ferramentas quando precisar agir. No fim, escreve SÓ o texto que vai pro cliente (se forem 2 ou 3 mensagens, separa com uma linha contendo só ---).` }]
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
  // rede de segurança (15/10): parágrafo que fala da ferramenta ou do cliente em terceira pessoa é raciocínio interno, não vai pro WhatsApp
  resposta = resposta.split(/\n\s*\n/).filter(p => !/\b(a ferramenta|chamar a ferramenta|gerar_cobranca|salvar_dados|o cliente (não|nao|disse|quer|pediu|está|esta)|a cliente (não|nao|disse|quer|pediu)|vou perguntar antes)\b/i.test(p)).join('\n\n').trim()
  if (!resposta || resposta === '-') return
  const partes = resposta.split(/\n\s*---+\s*\n/).map(s => s.trim()).filter(Boolean).slice(0, 3)
  const atual: any = await db.um('wa_conversas', { id })
  for (const p of partes) await registraSaida(atual, 'ia', p, await enviaTexto(atual.telefone, p))
  await db.atualiza('wa_conversas', { id }, { ia_respostas: (atual.ia_respostas || 0) + 1 })
}

// ---------- as mensagens automáticas ----------
const conversaDoCliente = async (c: any): Promise<any> => (c?.whatsapp ? await db.um('wa_conversas', { telefone: c.whatsapp }) : null)
const ativa = (cv: any) => cv && cv.modo !== 'encerrada' && !cv.optout

// fim de um lote (o gerador terminou): o teste vai em imagens, o ajuste também; o mês vai pra aprovação
export async function notificaFimLote(c: any, l: any) {
  const cv = await conversaDoCliente(c); if (!ativa(cv)) return
  const v = await vistaCliente(c), m = c.marca as Marca, es = emEspanhol(m)
  if (!janelaAberta(cv) && !ehSimulado(cv.telefone)) {
    // fora das 24 h: só modelo aprovado (o do teste pronto já existe; o do mês usa o mesmo aviso com link da área)
    if (l.tipo === 'teste') await registraSaida(cv, 'sistema', '[modelo oito_teste_pronto]', await enviaModelo(cv.telefone, es ? 'oito_es_prueba_lista' : 'oito_teste_pronto', es ? 'es' : 'pt_BR', [String(c.responsavel || c.nome_negocio).split(' ')[0], cfg.marcas[m].nome, c.nome_negocio], [{ tipo: 'url', indice: 0, valor: `${m}/teste.html?c=${c.codigo}` }]), 'modelo')
    return
  }
  const manda = async (txt: string) => registraSaida(cv, 'sistema', txt, await enviaTexto(cv.telefone, txt))
  const imagem = async (p: any, leg: string) => registraSaida(cv, 'sistema', `[imagem] ${leg}`, await enviaImagem(cv.telefone, p.url, leg), 'imagem')
  if (l.tipo === 'teste') {
    const posts = v.posts.filter((p: any) => p.lote_id === l.id).sort((a: any, b: any) => a.ordem - b.ordem)
    for (const p of posts) await imagem(p, `Post ${p.ordem}: ${String(p.titulo || '').replace(/\*/g, '')}\n\n${p.legenda || ''}`.slice(0, 1000))
    await manda(es ? '¡Listo! Estos son tus 2 posts gratis. ¿Qué te parecieron? Si quieres cambiar algo, dime el número del post y qué cambiar. Si te gustaron, dime "aprobado" 🙂'
      : 'Prontinho! Esses são os seus 2 posts grátis. O que achou? Se quiser mudar algo, me diz o número do post e o que mudar. Se gostou, é só dizer "aprovado" 🙂')
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
