// Maia: a conversa com o DONO do negócio, no WhatsApp da Maia (03/11).
// O dono manda fotos e vídeos curtos, aprova com 👍, pergunta os números, conta as vendas ("fechei com a Ana, 180").
// Ela responde na hora (isso é conversa, não passa pela equipe). O que ela GERA (anúncios, vídeos, relatório) vai pra equipe antes.
import crypto from 'node:crypto'
import { maiaDb as db, maiaLocal } from './db'
import { comFerramentas, emJson, JEITO, type Ferramenta } from './ia'
import { soltaFilaDoDono, conversaDoDono, conversa, mandaTexto, mandaRespostaCliente, avisaEquipe } from './canal'
import { donoAprova, donoAjuste, pecaDaMensagem } from './aprovacao'
import { geraAnuncios } from './pecas'
import { achaLead, novoLead, ganhou, perdeu, mudaEtapa, agendaFollowup, numeros, type Etapa } from './funil'
import { baixaMidia } from '@/lib/oito/wa'
import { descreveTom, tomDoNegocio } from './tom'
import { diasDoNegocio } from './horario'
import { iaDoDia, avisaUmaVez } from './limites'
// 07/11: os períodos moram junto com o painel do dono (o painel e a ferramenta "numeros" contam igual)
import { hojeBR, periodo, linkPainel, VALIDADE_DIAS } from './painel-dono'

const MAX_IA_DIA = 120
const ehJoinha = (t: string) => /^\s*(👍|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿|ok|aprovado|aprovo|aprova|pode subir|pode|show|top|perfeito|manda ver|bora)\s*[!.]*\s*$/i.test(t)
// 07/11: o dono pediu o painel (o link vai mesmo que a IA esqueça de chamar a ferramenta)
const pedePainel = (t: string) => /\b(meu painel|o painel|painel|dashboard|link (do|dos) (painel|resultados?|n[uú]meros))\b/i.test(t || '')

// o que a Maia viu numa foto (pra escolher a certa na hora de criar o anúncio)
async function descreveFoto(buf: Buffer, mime: string, neg: any) {
  try {
    const r = await emJson<{ descricao: string }>('Tu descreves fotos de pequenos negócios pra uma redatora de anúncios. Objetivo, em português, até 25 palavras: o que aparece, a qualidade da foto (nítida, escura, tremida) e se serve pra anúncio.',
      `Foto do negócio ${neg.nome} (${neg.nicho || ''}). Devolve {"descricao":"..."}`, [{ b64: buf.toString('base64'), mime: /png/.test(mime) ? 'image/png' : 'image/jpeg' }])
    return r.descricao
  } catch { return null }
}

// 08/11 (teste completo, 8f): o que se ouve no vídeo do dono (a Vercel não tem ffmpeg; o Deepgram aceita o mp4 direto)
async function falaDoVideo(buf: Buffer, mime: string) {
  if (maiaLocal() && process.env.MAIA_LOCAL_DEEPGRAM !== '1') return 'vídeo (a fala não foi ouvida no modo de teste)'
  try {
    const { transcreve } = await import('./demo')
    const t = (await transcreve(buf, mime || 'video/mp4')).trim()
    return t ? `vídeo com fala: "${t.slice(0, 400)}"` : 'vídeo sem fala'
  } catch { return 'vídeo' }
}

// a oficina tirou 3 quadros do vídeo (começo, meio, fim): a IA descreve e junta com a fala. Sem quadros, marca e segue
export async function descreveVideo(midia_id: string, quadros_b64: string[], duracao: number | null) {
  const m = await db.um('midias', { id: midia_id })
  if (!m) return { erro: 'mídia não existe' }
  const neg = await db.um('negocios', { id: m.negocio_id })
  const fala = String(m.descricao || '').replace(/\s*\(Quadros: descrevendo\)\s*$/, '')
  let quadros = 'não deu pra ver'
  if (quadros_b64.length) {
    try {
      const r = await emJson<{ descricao: string }>('Tu descreves vídeos curtos de pequenos negócios pra uma redatora de anúncios. Recebes 3 quadros (começo, meio e fim) do mesmo vídeo. Objetivo, em português, até 35 palavras: o que aparece, o que acontece, a qualidade (nítido, escuro, tremido) e se serve pra anúncio. Só o que se vê: não inventa produto, sabor nem preço.',
        `Vídeo do negócio ${neg?.nome || ''} (${neg?.nicho || ''}). Devolve {"descricao":"..."}`, quadros_b64.map(b64 => ({ b64, mime: 'image/jpeg' })), { uso: { tipo: 'outro', negocio_id: m.negocio_id } })
      quadros = String(r?.descricao || '').trim().replace(/[.\s]+$/, '') || quadros
    } catch { /* fica "não deu pra ver" */ }
  }
  const descricao = `${duracao ? 'Vídeo de ' + Math.round(duracao) + ' s' : 'Vídeo'}. Quadros: ${quadros}. ${fala && !/^vídeo$/i.test(fala) ? fala.charAt(0).toUpperCase() + fala.slice(1) : ''}`.trim()
  await db.atualiza('midias', { id: m.id }, { descricao: descricao.slice(0, 900), ...(duracao ? { duracao: Math.round(duracao * 10) / 10 } : {}) })
  return { ok: true, descricao }
}

