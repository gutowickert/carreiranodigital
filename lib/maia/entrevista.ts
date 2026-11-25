// Maia: a ENTREVISTA DE IMPLANTAÇÃO da Maia online, feita pela própria Maia no WhatsApp (24/11, pedido do Guto).
// A implantação online era em 2 chamadas de vídeo. Agora: a Maia faz a entrevista inteira pelo WhatsApp e a reunião fica SÓ pra
// ligar e conferir as contas (WhatsApp/API, conta de anúncio, Instagram, portfólio), já com o acesso de administrador dado.
// Só com MAIA_ENTREVISTA_LIGADA=1 (sem ela nada muda: o dono cai na conversa de sempre, dono.ts).
//   - Começa: pelo painel (POST entrevista_comecar) ou quando a implantação é paga (cobranca.ts) num negócio da oferta online
//     (meta.implantacao = 'online', ou o celular do dono fora do RS e o negócio não marcado 'presencial').
//   - Antes de perguntar ela lê o Instagram, o site e o Google do negócio (lib/diagnostico) e já preenche o que der; nas perguntas,
//     CONFIRMA o que achou ("vi no seu Instagram que..., tá certo?") e só pergunta o que falta. Um bloco por vez, mensagens curtas.
//   - Áudio chega transcrito e foto/vídeo vira material do negócio (dono.ts, recebeDoDono): aqui só conta o que chegou.
//   - "pular", "depois", "não sei": salva o que já tem, segue pro próximo bloco e no fim entrega a lista do que ficou faltando.
//     Depois dá pra retomar só nesses pontos (POST entrevista_retomar, ou o dono pede "quero completar").
//   - Parte técnica (acessos, API, pixel, IDs) nunca é perguntada: é da reunião de contas. O único pedido técnico é o ACESSO DE
//     ADMINISTRADOR no portfólio empresarial (business.facebook.com) pro e-mail da equipe (MAIA_EMAIL_ACESSO), com passo a passo.
//   - Fim: resumo pra ele confirmar → o cadastro no formato do cadastro.json da skill implantacao-maia (o que o importar.mjs usa)
//     → aviso pra equipe com o resumo e o que falta → convite pra marcar a reunião de contas.
// O estado mora em negocios.meta.entrevista (JSON que já existe; o painel não apaga: metaSeguro). Nada de tabela nova.
import { maiaDb as db } from './db'
import { emJson } from './ia'
import { conversaDoDono, mandaTexto } from './canal'

export const entrevistaLigada = () => process.env.MAIA_ENTREVISTA_LIGADA === '1'
// o e-mail que recebe o convite de administrador no portfólio do cliente: o do Nando, que está ligado em tudo (24/11)
export const emailAcesso = () => (process.env.MAIA_EMAIL_ACESSO || 'debairros@hotmail.com').trim()
const MAX_TURNOS = 160

// ---------- os blocos ----------
// k = onde a resposta mora no cadastro; p = o que é (pra IA e pro resumo); net = dá pra achar na internet; opc = não entra no "falta"
export type Campo = { k: string; p: string; net?: boolean; opc?: boolean }
export type Bloco = { id: string; titulo: string; objetivo: string; campos: Campo[] }
export type Nicho = 'oficina' | 'otica' | 'outro'

const B_NEGOCIO: Bloco = { id: 'negocio', titulo: 'O negócio', objetivo: 'confirmar quem é o negócio e onde atende', campos: [
  { k: 'negocio.nome', p: 'nome do negócio (como o cliente conhece)', net: true },
  { k: 'negocio.dono_nome', p: 'nome de quem está falando (o dono)' },
  { k: 'negocio.cidade', p: 'cidade', net: true },
  { k: 'negocio.regiao', p: 'até onde atende / de onde vêm os clientes (bairros, cidades vizinhas)' },
  { k: 'ficha.endereco', p: 'endereço do jeito que o cliente tem que ler', net: true },
  { k: 'ficha.horario', p: 'dias e horário de atendimento', net: true },
  { k: 'ficha.provas', p: 'o que dá confiança: tempo de mercado, avaliações no Google, @ do Instagram', net: true, opc: true },
] }
const B_VENDE: Bloco = { id: 'vende', titulo: 'O que vende e quanto custa', objetivo: 'os serviços/produtos, o que mais sai e os preços que ela pode dizer', campos: [
  { k: 'ficha.produto', p: 'o que vende (serviços e produtos principais)', net: true },
  { k: 'ficha.mais_vendido', p: 'o que mais sai / o carro-chefe' },
  { k: 'ficha.preco', p: 'os preços que a Maia pode dizer (os fixos) e as faixas' },
  { k: 'ficha.preco_personalizado', p: 'o que só tem preço depois de avaliar, por quê, e qual o caminho (ex.: trazer o carro pra avaliar)', opc: true },
  { k: 'ficha.perguntas', p: 'as perguntas que os clientes mais fazem, com a resposta dele (lista de {pergunta, resposta})', opc: true },
] }
const B_OFICINA: Bloco = { id: 'oficina', titulo: 'Coisas da oficina', objetivo: 'o que a Maia precisa saber pra atender cliente de oficina', campos: [
  { k: 'oficina.servicos', p: 'serviços que faz (mecânica geral, câmbio, retífica, elétrica, ar-condicionado, suspensão, freio...)', net: true },
  { k: 'oficina.marcas', p: 'marcas e tipos de carro que atende ou em que é especialista (e o que não pega)' },
  { k: 'oficina.preco_fixo', p: 'o que tem preço fixo (troca de óleo, revisão) e o que depende de diagnóstico; se cobra o diagnóstico e quanto' },
  { k: 'oficina.garantia', p: 'garantia do serviço e das peças' },
  { k: 'oficina.leva_traz', p: 'guincho, leva e traz, carro reserva ou espera na oficina' },
  { k: 'oficina.agenda', p: 'precisa agendar? quanto tempo leva um serviço comum', opc: true },
] }
const B_OTICA: Bloco = { id: 'otica', titulo: 'Coisas da ótica', objetivo: 'o que a Maia precisa saber pra atender cliente de ótica', campos: [
  { k: 'otica.lentes', p: 'tipos de lente e marcas que trabalha (visão simples, multifocal, antirreflexo, filtro azul, transitions)' },
  { k: 'otica.receita', p: 'aceita receita de fora? até quantos meses de validade?' },
  { k: 'otica.exame', p: 'faz exame de vista com parceiro? onde, quanto custa, precisa agendar?' },
  { k: 'otica.prazo', p: 'prazo de entrega dos óculos (pronta entrega x laboratório)' },
  { k: 'otica.armacoes', p: 'armações e óculos de sol: faixas de preço e marcas' },
  { k: 'otica.crediario', p: 'crediário próprio, parcelamento, convênio' },
] }
const B_CLIENTE: Bloco = { id: 'cliente', titulo: 'Quem compra e por que de você', objetivo: 'o cliente ideal e a brecha: por que compram dele e não do vizinho', campos: [
  { k: 'ficha.publico', p: 'quem é o cliente que mais compra (e o que ele procura)' },
  { k: 'ficha.diferencial', p: 'por que os clientes escolhem ele e não a concorrência (o porquê só dele)' },
  { k: 'calendario.datas', p: 'épocas fortes do próprio negócio (lista de {nome, dia DD/MM, porque})', opc: true },
] }
const B_VENDA: Bloco = { id: 'venda', titulo: 'Como a venda acontece', objetivo: 'o caminho da conversa até fechar e os limites da Maia', campos: [
  { k: 'funil.etapas', p: 'como é a conversa até fechar, passo a passo (lista de {etapa, proximo_passo})' },
  { k: 'funil.sim', p: 'o que conta como venda fechada (agendou, trouxe o carro, pagou o sinal...)' },
  { k: 'ficha.pagamento', p: 'formas de pagamento' },
  { k: 'ficha.prazo', p: 'prazo de entrega/atendimento que pode prometer' },
  { k: 'atendimento.fechamento', p: 'quem fecha a venda: a equipe dele (padrão) ou a Maia', opc: true },
  { k: 'negocio.equipe_whatsapp', p: 'o WhatsApp de quem recebe o cliente pronto pra fechar (se não for o dono)', opc: true },
  { k: 'limites.desconto_maximo', p: 'desconto máximo que pode oferecer (ou nenhum)' },
  { k: 'limites.nunca_prometer', p: 'o que a Maia nunca pode prometer' },
  { k: 'limites.passar_pro_dono', p: 'quando ela deve passar a conversa pra ele na hora' },
  { k: 'retomada.regras', p: 'pode chamar de novo quem pediu orçamento e sumiu? tem algo que não pode dizer nessa hora?', opc: true },
] }
const B_NUMEROS: Bloco = { id: 'numeros', titulo: 'Os números pro anúncio', objetivo: 'o suficiente pra calcular quanto pode custar cada cliente', campos: [
  { k: 'trafego.ticket_medio', p: 'valor médio de uma venda (R$)' },
  { k: 'trafego.margem_por_venda', p: 'quanto sobra de uma venda média, tirando peça/produto (R$ ou %)' },
  { k: 'trafego.ciclo_venda_dias', p: 'quantos dias entre o primeiro contato e fechar (no comum)' },
  { k: 'numeros.clientes_mes', p: 'quantos clientes atende por mês hoje e quantos a mais dá conta', opc: true },
  { k: 'trafego.servico_foco', p: 'o que anunciar primeiro: o serviço/produto que dá mais lucro e tem procura' },
  { k: 'trafego.raio', p: 'até onde vale anunciar (km ou bairros/cidades de onde o cliente vem até ele)' },
  { k: 'negocio.verba_dia', p: 'quanto pode investir por dia em anúncio (sugestão: R$ 20 a R$ 30)' },
] }
const B_JEITO: Bloco = { id: 'jeito', titulo: 'Jeito de falar e de aparecer', objetivo: 'como a Maia fala com os clientes dele e como ele aparece nos anúncios', campos: [
  { k: 'atendimento.tom.pessoa', p: 'tratar os clientes por "você" ou por "tu"' },
  { k: 'atendimento.tom.estilo', p: 'estilo: mais formal, leve ou bem descontraído', net: true },
  { k: 'material.aparece', p: 'aparece nos vídeos ou prefere imagens do dia a dia com voz por cima' },
  { k: 'conteudo.temas', p: 'o que gosta de mostrar no Instagram e o que NÃO quer que apareça (cliente, placa, preço, concorrente...)' },
  { k: 'dono.aprovacao', p: 'quem aprova anúncios e posts pelo celular (ele ou outra pessoa) e o melhor horário pra receber avisos e relatório' },
  { k: 'marca.logo', p: 'mandar a logo aqui no WhatsApp (ou dizer que não tem)', opc: true },
] }
const B_MATERIAL: Bloco = { id: 'material', titulo: 'Fotos, vídeos e clientes de sempre', objetivo: 'material real pros anúncios e posts, e a lista de clientes pro recado', campos: [
  { k: 'material.fotos', p: 'mandar fotos e vídeos reais (uns 10): fachada, equipe trabalhando, serviço feito, antes e depois' },
  { k: 'recado_base.ligado', p: 'tem lista dos clientes de sempre (planilha ou contatos)? quer o recado pra base?', opc: true },
] }
const B_ACESSO: Bloco = { id: 'acesso', titulo: 'Acesso ao portfólio da empresa', objetivo: 'ele dar acesso de ADMINISTRADOR no portfólio empresarial da Meta pro e-mail da equipe, pra ligar página, Instagram, conta de anúncio, WhatsApp e pixel', campos: [
  { k: 'contas.portfolio', p: 'tem portfólio empresarial (business.facebook.com)? qual é o nome dele (se tiver mais de um)' },
  { k: 'contas.acesso_enviado', p: 'mandar o convite de administrador no portfólio (ele confirma quando mandar: sim/não)' },
] }

