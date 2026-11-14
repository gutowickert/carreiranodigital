// Maia: a REDE do ensaio geral (14/11). Carregado no servidor de teste com NODE_OPTIONS=--import=./scripts/maia-ensaio-rede.mjs
// (veja o cabeçalho de scripts/maia-teste-ensaio.mjs). Faz duas coisas no fetch do servidor:
//   1. nada sai pra internet: só passa o que vai pro próprio computador (localhost). O resto é recusado e anotado;
//   2. a IA é SIMULADA (nenhuma chamada vai pra Anthropic). Ela responde só três coisas, com texto fixo:
//      - "cria N anúncios" (pecas.ts geraAnuncios): devolve N peças usando as mídias que o pedido lista;
//      - o ajuste de uma peça (pecas.ts refaz): devolve o gancho e o texto novos;
//      - conversa com ferramentas (atendimento do cliente e do dono): uma frase curta no "você", sem chamar ferramenta;
//      - pedido que devolve {"texto":"..."} (retomada, resumo da semana): uma frase curta;
//      - 14/11: o texto do recado pra base (e o ajuste dele) e, quando o dono escreve "manda pra base...", a chamada da
//        ferramenta recado_pra_base (scripts/maia-teste-recado.mjs).
//      Qualquer outro pedido de IA recebe "IA fora do ar" (529), como quando a Anthropic cai: o sistema tem que seguir.
// Tudo fica anotado em <MAIA_LOCAL_PASTA>/ensaio-rede.jsonl, uma linha por chamada, pro ensaio conferir no fim.
import fs from 'node:fs'
import path from 'node:path'

const PASTA = path.resolve(process.cwd(), process.env.MAIA_LOCAL_PASTA || '.maia-teste/ensaio')
const LOG = path.join(PASTA, 'ensaio-rede.jsonl')
const anota = (x) => { try { fs.mkdirSync(PASTA, { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ quando: new Date().toISOString(), pid: process.pid, ...x }) + '\n') } catch { /* anotar nunca derruba */ } }
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const resp = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } })
const uso = { input_tokens: 10, output_tokens: 10 }
const texto = (t) => resp({ id: 'msg_falsa', type: 'message', role: 'assistant', model: 'ia-falsa', content: [{ type: 'text', text: t }], stop_reason: 'end_turn', usage: uso })

function textoDoPedido(corpo) {
  const sis = Array.isArray(corpo?.system) ? corpo.system.map(s => s.text || '').join('\n') : String(corpo?.system || '')
  const msgs = (corpo?.messages || []).map(m => typeof m.content === 'string' ? m.content : (m.content || []).map(c => c.text || '').join('\n')).join('\n')
  return { sis, msgs }
}

// as peças: uma mídia por anúncio, fotos antes (vídeo vira anuncio_video), sem dia relativo e no "você"
const ANGULOS = [
  { angulo: 'produto', gancho: 'Feito sob medida pra sua casa', texto: 'Cada peça é pensada pro seu espaço, com acabamento caprichado e material que dura.', cta: 'Chama no WhatsApp e peça o seu orçamento.' },
  { angulo: 'presente', gancho: 'O presente que fica pra sempre', texto: 'Uma peça com o nome de quem você ama, gravada com carinho e entregue pronta pra presentear.', cta: 'Chama no WhatsApp e escolha o seu.' },
  { angulo: 'prova', gancho: 'Quem levou, voltou pra buscar outro', texto: 'Clientes da região contam que a peça chegou do jeito que pediram. Veja as fotos de quem já comprou.', cta: 'Chama no WhatsApp e tire suas dúvidas.' },
  { angulo: 'ocasiao', gancho: 'A mesa posta com outra cara', texto: 'Tábuas e bandejas que deixam o almoço de família mais bonito, prontas pra usar.', cta: 'Chama no WhatsApp e veja os modelos.' },
]
function anuncios(msgs) {
  const n = Math.max(1, Math.min(6, Number((/Cria (\d+) anúncios/.exec(msgs) || [])[1]) || 2))
  const lista = (msgs.split('FOTOS E VÍDEOS QUE O DONO MANDOU:')[1] || '').split('\n').map(l => /^- (\S+) · (foto|video)/.exec(l)).filter(Boolean).map(m => ({ id: m[1], tipo: m[2] }))
  const ordem = [...lista.filter(m => m.tipo === 'foto'), ...lista.filter(m => m.tipo === 'video')]
  const pecas = []
  for (let i = 0; i < n && ordem.length; i++) {
    const m = ordem[i % ordem.length], a = ANGULOS[i % ANGULOS.length]
    pecas.push({ tipo: m.tipo === 'video' ? 'anuncio_video' : 'anuncio_imagem', midia_id: m.id, titulo: 'Ensaio ' + a.angulo, angulo: a.angulo, gancho: a.gancho, texto: a.texto, cta: a.cta, preco_na_arte: null })
  }
  return { pecas }
}