// uma mensagem que chegou do dono. m = a mensagem no formato da Meta; midia = já baixada (simulação) ou baixa da Meta
export async function recebeDoDono(neg: any, m: any, nome: string | null, midia?: { buf: Buffer; mime: string }) {
  if (m.id && (await db.um('msgs', { wamid: m.id }))) return null   // a Meta repete eventos
  const cv = await conversaDoDono(neg)
  let texto = m.type === 'text' ? m.text?.body || '' : m.type === 'reaction' ? `(reagiu ${m.reaction?.emoji || ''})` : m.type === 'button' ? m.button?.text || '' : m.type === 'interactive' ? m.interactive?.button_reply?.title || '' : ''
  let midia_id: string | null = null
  const idMeta = m.image?.id || m.video?.id || m.audio?.id || (/image\/|video\//.test(m.document?.mime_type || '') ? m.document.id : null)
  if (midia || idMeta) {
    try {
      const { buf, mime } = midia || await baixaMidia(idMeta)
      if (/audio/.test(mime)) {
        const { transcreve } = await import('./demo')
        texto = '(áudio) ' + ((await transcreve(buf, mime)) || '[não deu pra entender o áudio]')
      } else {
        const tipo = /video/.test(mime) ? 'video' : 'foto'
        const ext = tipo === 'video' ? 'mp4' : /png/.test(mime) ? 'png' : 'jpg'
        const caminho = await db.sobe(`${neg.id}/midias/${crypto.randomUUID().slice(0, 8)}.${ext}`, buf, mime)
        const legenda = m.image?.caption || m.video?.caption || m.document?.caption || null
        // 08/11 (teste completo, 8f): vídeo também ganha descrição: a fala (Deepgram, aqui mesmo) e depois os quadros (a oficina
        // tira 3 quadros com o ffmpeg e o sistema descreve: descreveVideo)
        const descricao = tipo === 'foto' ? await descreveFoto(buf, mime, neg) : await falaDoVideo(buf, mime)
        const md = await db.insere('midias', { negocio_id: neg.id, tipo, path: caminho, mime, legenda, descricao })
        midia_id = md.id
        texto = `(mandou ${tipo === 'video' ? 'um vídeo' : 'uma foto'}${descricao ? ': ' + descricao : ''})${legenda ? ' ' + legenda : ''}`
      }
    } catch (e: any) { texto += ' [a mídia não pôde ser baixada: ' + String(e?.message || '').slice(0, 80) + ']' }
  }
  await db.insere('msgs', { conversa_id: cv.id, negocio_id: neg.id, autor: 'dono', tipo: m.type || 'texto', texto, midia_id, wamid: m.id || null, status: 'recebido' }).catch(() => null)
  await db.atualiza('conversas', { id: cv.id }, { ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString(), janela_ate: new Date(Date.now() + 24 * 3600e3).toISOString(), nao_lidas: (cv.nao_lidas || 0) + 1, ...(nome && !cv.nome ? { nome } : {}) })

  // 05/11: a janela de 24 h abriu: entrega o que estava esperando na fila (fora da janela só sai modelo aprovado)
  await soltaFilaDoDono({ ...cv, janela_ate: new Date(Date.now() + 24 * 3600e3).toISOString() }).catch(() => 0)

  // o 👍 em cima da mensagem de uma peça aprova aquela peça, sem precisar da IA
  if (m.type === 'reaction' && /👍/.test(m.reaction?.emoji || '') && m.reaction?.message_id) {
    const p = await pecaDaMensagem(neg.id, m.reaction.message_id)
    if (p && p.status === 'com_dono') { await donoAprova(neg.id, p.id); return { cv, texto, responder: true, aprovou: [p.id] } }
  }
  // 08/11 (T12): o clique em "Fechou" / "Não fechou" da pergunta das 18h (rotina.ts) vira ganho ou perdido, sem precisar da IA
  const venda = /^venda:([\w-]+):(sim|nao)$/.exec(String(m.interactive?.button_reply?.id || m.button?.payload || ''))
  if (venda) { const r = await respostaDeVenda(neg, cv, venda[1], venda[2] === 'sim'); if (r) return { cv, texto, responder: false, venda: r } }
  return { cv, texto, responder: cv.modo === 'ia' }
}

// o dono clicou num botão de venda. Só contato DESTE negócio; o que já estava ganho ou perdido não muda
export async function respostaDeVenda(neg: any, cv: any, lead_id: string, fechou: boolean) {
  const lead = await db.um('leads', { id: lead_id, negocio_id: neg.id })
  if (!lead) return null
  const nome = lead.nome || lead.telefone || 'o contato'
  if (lead.etapa === 'ganho' || lead.etapa === 'perdido') {
    await mandaTexto(cv, `${nome} já estava marcado como ${lead.etapa === 'ganho' ? 'venda' : 'não fechou'}. Se mudou, me conta que eu ajusto.`)
    return { lead: lead.id, etapa: lead.etapa, mudou: false }
  }
  if (fechou) {
    const l = await ganhou(lead, lead.valor, lead.produto, 'dono')
    await mandaTexto(cv, `Anotado: ${nome} fechou${l.valor ? ', R$ ' + l.valor : ''}. 💰${l.valor ? '' : ' Se quiser, me diz o valor que eu guardo.'}`)
    return { lead: lead.id, etapa: 'ganho', mudou: true }
  }
  await perdeu(lead, 'o dono disse que não fechou', 'dono')
  await mandaTexto(cv, `Anotado: ${nome} não fechou. Se souber o motivo (preço, sumiu, comprou em outro lugar), me conta que eu guardo.`)
  return { lead: lead.id, etapa: 'perdido', mudou: true }
}

// 13/11: as perguntas de cliente que esperam o dono (as de quem ainda está em aberto), com o contato
export async function perguntasAbertas(neg: any) {
  const evs = await db.lista('lead_eventos', { negocio_id: neg.id }, { ordem: 'criado_em' })
  const abertas = evs.filter(e => e.tipo === 'pergunta_cliente' && !evs.some(x => x.tipo === 'pergunta_respondida' && x.lead_id === e.lead_id && x.criado_em > e.criado_em))
  const out: { evento: any; lead: any }[] = []
  for (const e of abertas) {
    const l = await db.um('leads', { id: e.lead_id })
    if (l && !['ganho', 'perdido'].includes(l.etapa) && !out.some(x => x.lead.id === l.id)) out.push({ evento: e, lead: l })
  }
  return out
}

// 13/11: o dono respondeu a pergunta de um cliente (pelo WhatsApp, ferramenta responder_cliente; ou pelo painel do dono): a Maia
// repassa ao cliente certo, no tom do NEGÓCIO, e a pergunta sai da pendência. A mesma função nos dois caminhos
export async function responderCliente(neg: any, l: any, texto: string, via: 'whatsapp' | 'painel' = 'whatsapp') {
  const ccv = await conversa(neg.id, 'cliente', l.telefone, { nome: l.nome, lead_id: l.id })
  // 08/11 (teste completo): o repasse sai no tom do NEGÓCIO com os clientes ("você"/"tu", gaúcho ou não), nunca no jeito da
  // Maia com o dono ("Qual tu prefere?" num negócio em "você"). Fora do tom: reescreve; o acerto sem IA confere no fim
  const { noTomDoNegocio } = await import('./tom')
  const mensagem = await noTomDoNegocio(neg, texto, { negocio_id: neg.id, conversa_id: ccv.id })
  // 07/11 (piloto): depois de 24 h da última mensagem do cliente, vai pelo modelo maia_resposta (a resposta espera na fila)
  const env = await mandaRespostaCliente(ccv, mensagem, 'maia')
  await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: l.id, tipo: 'pergunta_respondida', autor: 'dono', detalhe: { mensagem, como: env.como, via } })
  return { ok: true, mensagem, canal: neg.wa_phone_id ? 'whatsapp do negócio' : 'simulado (o WhatsApp do negócio ainda não está ligado)',
    ...(env.na_fila ? { aviso: env.modelo ? 'passou 24 h: o cliente recebeu o aviso de que a resposta está pronta e ela sai quando ele responder' : 'passou 24 h e o modelo não está aprovado: a resposta ficou guardada e sai quando o cliente escrever (o dono e a equipe já foram avisados)' } : {}) }
}