export function nichoDe(neg: any): Nicho {
  const s = String(neg?.nicho || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/otica|oculos/.test(s)) return 'otica'
  if (/oficina|mecan|auto ?center|cambio|retifica|funilaria/.test(s)) return 'oficina'
  return 'outro'
}
export function blocosDo(nicho: Nicho): Bloco[] {
  return [B_NEGOCIO, B_VENDE, ...(nicho === 'oficina' ? [B_OFICINA] : nicho === 'otica' ? [B_OTICA] : []), B_CLIENTE, B_VENDA, B_NUMEROS, B_JEITO, B_MATERIAL, B_ACESSO]
}
export const TODOS_BLOCOS = [B_NEGOCIO, B_VENDE, B_OFICINA, B_OTICA, B_CLIENTE, B_VENDA, B_NUMEROS, B_JEITO, B_MATERIAL, B_ACESSO]
const blocoPorId = (id: string) => TODOS_BLOCOS.find(b => b.id === id)!
const campoPorK = (k: string) => TODOS_BLOCOS.flatMap(b => b.campos).find(c => c.k === k)

// o que NUNCA é perguntado: fica pra reunião de contas (com o acesso de administrador já dado) ou a equipe/a Maia resolve
export const FICA_PRA_REUNIAO = [
  'ligar o WhatsApp do negócio na Maia (API oficial) e conferir o número no botão do anúncio',
  'ligar a página do Facebook e o Instagram',
  'ligar a conta de anúncio e o cartão da verba (direto pra Meta)',
  'conferir o pixel e a medição',
  'conferir que o acesso de administrador ao portfólio chegou e foi aceito',
]
export const EQUIPE_RESOLVE = ['cores e estilo das peças (a equipe tira da logo e do Instagram)', 'a meta de custo por cliente (calculada da margem)', 'o que medir antes das primeiras vendas', 'o primeiro lote de anúncios (a Maia cria, a equipe e ele aprovam)']

// ---------- o estado ----------
export type Entrevista = {
  versao: 1
  status: 'andando' | 'resumo' | 'reuniao' | 'feita'
  nicho: Nicho
  blocos: string[]           // a ordem desta rodada (na retomada, só os que têm falta)
  bloco: number              // o bloco atual (índice em blocos)
  respostas: Record<string, any>
  achados: Record<string, { valor: any; fonte: string }>   // o que ela leu na internet e ainda não confirmou
  pulados: { bloco: string; campos: string[]; em: string }[]
  fontes: { instagram?: string | null; site?: string | null }
  lido_em?: string | null
  internet?: string | null   // o resumo do que ela leu (pra equipe)
  acesso?: { enviado: boolean; em: string; email: string } | null
  turnos: number
  comecou_em: string
  por: string
  retomando?: boolean
  terminou_em?: string | null
  faltando?: string[]
  cadastro?: any
  reuniao_preferencia?: string | null
}
export const entrevistaDo = (neg: any): Entrevista | null => neg?.meta?.entrevista || null
export const emAndamento = (neg: any) => { const e = entrevistaDo(neg); return !!e && ['andando', 'resumo', 'reuniao'].includes(e.status) }

async function guarda(neg: any, e: Entrevista) {
  const atual = (await db.um('negocios', { id: neg.id })) || neg
  const meta = { ...(atual.meta || {}), entrevista: e }
  await db.atualiza('negocios', { id: neg.id }, { meta })
  neg.meta = meta
}