const orig = globalThis.fetch
if (orig && !globalThis.__maiaEnsaioRede) {
  globalThis.__maiaEnsaioRede = true
  globalThis.fetch = async (u, o = {}) => {
    const url = typeof u === 'string' ? u : (u && (u.url || u.href)) || String(u)
    let host = ''
    try { host = new URL(url).hostname } catch { return orig(u, o) }
    if (LOCAL.has(host)) return orig(u, o)
    if (host === 'api.anthropic.com') {
      let corpo = null
      try { corpo = typeof o.body === 'string' ? JSON.parse(o.body) : null } catch { corpo = null }
      const { sis, msgs } = textoDoPedido(corpo)
      const com = Array.isArray(corpo?.tools) && corpo.tools.length > 0
      // o ensaio "derruba a IA" criando o arquivo <pasta>/ia-fora: toda chamada recebe "IA fora do ar" até ele sumir
      if (fs.existsSync(path.join(PASTA, 'ia-fora'))) {
        anota({ tipo: 'ia_fora', sistema: sis.slice(0, 80).replace(/\s+/g, ' ') })
        return resp({ type: 'error', error: { type: 'overloaded_error', message: 'IA fora do ar (ensaio: ia-fora)' } }, 529)
      }
      if (/Cria \d+ anúncios diferentes/.test(msgs)) {
        const r = anuncios(msgs)
        anota({ tipo: 'ia_falsa', o: 'anuncios', quantos: r.pecas.length })
        return texto(JSON.stringify(r))
      }
      if (/AJUSTE PEDIDO PEL[AO]/.test(msgs)) {
        anota({ tipo: 'ia_falsa', o: 'ajuste' })
        return texto(JSON.stringify({ gancho: 'Sua tábua, com o seu nome', texto: 'Tábua de churrasco gravada com o nome que você escolher, pronta pra presentear.', cta: 'Chama no WhatsApp e peça a sua.', trocar_midia: false }))
      }
      // 14/11 (recado pra base, lib/maia/recado.ts): o texto do recado (e o ajuste dele), valor antes do preço, sem saudação
      if (/RECADO PRA BASE/.test(sis) && /Devolve \{"titulo"/.test(msgs)) {
        const ajuste = (/AJUSTE DO RECADO PEDIDO: (.*)/.exec(msgs) || [])[1] || ''
        anota({ tipo: 'ia_falsa', o: 'recado', ajuste: !!ajuste })
        return texto(JSON.stringify(ajuste
          ? { titulo: 'Bolão da Mega da Virada', texto: 'O bolão da Mega da Virada abriu e as cotas são poucas: quem entra divide a chance do prêmio com o grupo. Cada cota sai R$ 50. Quer participar? Responde aqui que a gente separa a sua.' }
          : { titulo: 'Bolão da Mega da Virada', texto: 'O prêmio da Mega da Virada vem grande e o bolão da loja já abriu: quem entra divide a chance com o grupo. São 10 cotas de R$ 50. Quer participar? Responde aqui que a gente separa a sua.' }))
      }
      // 14/11 (aba Social, scripts/maia-teste-social-aba.mjs): os slides e a legenda do carrossel (lib/maia/carrossel.ts)
      if (/CARROSSEL de Instagram/.test(sis) && /Devolve \{"slides"/.test(msgs)) {
        const ids = (msgs.split('FOTOS DO DONO:')[1] || '').split('\n').map(l => (/^- (\S+) · /.exec(l) || [])[1]).filter(Boolean)
        const f = (i) => ids.length ? ids[i % ids.length] : null
        anota({ tipo: 'ia_falsa', o: 'carrossel', fotos: ids.length })
        return texto(JSON.stringify({ slides: [
          { estilo: 'capa', midia_id: f(0), texto: '3 jeitos de jogar em grupo' },
          { estilo: 'foto', midia_id: f(1), texto: 'Bolão divide o custo', apoio: 'Cada um paga uma cota e a chance cresce' },
          { estilo: 'quebra', midia_id: null, texto: 'Mais jogos, mesma aposta' },
          { estilo: 'foto', midia_id: f(2), texto: 'Combine as dezenas com antecedência' },
          { estilo: 'foto', midia_id: f(3), texto: 'Guarde o comprovante do bolão' },
          { estilo: 'final', midia_id: f(4), texto: 'Salve pra lembrar no próximo sorteio' },
        ], legenda: 'Jogar em grupo é o jeito mais simples de aumentar a chance sem gastar mais. No bolão, cada pessoa compra uma cota e o grupo joga mais dezenas do que jogaria sozinho. Combine tudo antes, guarde o comprovante e acompanhe o resultado com o grupo. Salve este post pra lembrar no próximo sorteio. #bolao #loteria' }))
      }
      // o dono pede o recado pelo WhatsApp ("manda pra base que..."): a IA falsa chama a ferramenta recado_pra_base e depois confirma
      if (com && corpo.tools.some(t => t.name === 'recado_pra_base')) {
        const doDono = [...msgs.matchAll(/^DONO: (.*)$/gm)].map(m => m[1]).pop() || ''
        const jaUsou = (corpo.messages || []).some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'))
        if (/manda pra base/i.test(doDono) && !jaUsou) {
          anota({ tipo: 'ia_falsa', o: 'ferramenta', nome: 'recado_pra_base' })
          return resp({ id: 'msg_falsa', type: 'message', role: 'assistant', model: 'ia-falsa', content: [{ type: 'tool_use', id: 'toolu_falso_1', name: 'recado_pra_base', input: { pedido: doDono } }], stop_reason: 'tool_use', usage: uso })
        }
        if (jaUsou) { anota({ tipo: 'ia_falsa', o: 'conversa', depois_da_ferramenta: true }); return texto('<msg>Fechado! Escrevi o recado e a equipe dá uma conferida. Já te mando pra aprovar.</msg>') }
      }
      if (com) {
        anota({ tipo: 'ia_falsa', o: 'conversa', ferramentas: corpo.tools.length })
        // o atendimento e a conversa com o dono pegam só o que vem entre <msg> e </msg>
        return texto('<msg>Oi! Que bom que você chamou. Me conta o que você está procurando que eu te ajudo.</msg>')
      }
      if (/Devolve \{"texto"/.test(msgs)) {
        anota({ tipo: 'ia_falsa', o: 'texto' })
        return texto(JSON.stringify({ texto: 'Oi! Passando pra saber se ainda posso te ajudar com o que você tinha perguntado.' }))
      }
      anota({ tipo: 'ia_recusada', sistema: sis.slice(0, 120).replace(/\s+/g, ' '), pedido: msgs.slice(0, 120).replace(/\s+/g, ' ') })
      return resp({ type: 'error', error: { type: 'overloaded_error', message: 'IA fora do ar (ensaio)' } }, 529)
    }
    // a verificação de versão do próprio Next (modo dev) não é do sistema: só anota
    anota({ tipo: 'bloqueada', host, metodo: (o.method || 'GET').toUpperCase(), url: url.slice(0, 160).replace(/(access_token|token|key)=[^&]+/gi, '$1=***') })
    throw new Error('ensaio: saída pra internet bloqueada (' + host + ')')
  }
}