function ferramentas(neg: any, ctx: { aprovou: string[]; link?: string }): Ferramenta[] {
  const lead = async (q: any) => (await achaLead(neg.id, { telefone: q.telefone, nome: q.nome, id: q.lead_id })) as any
  return [
    { name: 'salvar_contexto', description: 'Guarda o que tu aprendeu do negócio (serviços, preços, público, diferencial, horário, endereço, formas de pagamento, tom, o que evitar, verba por dia, perguntas frequentes). Só o que o dono disse.',
      input_schema: { type: 'object', properties: { campos: { type: 'object', description: 'chave → valor, ex.: {"servicos":"...","preco_medio":"R$ 180"}' }, verba_dia: { type: 'number' } }, required: ['campos'] },
      roda: async ({ campos, verba_dia }) => {
        // 12/11 (limites.ts): verba acima do teto do negócio não é salva pela conversa: a equipe confirma com o dono (é dinheiro)
        // 13/11: nenhuma verba é salva direto pela conversa: vira PEDIDO que a equipe aprova no painel (pendencias.ts)
        const n = await db.um('negocios', { id: neg.id })
        await db.atualiza('negocios', { id: neg.id }, { contexto: { ...(n?.contexto || {}), ...(campos || {}) } })
        if (!verba_dia) return { ok: true }
        const { pedeVerba } = await import('./pendencias')
        const p = await pedeVerba(n || neg, verba_dia, 'dono')
        return { ok: true, verba: p.ok ? `virou pedido de R$ ${p.valor}/dia: a equipe aprova e tu confirma pro dono que ele recebe o ok por aqui` : `NÃO virou pedido: ${p.erro}. Diz pro dono, sem número de teto, que um valor desse a equipe confirma com ele antes.` }
      } },
    // 13/11: o dono pede pra mudar a verba ("aumenta pra 40 por dia"): vira pedido; a equipe aprova antes de valer (teto de R$ 60/dia)
    { name: 'pedir_verba', description: 'O dono pediu pra mudar a verba por dia dos anúncios ("aumenta pra 40 por dia", "baixa pra 20"). Vira um PEDIDO que a equipe aprova antes de valer; ele recebe a confirmação aqui. Diz isso pra ele (não diz que já mudou).',
      input_schema: { type: 'object', properties: { valor: { type: 'number', description: 'reais por dia' } }, required: ['valor'] },
      roda: async ({ valor }) => { const { pedeVerba } = await import('./pendencias'); const p = await pedeVerba((await db.um('negocios', { id: neg.id })) || neg, Number(valor), 'dono'); return p.ok ? { ok: true, pedido: `R$ ${p.valor}/dia, esperando a equipe aprovar` } : { erro: p.erro } } },
    { name: 'criar_anuncios', description: 'Cria anúncios novos com as fotos e vídeos que o dono mandou. Eles vão pra revisão da equipe e depois chegam pro dono aprovar (leva umas horas). Usa quando o dono pedir ou quando chegarem fotos/vídeos novos e ele topar.',
      input_schema: { type: 'object', properties: { quantidade: { type: 'number' }, tema: { type: 'string', description: 'ex.: Natal, promoção de terça, produto novo' } } },
      roda: async ({ quantidade, tema }) => geraAnuncios(neg, { quantidade, tema }) },
    { name: 'pecas_com_o_dono', description: 'Lista os anúncios que já foram mandados pro dono e esperam o 👍.',
      input_schema: { type: 'object', properties: {} },
      roda: async () => (await db.lista('pecas', { negocio_id: neg.id, status: 'com_dono' })).map(p => ({ id: p.id, tipo: p.tipo, gancho: p.gancho })) },
    { name: 'aprovar_pecas', description: 'O dono aprovou (👍, "pode", "aprovado"). Sem peca_id aprova todas as que estão com ele.',
      input_schema: { type: 'object', properties: { peca_id: { type: 'string' } } },
      roda: async ({ peca_id }) => { const r = await donoAprova(neg.id, peca_id); ctx.aprovou.push(...r.map(x => x.id)); return { aprovadas: r.length } } },
    { name: 'pedir_ajuste', description: 'O dono quer mudar um anúncio. Manda o pedido do jeito que ele falou; a peça é refeita e passa pela equipe de novo.',
      input_schema: { type: 'object', properties: { peca_id: { type: 'string' }, nota: { type: 'string' } }, required: ['nota'] },
      roda: async ({ peca_id, nota }) => donoAjuste(neg.id, peca_id || null, nota) },
    { name: 'numeros', description: 'Os números do negócio (do sistema): investimento, conversas, contatos novos, vendas, receita, custo por venda, retorno, de onde veio cada venda e motivos de perda.',
      input_schema: { type: 'object', properties: { periodo: { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes', '30dias'] } }, required: ['periodo'] },
      roda: async ({ periodo: p }) => { const [de, ate] = periodo(p); return numeros(neg.id, de, ate) } },
    { name: 'registrar_venda', description: 'O dono contou que vendeu ("fechei com a Ana, 180"). Marca o contato como GANHO com o valor. Se o contato não existe, cria (origem dono).',
      input_schema: { type: 'object', properties: { nome: { type: 'string' }, telefone: { type: 'string' }, valor: { type: 'number' }, produto: { type: 'string' }, veio_do_anuncio: { type: 'boolean', description: 'só se o dono disse de onde veio' } } },
      roda: async (q) => { let l = await lead(q); const jaTinha = !!l; if (!l) l = await novoLead(neg.id, { nome: q.nome, telefone: q.telefone, produto: q.produto, origem: q.veio_do_anuncio === true ? 'anuncio' : q.veio_do_anuncio === false ? 'dono' : 'outro' }, 'dono'); const g = await ganhou(l, q.valor, q.produto, 'dono'); return { ok: true, lead: g.id, nome: g.nome, valor: g.valor, origem: g.origem, ja_estava_no_funil: jaTinha } } },
    { name: 'registrar_perda', description: 'O dono contou que um contato não vai comprar. Marca PERDIDO com o motivo (preço, sumiu, comprou no concorrente, sem orçamento, outro).',
      input_schema: { type: 'object', properties: { nome: { type: 'string' }, telefone: { type: 'string' }, motivo: { type: 'string' } }, required: ['motivo'] },
      roda: async (q) => { const l = await lead(q); if (!l) return { erro: 'não achei esse contato. Pergunta o nome ou o telefone.' }; await perdeu(l, q.motivo, 'dono'); return { ok: true } } },
    { name: 'novo_contato', description: 'Registra um contato que chegou por fora (indicação, loja, Instagram) pra entrar no funil.',
      input_schema: { type: 'object', properties: { nome: { type: 'string' }, telefone: { type: 'string' }, produto: { type: 'string' }, origem: { type: 'string', enum: ['anuncio', 'organico', 'indicacao', 'dono', 'outro'] }, etapa: { type: 'string', enum: ['novo', 'conversando', 'interessado', 'proposta'] } }, required: ['nome'] },
      roda: async (q) => { const l = await novoLead(neg.id, q, 'dono'); if (q.etapa && q.etapa !== 'novo') await mudaEtapa(l, q.etapa as Etapa, 'dono'); return { ok: true, lead: l.id } } },
    { name: 'mudar_etapa', description: 'Muda a etapa de um contato no funil (conversando, interessado, proposta). Também REABRE um contato perdido ("pode reabrir a Marina"): a perda sai dos números.',
      input_schema: { type: 'object', properties: { nome: { type: 'string' }, telefone: { type: 'string' }, etapa: { type: 'string', enum: ['conversando', 'interessado', 'proposta'] }, valor: { type: 'number' }, produto: { type: 'string' } }, required: ['etapa'] },
      roda: async (q) => { const l = await lead(q); if (!l) return { erro: 'não achei esse contato' }; await mudaEtapa(l, q.etapa, 'dono', { valor: q.valor, produto: q.produto }); return { ok: true } } },
    { name: 'listar_contatos', description: 'Os contatos do funil, filtrando por etapa. Bom pra "quem tá em aberto?" ou "quem eu preciso chamar?".',
      input_schema: { type: 'object', properties: { etapa: { type: 'string', enum: ['novo', 'conversando', 'interessado', 'proposta', 'ganho', 'perdido', 'abertos', 'retomar_hoje'] } } },
      roda: async ({ etapa }) => {
        let l = await db.lista('leads', { negocio_id: neg.id }, { ordem: 'atualizado_em', desc: true })
        if (etapa === 'abertos') l = l.filter(x => !['ganho', 'perdido'].includes(x.etapa))
        else if (etapa === 'retomar_hoje') l = l.filter(x => x.proximo_followup_em && x.proximo_followup_em <= new Date(Date.now() + 86400e3).toISOString())
        else if (etapa) l = l.filter(x => x.etapa === etapa)
        return l.slice(0, 25).map(x => ({ nome: x.nome, telefone: x.telefone, etapa: x.etapa, produto: x.produto, valor: x.valor, retomar_em: x.proximo_followup_em, resumo: x.resumo }))
      } },
    { name: 'agendar_retomada', description: 'Agenda pra lembrar o dono (ou, quando o WhatsApp do negócio estiver ligado, pra Maia) de chamar um contato de novo.',
      input_schema: { type: 'object', properties: { nome: { type: 'string' }, telefone: { type: 'string' }, em_dias: { type: 'number' }, motivo: { type: 'string' } }, required: ['em_dias'] },
      roda: async (q) => { const l = await lead(q); if (!l) return { erro: 'não achei esse contato' }; await agendaFollowup(l, new Date(Date.now() + q.em_dias * 86400e3).toISOString(), q.motivo); return { ok: true } } },
    { name: 'responder_cliente', description: 'Repassa pro CLIENTE do negócio a resposta que o dono deu a uma pergunta dele (as perguntas esperando estão no pedido). Escreve a mensagem pronta, como a assistente do negócio, no TOM COM OS CLIENTES que vem no pedido (não no teu jeito com o dono).',
      input_schema: { type: 'object', properties: { nome: { type: 'string' }, telefone: { type: 'string' }, mensagem: { type: 'string' } }, required: ['mensagem'] },
      roda: async (q) => {
        // 13/11: sem nome/telefone que bata e com UMA pergunta só esperando, é dela (o dono responde sem dizer o nome)
        let l = await lead(q)
        if (!l && !q.telefone) { const so = await perguntasAbertas(neg); if (so.length === 1) l = so[0].lead }
        if (!l || !l.telefone) return { erro: 'não achei esse cliente: pergunta pro dono de quem é a resposta' }
        return responderCliente(neg, l, String(q.mensagem || ''))
      } },
    // 07/11 (piloto): o dono devolve pra Maia uma conversa de cliente que estava com ele
    { name: 'devolver_conversa', description: 'O dono pediu pra tu voltar a atender um cliente (ou todos) cuja conversa estava com ele ("devolve pra Maia", "pode atender a Carla de novo"). Sem nome, devolve todas.',
      input_schema: { type: 'object', properties: { nome: { type: 'string' } } },
      roda: async ({ nome }) => { const { devolvePeloDono } = await import('./humano'); const d = await devolvePeloDono(neg, null, nome || null); return d.length ? { ok: true, devolvidas: d } : { ok: true, devolvidas: [], obs: 'nenhuma conversa estava com o dono' } } },
    { name: 'link_do_painel', description: 'O link do PAINEL do dono (resultados, funil, retomadas, conversas dos clientes, anúncios e avisos, tudo numa tela). Usa quando ele pedir "meu painel", "dashboard", "quero ver os resultados", "onde vejo tudo". O link é pessoal e vale 30 dias: manda ele inteiro, sem mudar nada.',
      input_schema: { type: 'object', properties: {} },
      roda: async () => { const n = await db.um('negocios', { id: neg.id }); ctx.link = linkPainel(n || neg); return { link: ctx.link, vale_dias: VALIDADE_DIAS } } },
    // 13/11 (lib/maia/relatorios.ts): a análise dos anúncios (de 2 em 2 dias) e o relatório do mês, quando o dono pede
    { name: 'analise_ou_relatorio', description: 'O dono pediu a ANÁLISE dos anúncios ("me manda a análise", "como tão os anúncios") ou o RELATÓRIO DO MÊS ("o relatório do mês", "o relatório completo"). Repassa o que vier: o texto pronto, os números de agora ou o link do relatório (inteiro, sem mudar nada). Se disser que a equipe está conferindo, avisa que chega em seguida.',
      input_schema: { type: 'object', properties: { qual: { type: 'string', enum: ['analise', 'relatorio_mes'] } }, required: ['qual'] },
      roda: async ({ qual }) => { const { pedidoDoDono } = await import('./relatorios'); return pedidoDoDono((await db.um('negocios', { id: neg.id })) || neg, qual === 'relatorio_mes' ? 'relatorio_mes' : 'analise') } },
    { name: 'chamar_equipe', description: 'Passa pra equipe da escola (o Guto) o que tu não resolve: reclamação, mudança de plano, cancelamento, dúvida de pagamento, pedido fora do que tu faz.',
      input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] },
      roda: async ({ motivo }) => { await avisaEquipe('o dono chamou', `${neg.nome}: ${motivo}`, neg.id, true); return { ok: true } } },
  ]
}

const REGRAS = `${JEITO}

AGORA: tu estás no WhatsApp com a dona ou o dono de um negócio que é TEU CLIENTE (ele paga a Maia). Tu és o time de marketing dele.
O QUE TU FAZ POR ELE: cria os anúncios com as fotos e vídeos curtos que ele manda, edita os vídeos, cuida do Instagram, sobe e ajusta as campanhas, atende os clientes dele (quando o WhatsApp do negócio estiver ligado), conta cada venda e manda o resumo toda segunda.
COMO FUNCIONA A APROVAÇÃO: tudo que tu cria passa primeiro pela equipe da Carreira no Digital e depois chega pra ele dar o 👍. Campanha só liga depois do 👍 dele e da equipe. Diz isso quando ele pedir anúncio ("a equipe dá uma olhada e eu te mando hoje ainda/amanhã cedo").
REGRAS:
- Responde na hora, curto, do jeito de WhatsApp. Nunca reclama, nunca enrola.
- Número só do sistema (ferramenta numeros). Nunca inventa número. Se não tem dado, diz.
- Quando ele contar uma venda ou uma perda, registra (registrar_venda / registrar_perda) e confirma com o valor.
- De onde veio o contato: se ele já estava no funil (veio do anúncio, do Instagram etc.), tu JÁ SABE, não pergunta. Só pergunta a origem de contato novo que o dono trouxe agora, e no máximo uma vez.
- Quando chegar foto ou vídeo, agradece em uma linha. Se já tiver 3 ou mais mídias novas (ou um vídeo bom), pergunta se ele quer que tu já crie os anúncios, ou cria se ele já pediu.
- Vídeo bom pra anúncio: 10 a 30 segundos, celular em pé, com luz, mostrando o produto ou o serviço. Dá a dica se ele pedir.
- Aprende o negócio aos poucos (salvar_contexto): uma pergunta por vez, sem questionário.
- Reclamação, cancelamento, troca de plano, cobrança ou o que tu não sabe: chamar_equipe e diz que o Guto responde ali mesmo.
- Nunca fala de preço da Maia, desconto ou contrato: isso é com a equipe.
- VERBA: o dono pediu pra mudar a verba por dia → pedir_verba. Não muda na hora: a equipe aprova e ele recebe a confirmação aqui (diz isso). Também dá pra pedir no painel.
- PERGUNTA DE CLIENTE: o dono respondeu → responder_cliente (se ele não disse de quem e só tem uma esperando, é dela). Ele também pode responder pelo painel ou direto no WhatsApp do negócio.
- Ele tem um PAINEL só dele (resultados, funil, retomadas, conversas, anúncios). Pediu o painel, dashboard ou "onde vejo tudo": link_do_painel e manda o link inteiro. O link é pessoal: diz pra não repassar.
FORMATO DA RESPOSTA FINAL: uma a três mensagens, cada uma entre <msg> e </msg>. Nada fora das marcas.`

// a Maia responde o dono (o webhook chama uns segundos depois da última mensagem dele)
export async function respondeDono(conversa_id: string) {
  const cv = await db.um('conversas', { id: conversa_id })
  if (!cv || cv.canal !== 'dono' || cv.modo !== 'ia') return null
  const neg = await db.um('negocios', { id: cv.negocio_id })
  if (!neg) return null
  if ((cv.ia_respostas || 0) > MAX_IA_DIA * 30) { await avisaEquipe('conversa longa demais', neg.nome, neg.id); return null }
  const msgs = await db.lista('msgs', { conversa_id }, { ordem: 'criado_em' })
  const hist = msgs.slice(-30).map(x => `${x.autor === 'dono' ? 'DONO' : x.autor === 'equipe' ? 'EQUIPE DA ESCOLA' : 'MAIA'}: ${x.texto}`).join('\n')
  const pend = await db.lista('pecas', { negocio_id: neg.id, status: 'com_dono' })
  // perguntas de clientes que a Maia passou pro dono e ainda não foram repassadas
  const evs = await db.lista('lead_eventos', { negocio_id: neg.id })
  const abertas = evs.filter(e => e.tipo === 'pergunta_cliente' && !evs.some(x => x.tipo === 'pergunta_respondida' && x.lead_id === e.lead_id && x.criado_em > e.criado_em))
  // 05/11: pergunta de quem já fechou ou desistiu não fica esperando o dono
  const perguntas = (await Promise.all(abertas.slice(-8).map(async e => { const l = await db.um('leads', { id: e.lead_id }); return l && (l.etapa === 'ganho' || l.etapa === 'perdido') ? null : `${l?.nome || l?.telefone}: ${e.detalhe?.pergunta}` }))).filter(Boolean)
  const ultima = msgs.filter(x => x.autor === 'dono').slice(-1)[0]
  const ctx = { aprovou: [] as string[], link: '' }
  // o 👍 sozinho com peças pendentes: aprova direto (a IA só confirma)
  if (ultima && ehJoinha(ultima.texto || '') && pend.length) { const r = await donoAprova(neg.id); ctx.aprovou.push(...r.map(x => x.id)) }
  // 12/11 (limites.ts): custo de IA do dia no teto. O 👍 de cima já valeu (não usa IA); o resto espera a equipe ou o dia seguinte
  const iaHoje = await iaDoDia(neg).catch(() => null)
  if (iaHoje?.estourou) {
    const avisou = await avisaUmaVez(neg.id, 'ia_do_dia', 'teto de IA do dia', `${neg.nome}: o custo de IA de hoje chegou em R$ ${iaHoje.gasto} (teto R$ ${iaHoje.teto}). A Maia parou de responder o dono e os clientes até a meia-noite. Vale olhar o painel.`)
    const ok = ctx.aprovou.length ? 'Aprovado ✅ ' : ''
    if (avisou || ok) await mandaTexto(cv, `${ok}${avisou ? 'Hoje eu cheguei no meu limite de segurança do dia. A equipe da Carreira no Digital já foi avisada e te responde por aqui; amanhã eu volto ao normal.' : ''}`.trim())
    return null
  }
  // 07/11 (piloto): "devolve pra Maia": devolve na hora, sem depender da IA (ela só confirma)
  const { pedeDevolver, devolvePeloDono } = await import('./humano')
  const devolvidas = ultima && pedeDevolver(ultima.texto || '') ? await devolvePeloDono(neg, ultima.texto) : []
  const comGente = (await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente', modo: 'humano' })).map(c => c.nome || c.telefone)
  const pedido = `${diasDoNegocio(neg).texto} (data: ${hojeBR()})
NEGÓCIO: ${neg.nome} · ${neg.nicho || '?'} · ${neg.cidade || '?'} · plano ${neg.plano} · status ${neg.status}
DONO: ${neg.dono_nome || cv.nome || '?'}
O QUE TU JÁ SABE DO NEGÓCIO: ${JSON.stringify(neg.contexto || {})}${neg.verba_dia ? `\nVERBA COMBINADA: R$ ${neg.verba_dia}/dia` : ''}
ANÚNCIOS ESPERANDO O 👍 DELE: ${pend.length ? pend.map(p => `${p.id} "${p.gancho}"`).join('; ') : 'nenhum'}${ctx.aprovou.length ? `\n(o 👍 dele já aprovou ${ctx.aprovou.length} anúncio(s) agora: só confirma)` : ''}
PERGUNTAS DE CLIENTES ESPERANDO A RESPOSTA DO DONO: ${perguntas.length ? perguntas.join('; ') : 'nenhuma'} (quando ele responder, usa responder_cliente pra cada um e salvar_contexto pro que servir de novo. Se tu já lembrou o dono delas numa das tuas últimas mensagens da CONVERSA, não repete a lista: responde só o que ele falou agora. Lembra de novo só se ele perguntar o que falta)
TOM COM OS CLIENTES (vale no responder_cliente; contigo e com o dono é o teu jeito de sempre): ${descreveTom(tomDoNegocio(neg))}${tomDoNegocio(neg).pessoa === 'voce' ? ' (no responder_cliente: "você", "seu", "sua", "pra você"; nunca "tu", "teu", "pra ti")' : ''}
MÍDIAS GUARDADAS: ${(await db.lista('midias', { negocio_id: neg.id })).length}
CONVERSAS DE CLIENTE QUE ESTÃO COM O DONO (tu não responde): ${comGente.length ? comGente.join(', ') : 'nenhuma'}${devolvidas.length ? `\n(o sistema já devolveu pra ti as conversas com: ${devolvidas.join(', ')}. Só confirma pro dono.)` : ''}

CONVERSA:
${hist}

Responde a(s) última(s) mensagem(ns) do dono.`
  const r = await comFerramentas(REGRAS, pedido, ferramentas(neg, ctx), 6, { uso: { tipo: 'dono', negocio_id: neg?.id || null, conversa_id: cv?.id || null } })
  const partes = [...r.texto.matchAll(/<msg>([\s\S]*?)<\/msg>/g)].map(x => x[1].trim()).filter(Boolean)
  const saida = (partes.length ? partes : [r.texto.replace(/<\/?msg>/g, '').trim()]).filter(Boolean).slice(0, 3)
  // 07/11: pediu o painel e o link não saiu na resposta (a IA esqueceu a ferramenta ou mexeu no link): manda o link certo
  if ((ctx.link || (ultima && pedePainel(ultima.texto || ''))) && !saida.some(t => !!ctx.link && t.includes(ctx.link))) {
    const link = ctx.link || linkPainel((await db.um('negocios', { id: neg.id })) || neg)
    const i = saida.findIndex(t => /\/maia\/painel/.test(t))
    if (i >= 0) saida.splice(i, 1)
    saida.push(`Teu painel (pessoal, vale ${VALIDADE_DIAS} dias): ${link}`)
  }
  for (const t of saida) await mandaTexto(cv, t)
  await db.atualiza('conversas', { id: cv.id }, { ia_respostas: (cv.ia_respostas || 0) + 1, nao_lidas: 0 })
  if (maiaLocal()) for (const u of r.usadas) console.log(`  [ferramenta] ${u.nome} ${JSON.stringify(u.entrada).slice(0, 120)} → ${JSON.stringify(u.saida).slice(0, 160)}`)
  return { mensagens: saida, ferramentas: r.usadas.map(u => u.nome) }
}