const vazio = (v: any) => v == null || (typeof v === 'string' && (!v.trim() || /^a confirmar$/i.test(v.trim()))) || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)
const sabe = (e: Entrevista, k: string) => !vazio(e.respostas[k])
const ehPulado = (e: Entrevista, k: string) => e.pulados.some(p => p.campos.includes(k))
const semAc = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// o "pular" sem IA (a IA também pode marcar pulou quando a frase é outra)
export const pedePular = (t: string) => /^(\(audio\)\s*)?(pular|pula|pulo|pode pular|depois|deixa (isso )?(pra|para) depois|vamos? pular|nao sei|sei la|proxim[ao]|passa|outra hora|agora nao)\b/.test(semAc(t))
export const confirma = (t: string) => /^(\(audio\)\s*)?(sim|isso|isso mesmo|certo|ta certo|esta certo|correto|confirmo|confirmado|pode ser|ok|ta otimo|perfeito|tudo certo|exato|👍)\b/.test(semAc(t))
const pedeCompletar = (t: string) => /\b(completar|terminar|continuar|retomar)\b.*\b(entrevista|cadastro|faltou|falta)|\bo que (ficou )?falt/.test(semAc(t))

// o @ ou o site que ele mandou na conversa (pra ler a internet assim que aparecer)
export function fontesDoTexto(t: string): { instagram?: string; site?: string } {
  const s = String(t || '')
  const ig = s.match(/instagram\.com\/([A-Za-z0-9._]{2,30})/i)?.[1] || s.match(/(?:^|\s)@([A-Za-z0-9._]{2,30})\b/)?.[1]
  const site = s.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|br|net|com\.br|net\.br|app|site|online)(?:\/[^\s]*)?)\b/i)?.[1]
  return { ...(ig ? { instagram: ig.toLowerCase() } : {}), ...(site && !/instagram\.com|facebook\.com|wa\.me/i.test(site) ? { site } : {}) }
}

// ---------- 1) ler a internet antes de perguntar ----------
// em teste, globalThis.__maiaEntrevistaFake.internet(fontes, neg) devolve o que "achou"
async function buscaInternet(neg: any, fontes: Entrevista['fontes']) {
  const fake = (globalThis as any).__maiaEntrevistaFake
  if (fake?.internet) return fake.internet(fontes, neg)
  const out: any = {}
  const tenta = async (nome: string, f: () => Promise<any>) => { try { out[nome] = await f() } catch (e: any) { out[nome] = { ok: false, erro: String(e?.message || e).slice(0, 120) } } }
  await Promise.all([
    fontes.instagram ? tenta('instagram', async () => (await import('@/lib/diagnostico/instagram')).perfilInstagramDiagnostico(String(fontes.instagram))) : null,
    fontes.site ? tenta('site', async () => (await import('@/lib/diagnostico/site')).analisarSite(String(fontes.site))) : null,
    neg.nome ? tenta('google', async () => (await import('@/lib/diagnostico/google')).empresaGoogle(neg.nome, neg.cidade || '')) : null,
  ].filter(Boolean))
  // o site que está na bio do Instagram também vale
  const bio = out.instagram?.perfil?.site || out.instagram?.website
  if (!fontes.site && bio) await tenta('site', async () => (await import('@/lib/diagnostico/site')).analisarSite(String(bio)))
  return out
}

const REGRAS_LEITURA = `Você lê o que foi achado na internet sobre um negócio (Instagram, site, ficha do Google) e preenche os campos do cadastro da implantação da Maia. Use SÓ o que está nos dados: nada inventado, nada de "provavelmente". Campo sem informação clara fica de fora. Escreva os valores em português simples, do jeito que o cliente do negócio leria.`
export async function leInternet(neg: any, e: Entrevista) {
  const permitidos = blocosDo(e.nicho).flatMap(b => b.campos).filter(c => c.net)
  let bruto: any = {}
  try { bruto = await buscaInternet(neg, e.fontes) } catch { bruto = {} }
  e.lido_em = new Date().toISOString()
  const temAlgo = Object.values(bruto || {}).some((x: any) => x && x.ok !== false)
  if (!temAlgo) { e.internet = 'não deu pra ler nada na internet (sem @, perfil pessoal ou fora do ar)'; return e }
  try {
    const r: any = await emJson(REGRAS_LEITURA, `NEGÓCIO: ${neg.nome || '?'} (${neg.nicho || '?'}), ${neg.cidade || '?'}
CAMPOS QUE PODEM SER PREENCHIDOS (chave: o que é):
${permitidos.map(c => `- ${c.k}: ${c.p}`).join('\n')}

DADOS ACHADOS:
${JSON.stringify(bruto).slice(0, 14000)}

Devolva {"campos": {"chave": {"valor": "...", "fonte": "Instagram | site | Google"}}, "resumo": "o que deu pra ver, em 2 frases"}`, [], { uso: { tipo: 'entrevista', negocio_id: neg.id } })
    const ks = new Set(permitidos.map(c => c.k))
    for (const [k, v] of Object.entries(r?.campos || {})) {
      const val = (v as any)?.valor ?? v
      if (ks.has(k) && !vazio(val) && !sabe(e, k)) e.achados[k] = { valor: val, fonte: String((v as any)?.fonte || 'internet') }
    }
    e.internet = String(r?.resumo || '').slice(0, 600) || null
  } catch (err: any) { e.internet = 'a leitura da internet falhou: ' + String(err?.message || err).slice(0, 120) }
  return e
}

// ---------- 2) a conversa ----------
export const PASSO_A_PASSO_ACESSO = (email: string) => `PASSO A PASSO DO ACESSO (mande em partes, uma ou duas mensagens por vez, e espere ele fazer):
1) No computador ou no navegador do celular, entrar em business.facebook.com com o Facebook que administra a página do negócio. (No celular, o app Meta Business Suite também serve: Menu > Configurações.)
2) Se ele tiver mais de um portfólio: no canto de cima, na lista com o nome dos portfólios, escolher o que tem a página e o Instagram DESTE negócio (é o que aparece com a página dele em "Contas > Páginas").
3) Ir em Configurações (a engrenagem) > Usuários > Pessoas > botão Adicionar (ou "Convidar pessoas").
4) Colocar o e-mail ${email}.
5) Escolher ACESSO TOTAL (administrador) e, se pedir, marcar todos os ativos: página, Instagram, conta de anúncio, WhatsApp e pixel/conjunto de dados.
6) Tocar em Enviar convite. Pronto: a nossa equipe aceita do lado de cá.
SE ELE NÃO TEM PORTFÓLIO AINDA: dá pra criar em business.facebook.com/overview (Criar conta: nome do negócio, nome dele e e-mail do negócio) e depois fazer os passos 3 a 6. Se travar, tudo bem: a equipe ajuda na reunião de contas (pode pular).
Quando ele disser que mandou: agradeça, diga que a equipe vai aceitar o convite, e marque acesso_enviado = true.`

// o padrão do ramo que a Maia propõe quando o dono não sabe (ele só confirma)
export const PADRAO_RAMO = (nicho: Nicho) => nicho === 'oficina' ? `PADRÃO DA OFICINA: passos até fechar = cliente chama → a Maia pergunta modelo, ano e o problema (e pede foto do painel ou vídeo do barulho) → preço fixo (óleo, revisão): passa o preço e marca o horário; o resto: convida a trazer o carro pra avaliar → orçamento → a equipe fecha. Venda = aprovou o orçamento e deixou o carro (ou fez o serviço de preço fixo). Recado pra base = lembrar troca de óleo e revisão, ele aprova cada recado.`
  : nicho === 'otica' ? `PADRÃO DA ÓTICA: passos até fechar = cliente chama → a Maia pede a foto da receita (ou oferece o exame com o parceiro) → passa o preço ou a faixa da lente → convida pra provar a armação na loja → a equipe fecha. Venda = pagou o pedido (ou o sinal) e o óculos foi pro laboratório. Recado pra base = receita com mais de 1 ano, volta às aulas, verão (óculos de sol com grau); ela aprova cada recado.`
  : `PADRÃO: passos até fechar = cliente chama → a Maia entende o que ele quer → passa o preço ou o caminho → a equipe fecha. Venda = pagou. Recado pra base = avisar quem já comprou na época certa; ele aprova cada recado.`

export const REGRAS_ENTREVISTA = (nicho: Nicho, email: string) => `Você é a Maia, a IA de marketing da escola Carreira no Digital. Este dono de ${nicho === 'oficina' ? 'oficina mecânica' : nicho === 'otica' ? 'ótica' : 'negócio'} acabou de contratar a Maia, e você está fazendo a ENTREVISTA DA IMPLANTAÇÃO pelo WhatsApp: tudo o que você precisa pra anunciar, atender os clientes dele 24 horas, retomar quem sumiu, fazer o Instagram dele e medir as vendas. A reunião por vídeo com a equipe vai ser SÓ pra ligar as contas.

COMO CONDUZIR:
- A entrevista inteira tem que caber em umas 25 a 35 respostas dele. Por isso: um bloco por vez, na ordem dada, e em cada mensagem JUNTE 2 ou 3 perguntas curtas do mesmo assunto ("Qual o valor médio de um serviço? E quanto sobra dele, tirando a peça?"). Frases curtas, no máximo 4 ou 5 linhas por mensagem.
- ANTES de perguntar, olhe o que você JÁ SABE e o que ACHOU NA INTERNET. Tudo o que achou na internet do bloco você CONFIRMA DE UMA VEZ, numa mensagem só, sem perguntar do zero: "Vi no seu Instagram e no Google: endereço Av. X, 100; de segunda a sexta das 8h às 18h. Tá tudo certo?". Só pergunte o que FALTA.
- NÃO repita o que ele acabou de dizer ("Anotado, Marcos: troca de óleo R$ 220...") nem agradeça toda hora. No máximo "Anotado." e já a próxima pergunta. Só repita um número se ficou ambíguo.
- Se ele responder mais coisa do que você perguntou (de outro bloco também), guarde tudo em "campos" e não pergunte de novo. A mesma resposta pode preencher MAIS DE UMA chave: preencha todas (ex.: os serviços valem pra ficha.produto e pro campo de serviços do ramo; o diagnóstico pago vale pro preço fixo x diagnóstico e pro preço personalizado).
- LIMITES E REGRAS (desconto, o que nunca prometer, quando passar pra ele, chamar de novo quem sumiu): pergunte um de cada vez e PROPONHA o padrão seguro, pra ele só dizer ok ou mudar. Ex.: "Desconto: eu não ofereço nenhum, a não ser que você me diga um máximo. Tem algum?"; "Eu nunca prometo preço nem prazo sem ver o carro (ou a receita). Tem mais alguma coisa que eu nunca posso prometer?"; "Eu passo a conversa pra você quando o cliente quer fechar, reclama, pede desconto ou pergunta algo que eu não sei. Quer acrescentar algo?"; "Quem pediu orçamento e sumiu, eu chamo de novo no dia seguinte, em 3 e em 6 dias, sem insistir. Pode?". Se ele disser ok, grave o padrão como resposta. O que ele já falou antes (ex.: "peça de fora não garanto prazo") já vale pra essas chaves.
- QUANDO ELE NÃO SABE OU EMPURRA PRA OUTRA PESSOA ("isso é com as meninas", "vê com a Lu") numa coisa IMPORTANTE (o que conta como venda, os passos até fechar, por que escolhem ele, horário, recado pra base): antes de pular, proponha UMA vez o padrão do ramo (abaixo) ou o que dá pra tirar do que ele já contou e da internet, e pergunte "pode ser assim por enquanto? depois você ajusta". Se ele disser ok, grave como resposta. Se não, pule.
${PADRAO_RAMO(nicho)}
- Resposta confusa ou que não respondeu: pergunte de novo, de outro jeito, mais simples, com um exemplo. Se ele não souber, trate como pular.
- Linguagem simples, sem jargão: "anúncio" (não tráfego), "cliente que chamou" (não lead), "lista de clientes" (não CRM), "quanto sobra" (não margem). Trate por "você". Sem emoji. Sem negrito.
- Valor antes do pedido: quando pedir algo que dá trabalho (fotos, números, acesso), diga em meia frase pra que serve ("é com isso que eu calculo quanto pode custar cada cliente").
- Áudio dele chega transcrito ("(áudio) ..."): entenda e siga. Foto e vídeo que ele manda ficam guardados como material do negócio: agradeça e diga o que dá pra fazer com eles.
- Se ele disser "pular", "depois", "não sei" ou que não tem a informação agora: diga "tudo bem, anotei pra depois" e siga pra PRÓXIMA PERGUNTA. Ponha em "pulados" as chaves da pergunta que ele pulou (só dela). Se ele pedir pra pular o assunto inteiro ("pula essa parte toda"), marque pulou = true (pula o resto do bloco). Nunca insista no que ele pulou.
- NUNCA pergunte coisa técnica: IDs, senha, token, API, pixel, conta de anúncio, número de conta. Se ele puxar o assunto, diga que isso a equipe liga com ele na reunião de contas. A ÚNICA parte técnica é o bloco do acesso ao portfólio, com o passo a passo abaixo.
- Não prometa resultado, não invente preço do negócio dele, não dê desconto da Maia. Dúvida sobre a Maia (preço, contrato): responda curto se souber (1º mês R$ 497 com implantação, depois R$ 797, sem fidelidade, 1.000 conversas por mês) e volte pra entrevista.
- Quando o bloco atual estiver respondido (ou pulado), marque bloco_completo = true e, na MESMA resposta, emende a primeira pergunta do PRÓXIMO bloco (vem no pedido). Se não houver próximo, diga que vai mandar o resumo.
- Em "campos", devolva SÓ o que ele respondeu ou confirmou NESTA mensagem, com as chaves exatas do bloco. Valores em texto simples, do jeito que o cliente dele leria. Listas: funil.etapas = [{"etapa","proximo_passo"}]; ficha.perguntas = [{"pergunta","resposta"}]; calendario.datas = [{"nome","dia","porque"}]. Números (ticket, margem, verba, dias) como número.
- Em "confirmados", as chaves do que ACHOU NA INTERNET que ele disse que está certo (se ele corrigiu, mande o valor novo em "campos").

${PASSO_A_PASSO_ACESSO(email)}

Responda SÓ com JSON: {"mensagens": ["1 ou 2 mensagens de WhatsApp"], "campos": {"chave": valor}, "confirmados": ["chave"], "pulados": ["chave"], "pulou": false, "bloco_completo": false, "acesso_enviado": false}`

function descreveBloco(e: Entrevista, b: Bloco) {
  return b.campos.map(c => {
    const st = sabe(e, c.k) ? `JÁ SABE: ${JSON.stringify(e.respostas[c.k]).slice(0, 200)}` : e.achados[c.k] ? `ACHOU NA INTERNET (${e.achados[c.k].fonte}), CONFIRMAR: ${JSON.stringify(e.achados[c.k].valor).slice(0, 200)}` : ehPulado(e, c.k) ? 'ele pulou antes (não insista)' : 'FALTA'
    return `- ${c.k} (${c.p}${c.opc ? '; opcional' : ''}): ${st}`
  }).join('\n')
}

async function midiasDo(neg: any) {
  const ms = await db.lista('midias', { negocio_id: neg.id }).catch(() => [] as any[])
  return { fotos: ms.filter(m => m.tipo === 'foto').length, videos: ms.filter(m => m.tipo === 'video').length }
}

type Saida = { mensagens: string[]; campos: Record<string, any>; confirmados: string[]; pulados: string[]; pulou: boolean; bloco_completo: boolean; acesso_enviado: boolean }
type Extra = { abertura?: boolean; pediuPular?: boolean }
async function turnoIA(neg: any, cv: any, e: Entrevista, extra: Extra = {}): Promise<Saida> {
  const b = blocoPorId(e.blocos[e.bloco])
  const prox = e.blocos[e.bloco + 1] ? blocoPorId(e.blocos[e.bloco + 1]) : null
  const msgs = await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })
  const hist = msgs.filter(m => m.criado_em >= e.comecou_em).slice(-30).map(x => `${x.autor === 'dono' ? 'DONO' : x.autor === 'equipe' ? 'EQUIPE DA ESCOLA' : 'MAIA'}: ${x.texto}`).join('\n')
  const md = await midiasDo(neg)
  const pedido = `NEGÓCIO: ${neg.nome || '?'} · ${neg.nicho || '?'} · ${neg.cidade || '?'} · dono: ${neg.dono_nome || cv.nome || '?'}
${e.internet ? 'O QUE VOCÊ LEU NA INTERNET: ' + e.internet + '\n' : ''}MATERIAL QUE ELE JÁ MANDOU: ${md.fotos} foto(s), ${md.videos} vídeo(s)
BLOCOS DESTA ENTREVISTA: ${e.blocos.map((id, i) => `${i + 1}. ${blocoPorId(id).titulo}${i === e.bloco ? ' (ATUAL)' : i < e.bloco ? ' (feito)' : ''}`).join(' · ')}
${e.retomando ? 'ESTA É A RETOMADA: só os pontos que ficaram faltando da primeira vez.\n' : ''}
BLOCO ATUAL: ${b.titulo}. Objetivo: ${b.objetivo}.
${descreveBloco(e, b)}
${prox ? `\nPRÓXIMO BLOCO (se este acabar agora, emende a 1ª pergunta dele): ${prox.titulo}. Objetivo: ${prox.objetivo}.\n${descreveBloco(e, prox)}` : '\nEste é o ÚLTIMO bloco: quando acabar, diga que vai mandar o resumo pra ele conferir.'}
${extra.abertura ? `\nESTA É A PRIMEIRA MENSAGEM DA ENTREVISTA${e.retomando ? ' (retomada)' : ''}: cumprimente pelo nome, diga em uma frase o que vai acontecer ("umas perguntas rápidas aqui mesmo, um bloco por vez; pode responder por áudio; o que não souber é só dizer pular"), ${e.lido_em && e.internet ? 'conte que já deu uma olhada no Instagram/site dele pra não perguntar o que já está lá, ' : ''}e comece o bloco atual. Não use campos nem confirmados nesta.` : ''}
${extra.pediuPular ? '\nELE PEDIU PRA PULAR a última pergunta: diga que tudo bem, que anotou pra depois, ponha em "pulados" as chaves dessa pergunta e siga pra próxima (se era a última do bloco, marque bloco_completo e emende o próximo bloco). Não insista.' : ''}
CONVERSA DA ENTREVISTA:
${hist || '(ainda nada)'}`
  const r: any = await emJson(REGRAS_ENTREVISTA(e.nicho, emailAcesso()), pedido, [], { uso: { tipo: 'entrevista', negocio_id: neg.id, conversa_id: cv.id } })
  const mensagens = (Array.isArray(r?.mensagens) ? r.mensagens : [r?.mensagens]).map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 3)
  if (!mensagens.length) throw new Error('a IA respondeu sem mensagem')
  return { mensagens, campos: r?.campos && typeof r.campos === 'object' ? r.campos : {}, confirmados: Array.isArray(r?.confirmados) ? r.confirmados.map(String) : [], pulados: Array.isArray(r?.pulados) ? r.pulados.map(String) : [], pulou: r?.pulou === true, bloco_completo: r?.bloco_completo === true, acesso_enviado: r?.acesso_enviado === true }
}

// ele mandou o convite de administrador: registra e avisa o Nando (o dono do e-mail) pra aceitar
export const mandouConvite = (t: string) => /\b(mandei|enviei|ja mandei|ja enviei|dei|liberei)\b.{0,30}\b(convite|acesso)\b|\bconvite\b.{0,20}\b(enviado|mandado|foi)\b/.test(semAc(t))
async function marcaAcesso(neg: any, e: Entrevista) {
  e.acesso = { enviado: true, em: new Date().toISOString(), email: emailAcesso() }
  e.respostas['contas.acesso_enviado'] = 'sim'
  e.pulados = e.pulados.map(p => ({ ...p, campos: p.campos.filter(k => k !== 'contas.acesso_enviado') })).filter(p => p.campos.length)
  if (e.faltando) e.faltando = e.faltando.filter(k => k !== 'contas.acesso_enviado')
  if (e.cadastro) e.cadastro.contas.acesso_admin = { enviado_em: e.acesso.em, email: e.acesso.email, aceito: false }
  const { avisaTime } = await import('./acompanhamento')
  await avisaTime(`Nando: aceitar o convite do portfólio de ${neg.nome}`, `${neg.dono_nome || 'O dono'} disse que mandou o convite de administrador do portfólio empresarial pro ${emailAcesso()}${e.respostas['contas.portfolio'] ? ` (portfólio: ${e.respostas['contas.portfolio']})` : ''}. Aceitar em business.facebook.com e conferir os ativos (página, Instagram, conta de anúncio, WhatsApp, pixel).`, neg.id, true)
}

// o que é do bloco e ainda falta (sem os opcionais)
const faltaNoBloco = (e: Entrevista, id: string) => blocoPorId(id).campos.filter(c => !c.opc && !sabe(e, c.k)).map(c => c.k)
function pula(e: Entrevista, id: string, so?: string[]) {
  const doBloco = blocoPorId(id).campos.map(c => c.k)
  const campos = (so ? so.filter(k => doBloco.includes(k)) : doBloco).filter(k => !sabe(e, k))
  if (!campos.length) return
  const ja = e.pulados.find(p => p.bloco === id)
  if (ja) ja.campos = [...new Set([...ja.campos, ...campos])]
  else e.pulados.push({ bloco: id, campos, em: new Date().toISOString() })
}

// ---------- começar e retomar ----------
const DDD_RS = new Set(['51', '53', '54', '55'])
export function ehOnline(neg: any) {
  if (neg?.meta?.implantacao === 'online') return true
  if (neg?.meta?.implantacao === 'presencial') return false
  const d = String(neg?.dono_whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  return d.length >= 10 && !DDD_RS.has(d.slice(0, 2))
}

export async function comecaEntrevista(negocio_id: string, op: { instagram?: string | null; site?: string | null; por?: string; nicho?: Nicho } = {}) {
  if (!entrevistaLigada()) return { ok: false, erro: 'a entrevista está desligada (MAIA_ENTREVISTA_LIGADA)' }
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) return { ok: false, erro: 'negócio não existe' }
  if (emAndamento(neg)) return { ok: false, erro: 'a entrevista desse negócio já está em andamento' }
  const nicho = op.nicho || nichoDe(neg)
  const e: Entrevista = {
    versao: 1, status: 'andando', nicho, blocos: blocosDo(nicho).map(b => b.id), bloco: 0, respostas: {}, achados: {}, pulados: [],
    fontes: { instagram: (op.instagram || neg.contexto?.instagram || '').replace(/^@/, '') || null, site: op.site || neg.contexto?.site || null },
    turnos: 0, comecou_em: new Date().toISOString(), por: op.por || 'equipe',
  }
  // o que o sistema já sabe do negócio vira resposta (não pergunta de novo)
  for (const [k, v] of [['negocio.nome', neg.nome], ['negocio.cidade', neg.cidade], ['negocio.dono_nome', neg.dono_nome], ['negocio.regiao', neg.regiao && neg.regiao !== (neg.cidade ? neg.cidade + ' e região' : '') ? neg.regiao : null], ['negocio.verba_dia', neg.verba_dia]] as [string, any][]) if (!vazio(v)) e.respostas[k] = v
  if (e.fontes.instagram || e.fontes.site || neg.nome) await leInternet(neg, e)
  const cv = await conversaDoDono(neg)
  await db.evento('entrevista_comecou', neg.id, { por: e.por, nicho, achados: Object.keys(e.achados).length })
  return falaETurno(neg, cv, e, { abertura: true })
}

export async function retomaEntrevista(negocio_id: string, por = 'equipe') {
  const neg = await db.um('negocios', { id: negocio_id })
  const e = entrevistaDo(neg)
  if (!neg || !e) return { ok: false, erro: 'esse negócio não tem entrevista' }
  const blocos = blocosDo(e.nicho).map(b => b.id).filter(id => faltaNoBloco(e, id).length || e.pulados.some(p => p.bloco === id))
  if (!blocos.length) return { ok: false, erro: 'não ficou nada faltando' }
  const nova: Entrevista = { ...e, status: 'andando', blocos, bloco: 0, pulados: [], retomando: true, comecou_em: new Date().toISOString(), por }
  const cv = await conversaDoDono(neg)
  await db.evento('entrevista_retomada', neg.id, { por, blocos })
  return falaETurno(neg, cv, nova, { abertura: true })
}

// a implantação foi paga (cobranca.ts): negócio da oferta online, sem entrevista ainda → começa sozinha
export async function aoPagarImplantacao(neg: any) {
  if (!entrevistaLigada() || entrevistaDo(neg) || !ehOnline(neg)) return null
  return comecaEntrevista(neg.id, { por: 'pagamento' })
}

async function falaETurno(neg: any, cv: any, e: Entrevista, extra: Extra) {
  let o: Saida
  // a IA às vezes devolve o JSON com sobra (dois objetos, texto depois): tenta de novo uma vez antes de travar
  try { o = await turnoIA(neg, cv, e, extra).catch(() => turnoIA(neg, cv, e, extra)) } catch (err: any) {
    await guarda(neg, e)
    const { avisaTime } = await import('./acompanhamento')
    await avisaTime('a entrevista da implantação travou', `${neg.nome}: ${String(err?.message || err).slice(0, 140)}. A entrevista fica parada até alguém olhar (painel → entrevista).`, neg.id, true)
    return { ok: false, erro: String(err?.message || err) }
  }
  return aplica(neg, cv, e, o, extra)
}

async function aplica(neg: any, cv: any, e: Entrevista, o: Saida, extra: Extra = {}) {
  const id = e.blocos[e.bloco]
  // vale qualquer campo da entrevista (ele costuma responder coisa de outro bloco junto); campo técnico não existe na lista
  const doBloco = new Set(blocosDo(e.nicho).flatMap(b => b.campos).map(c => c.k))
  if (!extra.abertura) {
    for (const k of o.confirmados) if (e.achados[k]) { e.respostas[k] = e.achados[k].valor; delete e.achados[k] }
    for (const [k, v] of Object.entries(o.campos)) if (doBloco.has(k) && !vazio(v)) { e.respostas[k] = v; delete e.achados[k] }
    if (o.acesso_enviado && !e.acesso?.enviado) await marcaAcesso(neg, e)
    if (o.pulou) pula(e, id)
    else if (o.pulados.length) pula(e, id, o.pulados)
    // pediu pra pular e a IA não disse o quê: fica pulado o 1º que faltava no bloco
    else if (extra.pediuPular) { const k = blocoPorId(id).campos.find(c => !sabe(e, c.k) && !ehPulado(e, c.k)); if (k) pula(e, id, [k.k]) }
    if (o.pulou || o.bloco_completo) e.bloco++
  }
  e.turnos++
  for (const t of o.mensagens) await mandaTexto(cv, t)
  if (e.bloco >= e.blocos.length) return mandaResumo(neg, cv, e)
  await guarda(neg, e)
  return { ok: true, status: e.status, bloco: e.blocos[e.bloco], enviadas: o.mensagens.length }
}

// ---------- 3) o resumo, o cadastro e o fim ----------
const rotulo = (k: string) => (campoPorK(k)?.p || k).split(/[(:;]/)[0].trim()
const mostra = (v: any): string => Array.isArray(v) ? v.map(x => typeof x === 'object' ? Object.values(x).filter(Boolean).join(': ') : String(x)).join('; ') : typeof v === 'object' && v ? Object.values(v).join('; ') : String(v)
export function faltandoDe(e: Entrevista): string[] {
  const ks = new Set<string>()
  for (const b of blocosDo(e.nicho)) for (const c of b.campos) if (!sabe(e, c.k) && (!c.opc || ehPulado(e, c.k))) ks.add(c.k)
  return [...ks]
}
export function textoResumo(e: Entrevista): string[] {
  const partes: string[] = []
  for (const b of blocosDo(e.nicho)) {
    const linhas = b.campos.filter(c => sabe(e, c.k) && c.k !== 'contas.acesso_enviado').map(c => { const t = mostra(e.respostas[c.k]); return `- ${rotulo(c.k)}: ${t.length > 160 ? t.slice(0, 157).replace(/\s+\S*$/, '') + '...' : t}` })
    if (linhas.length) partes.push(`${b.titulo}\n${linhas.join('\n')}`)
  }
  // até 3 mensagens: junta os blocos em pedaços de ~1.200 caracteres
  const out: string[] = []
  for (const p of partes) { if (out.length && (out[out.length - 1] + '\n\n' + p).length < 1200) out[out.length - 1] += '\n\n' + p; else out.push(p) }
  return out.slice(0, 4)
}
const listaFalta = (ks: string[], e?: Entrevista) => ks.map(k => `- ${rotulo(k)}${e?.achados[k] ? ` (achei: ${mostra(e.achados[k].valor).slice(0, 90)}; falta você confirmar)` : ''}`).join('\n')

async function mandaResumo(neg: any, cv: any, e: Entrevista) {
  e.status = 'resumo'
  e.faltando = faltandoDe(e)
  await mandaTexto(cv, 'Aqui está o resumo do que eu entendi do seu negócio:')
  for (const t of textoResumo(e)) await mandaTexto(cv, t)
  if (e.faltando.length) await mandaTexto(cv, `Ficou faltando (sem problema, dá pra completar depois):\n${listaFalta(e.faltando, e)}`)
  await mandaTexto(cv, 'Tá tudo certo? Se quiser corrigir alguma coisa, é só me dizer o que muda.')
  await guarda(neg, e)
  return { ok: true, status: e.status, faltando: e.faltando }
}

// o cadastro no formato do modelo-cadastro.json da skill implantacao-maia (o que o importar.mjs lê)
const num = (v: any) => { if (typeof v === 'number') return v; const m = String(v ?? '').replace(/\./g, '').replace(',', '.').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null }
export function montaCadastro(neg: any, e: Entrevista) {
  const R = e.respostas, AC = 'a confirmar'
  const v = (k: string) => (vazio(R[k]) ? AC : R[k])
  const perguntasNicho = blocosDo(e.nicho).filter(b => b.id === 'oficina' || b.id === 'otica').flatMap(b => b.campos).filter(c => sabe(e, c.k)).map(c => ({ pergunta: c.p.split(/[(?]/)[0].trim() + '?', resposta: mostra(R[c.k]) }))
  const perguntas = [...(Array.isArray(R['ficha.perguntas']) ? R['ficha.perguntas'] : []), ...perguntasNicho]
  const ticket = num(R['trafego.ticket_medio'])
  let margem = num(R['trafego.margem_por_venda'])
  if (margem != null && /%/.test(String(R['trafego.margem_por_venda'])) && ticket) margem = Math.round(ticket * margem / 100)
  const cpa = margem ? Math.max(1, Math.round(margem * 0.15)) : null
  const pessoa = /\btu\b/i.test(String(R['atendimento.tom.pessoa'] || '')) ? 'tu' : 'voce'
  const equipe = String(R['negocio.equipe_whatsapp'] || '').split(/[,;/]| e /).map(x => x.replace(/\D/g, '')).filter(x => x.length >= 10).map(x => (x.length <= 11 ? '55' + x : x))
  const faltando = faltandoDe(e)
  const hoje = new Date().toISOString().slice(0, 10)
  return {
    _origem: `entrevista da Maia pelo WhatsApp (${e.terminou_em || new Date().toISOString()}). Revisar antes de importar: node ferramentas/maia-implantacao/importar.mjs <este arquivo>`,
    negocio: { nome: v('negocio.nome'), nicho: neg.nicho || e.nicho, cidade: v('negocio.cidade'), regiao: R['negocio.regiao'] || neg.regiao || null, dono_nome: v('negocio.dono_nome'), dono_whatsapp: neg.dono_whatsapp, verba_dia: num(R['negocio.verba_dia']) ?? AC, equipe_whatsapp: equipe },
    ficha: {
      produto: v('ficha.produto'), preco: v('ficha.preco'), mais_vendido: v('ficha.mais_vendido'), publico: v('ficha.publico'), pagamento: v('ficha.pagamento'),
      endereco: R['ficha.endereco'] || AC, horario: v('ficha.horario'), prazo: v('ficha.prazo'), provas: R['ficha.provas'] || (e.fontes.instagram ? '@' + e.fontes.instagram : AC),
      diferencial: R['ficha.diferencial'] || AC,
      ...(perguntas.length ? { perguntas } : {}),
      ...(!vazio(R['ficha.preco_personalizado']) ? { preco_personalizado: typeof R['ficha.preco_personalizado'] === 'object' ? R['ficha.preco_personalizado'] : { servicos: R['ficha.preco_personalizado'], por_que: '', caminho: '' } } : {}),
    },
    nicho_detalhes: Object.fromEntries(Object.entries(R).filter(([k]) => /^(oficina|otica)\./.test(k))),
    funil: { sim: v('funil.sim'), etapas: Array.isArray(R['funil.etapas']) ? R['funil.etapas'] : vazio(R['funil.etapas']) ? [] : [{ etapa: String(R['funil.etapas']), proximo_passo: '' }] },
    trafego: { servico_foco: R['trafego.servico_foco'] || AC, raio: R['trafego.raio'] || R['negocio.regiao'] || AC, ticket_medio: ticket ?? AC, margem_por_venda: margem ?? AC, cpa_meta: cpa ?? AC, cpa_meta_regra: cpa ? `15% da margem por venda (R$ ${margem})` : 'calcular da margem', ciclo_venda_dias: num(R['trafego.ciclo_venda_dias']) ?? AC, ciclo_venda_fonte: 'o que o dono contou na entrevista', clientes_mes: R['numeros.clientes_mes'] || null, metricas_secundarias: [] },
    limites: { desconto_maximo: v('limites.desconto_maximo'), faixa_preco: 'Pode dizer os preços da ficha', nunca_prometer: v('limites.nunca_prometer'), passar_pro_dono: v('limites.passar_pro_dono') },
    atendimento: { tom: { pessoa, gaucho: pessoa === 'tu', estilo: R['atendimento.tom.estilo'] || 'leve' }, fechamento: /maia/i.test(String(R['atendimento.fechamento'] || '')) ? 'maia' : 'time' },
    contas: { portfolio: R['contas.portfolio'] || AC, acesso_admin: e.acesso?.enviado ? { enviado_em: e.acesso.em, email: e.acesso.email, aceito: false } : AC, page_id: AC, ig_id: e.fontes.instagram ? AC : AC, ad_account_id: AC, whatsapp: { numero: neg.dono_whatsapp || AC, conferido: false } },
    marca: { cores: { primaria: AC }, estilo: AC, logo_arquivo: R['marca.logo'] ? 'mandou no WhatsApp (aba Arquivos)' : AC, aparece: R['material.aparece'] || AC },
    material: { fotos: R['material.fotos'] || AC },
    conteudo: { temas: R['conteudo.temas'] || AC, so_instagram: true, por_mes: '8 posts e 4 vídeos' },
    retomada: { regras: R['retomada.regras'] || 'padrão: 20 h, 3 dias e 6 dias, a última é uma despedida' },
    dono: { aprovacao: R['dono.aprovacao'] || AC, whatsapp: neg.dono_whatsapp || AC },
    primeiro_lote: [],
    recado_base: { ligado: R['recado_base.ligado'] || 'não', _como: 'a lista dos clientes de sempre, se ele mandou, já foi importada na base' },
    calendario: { datas: Array.isArray(R['calendario.datas']) ? R['calendario.datas'] : [] },
    combinados: { ligar_ate: AC, reuniao_contas: e.reuniao_preferencia || AC },
    internet: { fontes: e.fontes, resumo: e.internet || null },
    a_confirmar: [
      ...faltando.map(k => ({ campo: k, quem: 'dono', ate: hoje, por: e.pulados.some(p => p.campos.includes(k)) ? 'pulou na entrevista' : 'não respondeu' })),
      ...['contas.page_id', 'contas.ig_id', 'contas.ad_account_id', 'contas.whatsapp.conferido'].map(campo => ({ campo, quem: 'equipe', ate: hoje, por: 'reunião de contas' })),
      ...['marca.cores.primaria', 'marca.estilo', 'primeiro_lote', 'trafego.metricas_secundarias', 'combinados.ligar_ate'].map(campo => ({ campo, quem: 'equipe', ate: hoje, por: 'equipe/Maia resolve' })),
    ],
  }
}

// o cadastro → o contexto do negócio (os mesmos campos que o importar.mjs monta), pra equipe aplicar pelo painel depois de revisar
export function contextoDoCadastro(c: any) {
  const f = c.ficha || {}, ok = (x: any) => !vazio(x)
  return {
    ...(ok(f.produto) ? { produto: f.produto } : {}), ...(ok(f.preco) ? { preco: f.preco } : {}), ...(ok(f.mais_vendido) ? { mais_vendido: f.mais_vendido } : {}),
    ...(ok(f.publico) ? { publico: f.publico } : {}), ...(ok(f.pagamento) ? { pagamento: f.pagamento } : {}), ...(ok(f.endereco) ? { endereco: f.endereco } : {}),
    ...(ok(f.horario) ? { horario: f.horario } : {}), ...(ok(f.prazo) ? { prazo: f.prazo } : {}), ...(ok(f.provas) ? { provas: f.provas } : {}),
    ...(ok(f.diferencial) ? { diferencial: f.diferencial } : {}), ...(Array.isArray(f.perguntas) && f.perguntas.length ? { perguntas: f.perguntas } : {}),
    ...(f.preco_personalizado ? { preco_personalizado: [f.preco_personalizado] } : {}),
    fechamento: c.atendimento?.fechamento || 'time',
    funil: c.funil, limites: c.limites,
    trafego: Object.fromEntries(Object.entries(c.trafego || {}).filter(([, x]) => ok(x))),
    ...(c.calendario?.datas?.length ? { calendario: { datas: c.calendario.datas.map((d: any) => ({ ...d, por: 'implantacao' })) } } : {}),
    ...(Object.keys(c.nicho_detalhes || {}).length ? { nicho_detalhes: c.nicho_detalhes } : {}),
    ...(ok(c.conteudo?.temas) ? { conteudo: c.conteudo } : {}), ...(c.retomada ? { retomada: c.retomada } : {}), ...(ok(c.dono?.aprovacao) ? { aprovacao_dono: c.dono.aprovacao } : {}),
    implantacao: { entrevista_em: c._origem, reuniao_contas: c.combinados?.reuniao_contas || null },
  }
}

async function finaliza(neg: any, cv: any, e: Entrevista) {
  e.terminou_em = new Date().toISOString()
  e.faltando = faltandoDe(e)
  e.cadastro = montaCadastro(neg, e)
  e.status = 'reuniao'
  const falta = e.faltando
  await mandaTexto(cv, `Fechado! Salvei tudo.${falta.length ? ` Ficaram ${falta.length} ponto(s) pra completar depois, quando você tiver: é só me mandar aqui ("quero completar o que faltou").` : ''}`)
  await mandaTexto(cv, `Agora falta só a reunião por vídeo com a equipe, pra ligar as contas (WhatsApp, Instagram, página e anúncio)${e.acesso?.enviado ? ', já com o acesso que você mandou' : ''}. Leva uns 30 a 40 minutos. Qual o melhor dia e período pra você: manhã ou tarde?`)
  await guarda(neg, e)
  const { avisaTime } = await import('./acompanhamento')
  await avisaTime(`entrevista da implantação pronta: ${neg.nome}`,
    `${neg.nome} (${neg.cidade || '?'}) terminou a entrevista pelo WhatsApp.\n${textoResumo(e).join('\n\n').slice(0, 1500)}\n\nFALTA: ${falta.length ? falta.map(rotulo).join('; ') : 'nada'}.\nAcesso de administrador ao portfólio: ${e.acesso?.enviado ? 'ele disse que mandou pro ' + e.acesso.email + ' (aceitar)' : 'NÃO mandou: fazer na reunião'}.\nO cadastro está no painel (entrevista do negócio). Próximo: marcar a reunião de contas.`, neg.id, true)
  await db.evento('entrevista_feita', neg.id, { faltando: falta, acesso: !!e.acesso?.enviado, turnos: e.turnos })
  return { ok: true, status: e.status, faltando: falta }
}

// ---------- a entrada: o dono respondeu (dono.ts, respondeDono) ----------
// devolve null quando não é com a entrevista (a conversa de sempre segue)
export async function atendeEntrevista(neg: any, cv: any) {
  if (!entrevistaLigada()) return null
  const e = entrevistaDo(neg)
  if (!e) return null
  const ultima = (await db.lista('msgs', { conversa_id: cv.id, autor: 'dono' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
  const texto = String(ultima?.texto || '')
  // o convite do portfólio costuma sair DEPOIS (ele precisa achar o login): "mandei o convite" a qualquer hora vale, sem IA
  if (['feita', 'reuniao', 'resumo'].includes(e.status) && !e.acesso?.enviado && mandouConvite(texto)) {
    await marcaAcesso(neg, e)
    await mandaTexto(cv, `Recebi, obrigada! A equipe vai aceitar o convite do ${emailAcesso()} e conferir a página, o Instagram, a conta de anúncio e o WhatsApp.`)
    await guarda(neg, e)
    return { ok: true, status: e.status, acesso: true }
  }
  // feita: só volta se ele pedir pra completar o que faltou
  if (e.status === 'feita') { if (pedeCompletar(texto) && faltandoDe(e).length) return retomaEntrevista(neg.id, 'dono'); return null }
  if (e.turnos >= MAX_TURNOS) {
    const { avisaTime } = await import('./acompanhamento')
    await avisaTime('entrevista longa demais', `${neg.nome}: passou de ${MAX_TURNOS} respostas. Olhar no painel.`, neg.id, true)
    e.status = 'feita'; await guarda(neg, e); return null
  }
  // a reunião: o que ele disser agora é o dia/período (sem IA); depois disso a conversa volta ao normal
  if (e.status === 'reuniao') {
    e.reuniao_preferencia = texto.slice(0, 200)
    e.status = 'feita'
    if (e.cadastro) e.cadastro.combinados.reuniao_contas = e.reuniao_preferencia
    await mandaTexto(cv, 'Anotado! A equipe confirma o horário certinho e te manda o link da chamada por aqui.')
    await guarda(neg, e)
    const { avisaTime } = await import('./acompanhamento')
    await avisaTime(`marcar a reunião de contas: ${neg.nome}`, `Quando ele pode: "${e.reuniao_preferencia}". Confirmar o horário e mandar o link.`, neg.id, true)
    return { ok: true, status: e.status }
  }
  // o @ ou o site apareceu na conversa e ela ainda não leu: lê antes de responder
  const fx = fontesDoTexto(texto)
  if ((fx.instagram && fx.instagram !== e.fontes.instagram) || (fx.site && fx.site !== e.fontes.site)) {
    e.fontes = { ...e.fontes, ...fx }
    await leInternet(neg, e)
  }
  // o resumo: "sim" fecha; outra coisa é correção (a IA tira os campos, o resumo vai de novo)
  if (e.status === 'resumo') {
    if (confirma(texto)) return finaliza(neg, cv, e)
    let o: any
    try {
      o = await emJson(REGRAS_ENTREVISTA(e.nicho, emailAcesso()), `O dono está conferindo o resumo da entrevista e mandou uma correção.
CAMPOS QUE EXISTEM (chave: o que é): ${blocosDo(e.nicho).flatMap(b => b.campos).map(c => `${c.k} (${c.p})`).join('; ')}
O QUE JÁ ESTÁ SALVO: ${JSON.stringify(e.respostas).slice(0, 6000)}
A MENSAGEM DELE: ${texto}
Devolva os campos corrigidos e uma mensagem curta dizendo o que mudou.`, [], { uso: { tipo: 'entrevista', negocio_id: neg.id, conversa_id: cv.id } })
    } catch { o = {} }
    const validas = new Set(blocosDo(e.nicho).flatMap(b => b.campos).map(c => c.k))
    for (const [k, val] of Object.entries(o?.campos || {})) if (validas.has(k) && !vazio(val)) e.respostas[k] = val
    for (const t of (Array.isArray(o?.mensagens) ? o.mensagens : []).slice(0, 2)) await mandaTexto(cv, String(t))
    e.turnos++
    return mandaResumo(neg, cv, e)
  }
  // "pular": a IA é avisada (pula só a pergunta e segue); se ela não disser qual, o código marca a 1ª que faltava
  return falaETurno(neg, cv, e, { pediuPular: pedePular(texto) })
}

// ---------- o painel ----------
export function painelEntrevista(neg: any) {
  const e = entrevistaDo(neg)
  if (!e) return { negocio_id: neg?.id, tem: false, ligada: entrevistaLigada(), online: ehOnline(neg) }
  const blocos = blocosDo(e.nicho).map(b => {
    const falta = b.campos.filter(c => !sabe(e, c.k) && (!c.opc || ehPulado(e, c.k))).map(c => rotulo(c.k))
    return { id: b.id, titulo: b.titulo, respondidos: b.campos.filter(c => sabe(e, c.k)).length, total: b.campos.length, pulou: e.pulados.some(p => p.bloco === b.id), falta }
  })
  return {
    negocio_id: neg.id, nome: neg.nome, tem: true, ligada: entrevistaLigada(), status: e.status, nicho: e.nicho,
    bloco_atual: e.status === 'andando' ? blocoPorId(e.blocos[e.bloco])?.titulo || null : null,
    progresso: `${Math.min(e.bloco, e.blocos.length)}/${e.blocos.length}`, retomando: !!e.retomando,
    blocos, faltando: faltandoDe(e).map(rotulo), achados_a_confirmar: Object.keys(e.achados).map(rotulo),
    internet: e.internet || null, fontes: e.fontes, acesso: e.acesso || null, email_acesso: emailAcesso(),
    reuniao_preferencia: e.reuniao_preferencia || null, fica_pra_reuniao: FICA_PRA_REUNIAO, equipe_resolve: EQUIPE_RESOLVE,
    comecou_em: e.comecou_em, terminou_em: e.terminou_em || null, turnos: e.turnos, cadastro: e.cadastro || null,
  }
}
