// Maia: o atendimento dos CLIENTES do negócio (03/11). Ela responde como a assistente virtual do negócio,
// leva a conversa até a venda e mexe no funil sozinha (etapa, ganho com valor, perdido com motivo, retomada).
// O canal de verdade (o WhatsApp do próprio negócio) só abre com o Tech Provider. Até lá roda na simulação
// (painel e testes), e o cérebro já fica pronto e testado.
import { maiaDb as db } from './db'
import { comFerramentas, type Ferramenta } from './ia'
import { respondeMisto, modeloBarato, modeloForte } from './misto'
import { valorAntesDoPreco } from './preco'
import { limiteRespostas, respostasHoje } from './limite'
import { iaDoDia, novasNaHora, avisaUmaVez } from './limites'
import { vozLigada, audioDaResposta } from './voz'
import { jeitoAtendimento, tomDoNegocio, noTomDoNegocio } from './tom'
import { prazoResposta, diasDoNegocio } from './horario'
import { avisoPrivacidade, respostaJaAvisa } from './lgpd'
import { conversa, mandaTexto, conversaDoDono, avisaEquipe, soltaFilaDoCliente, mandaAudioCliente } from './canal'
import { novoLead, clienteRespondeu, mudaEtapa, ganhou, perdeu, agendaFollowup, type Etapa } from './funil'
import { anotaClique } from './conversoes'
import { origemDoTexto } from './social'
import { textoDaMidia, midiaFalhou, ehComprovante, COMPROVANTE, NAO_OUVIU, NAO_VIU, type MidiaCliente } from './midia-cliente'

const semAc = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// 08/11 (teste completo, #14 Olívia): o que o CLIENTE escreveu que pede gente de verdade NA HORA. Não depende da IA lembrar
// da ferramenta: o sistema passa a conversa sozinho (modo humano + aviso pro dono). Devolve o motivo, ou null.
export function gatilhoHumano(texto: string): string | null {
  const s = semAc(texto)
  if (/\b(falar|fala|falo|conversar|atendimento|atendid[oa]|chama|chamar|chame|passa|passar|me passe|transfer\w*)\b[^.?!]{0,20}\b(com )?(uma pessoa|pessoa de verdade|alguem de verdade|um humano|humano|humana|atendente|o dono|a dona|o responsavel|a responsavel|o gerente|a gerente|alguem da (loja|equipe|empresa))\b/.test(s)
    || /\b(quero|preciso de|tem) (um|uma|alguma?|algum) (pessoa|atendente|humano)\b/.test(s)
    || /\b(nao quero|chega de) (falar com )?(robo|maquina|bot|uma ia|ia)\b/.test(s)) return 'o cliente pediu pra falar com uma pessoa'
  if (/\b(dinheiro de volta|reembolso|reembolsar|estorno|estornar|devolucao|devolver (o|meu) dinheiro|quero devolver|cancelar (o|meu) pedido)\b/.test(s)) return 'o cliente pediu devolução ou reembolso'
  if (/\b(veio|chegou|recebi)\b[^.?!]{0,20}\b(errad|estragad|quebrad|faltando|amassad|mofad|vencid)|\b(nao chegou|nao entregaram|ninguem entregou|atrasou|que absurdo|absurdo|reclama\w*|pessim\w*|horrivel|decepcion\w*|procon|nunca mais compro|falta de respeito|descaso)\b/.test(s)) return 'reclamação do cliente'
  if (/\b(apag\w*|exclu\w*|delet\w*|remov\w*)\b[^.?!]{0,25}\b(meus dados|meu numero|meu telefone|meu cadastro|minhas mensagens|minhas informacoes|meu contato)\b/.test(s)) return 'o cliente pediu pra apagar os dados dele'
  return null
}

// 08/11 (teste completo): a RESPOSTA da IA diz que passou (ou vai passar) a conversa pra uma pessoa. Se ela disse e não chamou a
// ferramenta, o sistema passa (o cliente nunca fica esperando uma pessoa que não vem). "perguntou": a IA perguntou algo ao dono
// nessa resposta (aí "o dono vai cuidar" é sobre a pergunta, não é passar a conversa)
export function respostaPassou(t: string, perguntou = false): boolean {
  const s = semAc(t)
  if (/\b(passar|passei|passando|transferir|transferi|transferindo|encaminhar|encaminhei|encaminhando|repassar|repassei)\b[^.?!]{0,25}\b(conversa|atendimento)\b/.test(s)) return true
  if (/\b(passar|passei|transferir|transferi|encaminhar|encaminhei)\b (voce|vc|te|o senhor|a senhora)\b[^.?!]{0,6}\b(pra|para|a|com)\b/.test(s)) return true
  if (/\b(uma pessoa|um atendente|uma atendente|alguem da (nossa )?(equipe|loja|empresa)|alguem de verdade|um humano)\b[^.?!]{0,25}\b(vai|ja vai|ira|responde|retorna|entra em contato|fala com)\b/.test(s)) return true
  if (!perguntou && /\b(o dono|a dona|o responsavel|a responsavel|a equipe)\b[^.?!]{0,12}\b(vai|ja vai|ira)\b[^.?!]{0,12}\b(cuidar|atender|entrar em contato|falar com|chamar)/.test(s)) return true
  // 08/11 (reteste, #17): "Já encaminhei seu pedido de reembolso para o responsável"
  if (!perguntou && /\b(passei|encaminhei|repassei|vou passar|vou encaminhar)\b[^.?!]{0,35}\b(para|pro|pra|ao)\b (o |a )?(responsavel|dono|dona|equipe|gerente)\b/.test(s)) return true
  return false
}

// 08/11 (reteste, #17): na passagem pro dono a IA às vezes ainda pedia "me conta o que aconteceu", mas quem responde agora é o
// dono (ela não volta). Na passagem, a frase que pede detalhe ao cliente sai: fica só o aviso de que a pessoa vai falar com ele
const PEDE_DETALHE = /\b(me (conta|conte|contar|diz|diga|dizer|explica|explique|explicar|fala|fale|falar|passa|passe|manda|mande|mandar|envia|envie|enviar|adianta|adiante)|pode(ria)? (me )?(contar|dizer|explicar|detalhar|descrever|adiantar|mandar|enviar|passar|informar)|consegue (me )?(contar|dizer|explicar|detalhar|descrever|adiantar|mandar|enviar|passar|informar)|conta (pra|para) (mim|gente|nos)|o que (aconteceu|houve|ocorreu)|qual (foi|e) o (problema|numero do pedido|pedido)|mais detalhes|algum detalhe)\b/
export function semPedirDetalhes(t: string): string {
  return String(t || '').split(/(?<=[.!?])\s+/).filter(f => !PEDE_DETALHE.test(semAc(f))).join(' ').trim()
}

// uma mensagem de cliente que chegou no WhatsApp do negócio. referral = o anúncio de onde veio (CTWA), quando vier
// 07/11 (piloto): d.tipo 'audio' ou 'image' com d.midia (o arquivo já baixado) vira texto: transcrição ou descrição (midia-cliente.ts)
export async function recebeDoCliente(neg: any, d: { telefone: string; nome?: string | null; texto: string; wamid?: string | null; referral?: { source_id?: string; headline?: string; ctwa_clid?: string | null; source_url?: string | null } | null; tipo?: string | null; midia?: MidiaCliente | null; legenda?: string | null }) {
  if (d.wamid && (await db.um('msgs', { wamid: d.wamid }))) return null
  // 06/11: sem anúncio, o texto pronto do link do perfil ("Vim pelo Instagram") marca a origem (só na 1ª mensagem: lead que já existe fica como está)
  let lead = await novoLead(neg.id, { telefone: d.telefone, nome: d.nome, origem: d.referral?.source_id ? 'anuncio' : origemDoTexto(d.texto) || 'organico', anuncio_ref: d.referral?.source_id || null })
  // 06/11: veio do clique no anúncio: guarda o ctwa_clid e avisa a Meta (LeadSubmitted). Nunca derruba o atendimento.
  if (d.referral?.ctwa_clid) await anotaClique(neg, lead, d.referral).catch(() => null)
  lead = await clienteRespondeu(lead)
  const cv = await conversa(neg.id, 'cliente', d.telefone, { nome: d.nome, lead_id: lead.id })
  if (!cv.lead_id) await db.atualiza('conversas', { id: cv.id }, { lead_id: lead.id })
  let texto = d.texto, tipo = 'texto', comprovante = false
  if (d.tipo === 'audio' || d.tipo === 'image') {
    const m = await textoDaMidia(neg, cv, d.tipo, d.midia || null, d.legenda)
    texto = m.texto; tipo = d.tipo === 'audio' ? 'audio' : 'imagem'; comprovante = m.comprovante
  }
  await db.insere('msgs', { conversa_id: cv.id, negocio_id: neg.id, autor: 'cliente', tipo, texto, wamid: d.wamid || null, status: 'recebido' }).catch(() => null)
  // comprovante de pagamento: a Maia nunca confirma sozinha. Chama o dono pra conferir (a venda só é marcada quando ele confirma)
  if (comprovante) {
    await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: lead.id, tipo: 'comprovante', autor: 'maia', detalhe: {} }).catch(() => null)
    const dcv = await conversaDoDono(neg)
    await mandaTexto(dcv, `${lead.nome || 'Um cliente'} (${lead.telefone || ''}) mandou um comprovante de pagamento. Confere se caiu e me diz aqui: aí eu marco a venda.`).catch(() => null)
    // 08/11 (teste completo, #20): o comprovante já é a pergunta pro dono (com prazo e lembrete). Se a IA também chamar
    // perguntar_ao_dono sobre o pagamento, não sai um 2º aviso (dedup em perguntar_ao_dono)
    await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: lead.id, tipo: 'pergunta_cliente', autor: 'maia', detalhe: { pergunta: 'mandou um comprovante de pagamento: confere se caiu', comprovante: true, prazo: prazoResposta(neg).quando } }).catch(() => null)
  }
  await db.atualiza('conversas', { id: cv.id }, { ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString(), janela_ate: new Date(Date.now() + 24 * 3600e3).toISOString(), nao_lidas: (cv.nao_lidas || 0) + 1 })
  // 07/11 (piloto): a janela abriu: entrega as respostas do dono/equipe que esperavam (depois de 24 h, maia_resposta).
  // Se entregou, a Maia não responde por cima ("Pode mandar" → a resposta já foi)
  const entregues = await soltaFilaDoCliente({ ...cv, lead_id: lead.id }).catch(() => 0)
  return { cv: { ...cv, lead_id: lead.id } as any, lead, responder: cv.modo === 'ia' && !entregues, entregues }
}

type Ctx = { humano: boolean; comprovante?: boolean; textoCliente?: string }

// 08/11 (teste completo, etapa): recusa FIRME ("tá caro, não quero.", "desisti", "vou comprar na internet"), sem pergunta.
// Se a IA não marcou perdido, o sistema marca (com o motivo que dá pra tirar da frase). "Não quero glúten" não é recusa.
export function recusaFirme(t: string): string | null {
  const s = semAc(t)
  if (/\?/.test(s)) return null
  if (!/\b(nao quero(\s*[,.!]|\s*$|\s+mais\b|\s+nao\b|\s+obrigad)|desisti\w*|vou comprar (em outr|na internet|no concorrente|la)|comprei (em outr|no concorrente|na internet|la)|nao vou (querer|comprar|levar|fechar)|nao tenho mais interesse|sem interesse|deixa pra la)/.test(s)) return null
  if (/\b(caro|cara|preco|valor|salgado)\b/.test(s)) return 'preço: achou caro e disse que não quer'
  if (/\b(internet|outro lugar|outra loja|concorrente|comprei)\b/.test(s)) return 'vai comprar (ou comprou) em outro lugar'
  return 'o cliente disse que não quer'
}

// 08/11 (teste completo, etapa): o cliente disse que quer, com quantidade ("quero 2 caixas", "vou querer 1", "pode separar").
// Se a IA não mexeu no funil, o sistema põe em "proposta" (a mesma pergunta não pode deixar um em conversando e outro em proposta)
export function querComprar(t: string, neg: any = null) {
  const s = semAc(t)
  if (!/\?/.test(s) && /\b(fechado|pode (fazer|separar|reservar|anotar|mandar fazer|preparar))\b/.test(s)) return true
  // quantidade + algo que o negócio vende ("quero 2 caixas", "queria 1 caixa de 4"): "quero uma informação" não conta
  const base = semAc(JSON.stringify(neg?.contexto || {}))
  // "quero 1." sozinho (depois de saber o preço) também vale
  return [...s.matchAll(/\b(quero|queria|vou querer|vou levar|vou pegar|me ve|me manda|separa|reserva)\s+(\d+|uma?|duas|dois|tres|quatro|cinco|seis|meia duzia)(?:\s+(\p{L}+)|\s*(?=[.!,;]|$))/gu)]
    .some(m => !m[3] || (/^\d+$/.test(m[2]) && m[3] !== 'informacao') || (m[3].length >= 4 && base.includes(m[3].slice(0, 5))))
}

// 08/11 (teste completo, #12): o cliente recusou com todas as letras? (só aí vale "perdido")
export const recusou = (t: string) => /\b(nao (quero|vou (querer|comprar|levar|pedir|fechar|precisar)|preciso mais|tenho (mais )?interesse|me interessa|vai dar|da pra mim|compensa|obrigad[oa]?,? (nao|mas nao))|desist\w*|deixa (pra la|quieto)|esquece|comprei (em outr|no concorrente|la)|ja comprei|sem interesse|fica pra (proxima|outra))\b/.test(semAc(t))
// 08/11 (teste completo, #19): o motivo da passagem tem que dizer alguma coisa ("Não" não é motivo)
export const motivoClaro = (m: string) => { const s = semAc(m).replace(/[^a-z0-9 ]+/g, ' ').trim(); return s.length >= 12 && s.split(/\s+/).length >= 3 && !/^(nao|sim|ok|nada|outro|sem motivo|n a)$/.test(s) }
export const motivoDePassagem = (m: string) => /\b(reclama\w*|pessoa|humano|atendente|devolu\w*|reembols\w*|dinheiro de volta|estorn\w*|apagar|dados|irritad\w*|brav[oa]|delicad\w*|ameac\w*|processo|procon|juridic\w*|advogad\w*|cancel\w*|errad\w*|estragad\w*|insatisf\w*|ofend\w*|agressiv\w*)\b/.test(semAc(m))
// 08/11 (regra fixa da casa, valor antes do preço): o cliente perguntou quanto custa
export const perguntaPreco = (t: string) => /\b(quanto (e|eh|custa|custam|sai|saem|fica|ficam|cobra|cobram|seria|ta|esta)|qual (e |o )?(o )?(preco|valor)|preco|precos|valor(es)?|orcamento)\b/.test(semAc(t))
// 07/11 (piloto): disse que vai confirmar
export const prometeuConfirmar = (t: string) => /\b(vou|vamos|deixa eu|preciso) (confirmar|verificar|checar|conferir|ver com)\b|\bconfirm(o|ar) com\b/i.test(t)
// 08/11 (teste completo, #3 parcelamento): "não tenho essa informação" e parecidos, sem perguntar pro dono, deixavam o cliente
// sem resposta. Agora isso também chama o dono (pela rede de segurança) e o cliente ganha o prazo
export const naoSabe = (t: string) => /\b(nao tenho (essa|esta|a|essas|estas|esse|este|o|os|as)? ?(informac\w*|info|dado|detalhe|resposta|certeza)|nao tenho (o|a) (preco|valor|prazo)|nao (sei|saberia) (te |lhe )?(dizer|informar|responder|confirmar|se)|nao (consta|esta|aparece) (aqui|no que eu sei|na minha base)|nao tenho como (confirmar|saber|informar)|sem essa informac\w*|essa informac\w* (eu )?nao tenho)\b/.test(semAc(t))
// 08/11 (teste completo, #20): a pergunta já foi pro dono há pouco (mesma conversa e mesmo assunto, sem resposta ainda)?
const palavras = (t: string) => new Set(semAc(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 4))
export function parecidas(a: string, b: string) {
  const x = palavras(a), y = palavras(b)
  if (!x.size || !y.size) return false
  let comum = 0; for (const w of x) if (y.has(w)) comum++
  return comum / Math.min(x.size, y.size) >= 0.6
}
const sobrePagamento = (t: string) => /\b(comprovante|pagamento|pagou|pago|paguei|pix|caiu|transferencia|deposito)\b/.test(semAc(t))
async function perguntaRepetida(lead: any, pergunta: string) {
  const evs = await db.lista('lead_eventos', { lead_id: lead.id })
  return evs.some(e => e.tipo === 'pergunta_cliente' && Date.now() - Date.parse(e.criado_em) < 30 * 60e3
    && !evs.some(x => x.tipo === 'pergunta_respondida' && x.criado_em > e.criado_em)
    && ((e.detalhe?.comprovante && sobrePagamento(pergunta)) || parecidas(String(e.detalhe?.pergunta || ''), pergunta)))
}
// 08/11 (reteste, #15): "não tenho informações sobre outros negócios" NÃO é dúvida do negócio (nada vai pro dono)
export const foraDoAssunto = (t: string) => /\b(outr[oa]s? (negocios?|clientes?|empresas?|pessoas?|lojas?)|instruc\w*|tuas regras|suas regras|prompt|dados de outr\w*|telefone de outr\w*)\b/.test(semAc(t))
// 08/11 (reteste, #6): o cliente fechou/pagou de verdade? (venda_fechada só com isso, ou com o contato já em proposta)
export const sinalDeCompra = (t: string) => /\b(paguei|pago|pix feito|fiz o pix|transferi|comprovante|fechado|fechou|confirm\w*|pode (fazer|separar|mandar|preparar)|quero|vou querer|vou levar)\b/.test(semAc(t))
// pergunta "pro dono" que na verdade é recado interno (etapa, funil, engano)
export const perguntaInterna = (t: string) => /\b(marquei|marcou|marcad[ao] como|por engano|reabr\w*|cards?|funil|etapa|perdid[ao]|venda_perdida|mudar_etapa|ferramenta|o sistema)\b/.test(semAc(t))

// passa a conversa pro dono: modo humano, sem retomada automática (quem fala agora é gente) e um aviso só pro dono
async function passaConversa(neg: any, cv: any, lead: any, ctx: Ctx, motivo: string, por: 'maia' | 'sistema') {
  ctx.humano = true
  const atual = await db.um('conversas', { id: cv.id })
  if (atual?.modo === 'humano') return
  await db.atualiza('conversas', { id: cv.id }, { modo: 'humano' })
  await db.evento('modo_humano', neg.id, { conversa_id: cv.id, por, motivo })
  if (lead?.id) await db.atualiza('leads', { id: lead.id }, { proximo_followup_em: null }).catch(() => null)
  const dcv = await conversaDoDono(neg)
  await mandaTexto(dcv, `${lead?.nome || 'Um cliente'} (${lead?.telefone || ''}) precisa de ti: ${motivo.trim().replace(/[.!?\s]+$/, '')}. A conversa agora está contigo: eu não respondo mais ali até tu me pedir ("devolve pra Maia").`)
}

function ferramentas(neg: any, cv: any, lead: any, ctx: Ctx): Ferramenta[] {
  return [
    { name: 'mudar_etapa', description: 'Atualiza a etapa do cliente no funil: conversando (tirando dúvida), interessado (quer, falta decidir), proposta (recebeu preço/orçamento/horário).',
      input_schema: { type: 'object', properties: { etapa: { type: 'string', enum: ['conversando', 'interessado', 'proposta'] }, produto: { type: 'string' }, valor: { type: 'number' }, resumo: { type: 'string' } }, required: ['etapa'] },
      // 07/11 (juntou as duas correções): no teste a IA chamou venda_perdida e, na mesma resposta, mudar_etapa, e o perdido voltava pra "conversando".
      // Contato já ganho ou perdido não volta pelo atendimento (se o cliente voltar a falar, quem reabre é o dono ou a equipe)
      // 08/11 (teste completo, #12): o perdido errado não acontece mais (venda_perdida só com recusa), então aqui continua a trava
      roda: async (q) => { if (lead.etapa === 'ganho' || lead.etapa === 'perdido') return { ok: false, aviso: `esse cliente já está ${lead.etapa}: a etapa não muda` }; lead = await mudaEtapa(lead, q.etapa as Etapa, 'maia', q); return { ok: true } } },
    { name: 'venda_fechada', description: 'O cliente fechou: agendou e confirmou, pagou ou fez o pedido. Marca GANHO com o valor.',
      input_schema: { type: 'object', properties: { valor: { type: 'number' }, produto: { type: 'string' } }, required: ['produto'] },
      roda: async (q) => {
        // 07/11 (piloto): comprovante em foto não é venda confirmada: quem confere é o dono (ele já foi avisado)
        if (ctx.comprovante) { lead = await mudaEtapa(lead, 'proposta', 'maia', { produto: q.produto, valor: q.valor }); return { erro: 'o cliente mandou um comprovante: tu NÃO confirma pagamento. Diz que recebeu e que o dono confere e confirma. O dono já foi avisado.' } }
        // 08/11 (reteste): só com sinal de compra de verdade ("Valeu, obrigado!" virou GANHO sem valor numa rodada)
        if (!sinalDeCompra(ctx.textoCliente || '') && !['proposta', 'interessado'].includes(lead.etapa)) return { erro: 'não marcado: o cliente não fechou nem pagou. Agradecimento ou pergunta não é venda: segue na etapa em que está.' }
        lead = await ganhou(lead, q.valor, q.produto, 'maia'); const dcv = await conversaDoDono(neg); await mandaTexto(dcv, `Venda nova 💰 ${lead.nome || 'Cliente'}: ${q.produto || lead.produto || 'pedido'}${q.valor ? ', R$ ' + q.valor : ''}.`); return { ok: true } } },
    { name: 'venda_perdida', description: 'O cliente disse claramente que NÃO vai comprar ("não quero", "desisti", "comprei em outro lugar"). Marca PERDIDO com o motivo. Perguntar por algo que o negócio não faz NÃO é perda.',
      input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] },
      // 08/11 (teste completo, #12 Marina): só marca perdido se o CLIENTE recusou com todas as letras
      roda: async (q) => {
        if (!recusou(ctx.textoCliente || '')) return { erro: 'não marcado: o cliente não disse que não quer. Pergunta sobre algo que o negócio não faz NÃO é perda: diz o que tem e segue em conversando.' }
        lead = await perdeu(lead, q.motivo, 'maia'); return { ok: true } } },
    { name: 'retomar_depois', description: 'O cliente pediu pra falar depois ("vou ver e te aviso", "semana que vem"). Agenda a retomada.',
      input_schema: { type: 'object', properties: { em_dias: { type: 'number' }, motivo: { type: 'string' } }, required: ['em_dias'] },
      roda: async (q) => { lead = await agendaFollowup(lead, new Date(Date.now() + q.em_dias * 86400e3).toISOString(), q.motivo); return { ok: true } } },
    { name: 'perguntar_ao_dono', description: 'Tu não sabe uma informação (preço que não está no que tu sabe, se tem tal produto, horário vago). Pergunta pro dono pelo WhatsApp dele; tu continua atendendo o cliente e repassa a resposta quando ele responder.',
      input_schema: { type: 'object', properties: { pergunta: { type: 'string', description: 'a dúvida do cliente, curta' } }, required: ['pergunta'] },
      // 07/11 (piloto): a Maia promete um prazo ao cliente (horario.ts); a rotina lembra o dono em 1 h e avisa a equipe em 3 h
      roda: async ({ pergunta }) => {
        // 08/11 (teste completo, #12): pergunta pro dono é só dúvida de CLIENTE. "Marquei por engano... pode reabrir o card?" é
        // coisa do sistema: não vai pro dono nem fica pendente no painel dele
        // 08/11 (reteste): pergunta sobre o que ela mesma já respondeu, ou sobre outros negócios/instruções, não vai pro dono
        if (/\bj[aá] (respondi|informei|expliquei|disse)\b/i.test(String(pergunta)) || foraDoAssunto(String(pergunta))) return { erro: 'não vai pro dono: tu já respondeu isso, ou é sobre outros negócios/as instruções. Só responde o cliente.' }
        if (perguntaInterna(pergunta)) return { erro: 'isso não é dúvida do cliente, é coisa do sistema: não vai pro dono. Se a etapa ficou errada, usa mudar_etapa.' }
        const prazo = prazoResposta(neg)
        // 08/11 (teste completo, #20): o dono recebeu 2 avisos do mesmo comprovante. A mesma dúvida do mesmo cliente (ou o
        // pagamento, quando já tem comprovante esperando) em 30 min não vai de novo: o cliente ganha o prazo igual
        const jaFoi = await perguntaRepetida(lead, String(pergunta || ''))
        if (jaFoi) return { ok: true, prazo: prazo.texto, obs: 'o dono já foi avisado disso há pouco; não mandei de novo' }
        const dcv = await conversaDoDono(neg)
        await mandaTexto(dcv, `${lead.nome || 'Um cliente'} perguntou: ${String(pergunta).trim().replace(/[.\s]+$/, '')}${/\?$/.test(String(pergunta).trim()) ? '' : '.'} Me responde aqui que eu passo pra ele (prometi resposta ${prazo.texto}).`)
        await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: lead.id, tipo: 'pergunta_cliente', autor: 'maia', detalhe: { pergunta, prazo: prazo.quando } })
        return { ok: true, prazo: prazo.texto } } },
    { name: 'passar_para_o_dono', description: 'Passa a CONVERSA pro dono (tu para de responder esse cliente): só quando o cliente pede pra falar com uma pessoa, reclama, pede devolução, pede pra apagar os dados, ou é um caso delicado. NUNCA numa conversa normal (preço, entrega, áudio que tu entendeu). O motivo é uma frase clara pro dono.',
      input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] },
      // 08/11 (teste completo, #19 Tiago): a IA passou um áudio respondido certinho com o motivo "Não", e o dono recebeu
      // "Tiago precisa de ti: Não". Agora: motivo claro E um gatilho de verdade (na conversa ou no motivo); senão ela segue atendendo
      roda: async ({ motivo }) => {
        const m = String(motivo || '').trim()
        if (!motivoClaro(m) || !(gatilhoHumano(ctx.textoCliente || '') || motivoDePassagem(m))) return { erro: 'não passou: passar_para_o_dono é só com motivo claro (o cliente pediu uma pessoa, reclamou, pediu devolução, pediu pra apagar os dados, ou é um caso delicado). Tu segue atendendo normalmente.' }
        await passaConversa(neg, cv, lead, ctx, m, 'maia'); return { ok: true } } },
  ]
}

// 07/11 (piloto): o jeito de falar com o cliente vem do cadastro do negócio (tom.ts), não do JEITO da Maia com o dono
const regras = (neg: any) => `${jeitoAtendimento(neg)}

AGORA: tu és a ASSISTENTE VIRTUAL do negócio "${neg.nome}" (${neg.nicho || ''}, ${neg.cidade || ''}) e estás atendendo um CLIENTE dele no WhatsApp. Tu falas em nome do negócio.
O QUE TU SABE DO NEGÓCIO (só isso, não inventa nada além): ${JSON.stringify(neg.contexto || {})}
COMO ATENDER:
- Se apresenta na primeira mensagem como a assistente virtual do ${neg.nome}. Se perguntarem, diz que é uma IA.
- Responde rápido e direto o que perguntaram. Depois, UMA pergunta que leva pra venda (horário, quantidade, endereço de entrega).
- Preço, prazo, horário e condição: só o que está no que tu sabe. O que não está: diz que vai confirmar e responde até o PRAZO DE RESPOSTA que vem no pedido (ex.: "vou confirmar aqui e te respondo hoje até as 16h") e perguntar_ao_dono. Nunca deixa o cliente sem prazo. Tu SEGUE atendendo (passar_para_o_dono é só quando o cliente quer falar com uma pessoa ou reclama).
- PERGUNTOU O PREÇO (regra fixa da casa: primeiro o valor, depois o número): uma ou duas frases curtas do que o cliente ganha (o que está incluso, o resultado, o benefício), SÓ com o que está no que tu sabe, e logo em seguida o preço, na mesma resposta. Ex.: "A limpeza profunda leva uns 60 minutos: tira cravos e impurezas e a pele fica lisinha e com viço. O investimento é R$ 180, e dá pra fazer em 3x." Sem enrolar, sem esconder o preço e sem fazer outra pergunta antes de dizer o preço. Se o que tu sabe não tem nada além do preço, diz o preço direto (não inventa benefício).
- O FUNIL, sempre que a conversa andar:
  · tirando dúvida → mudar_etapa conversando; quer, falta decidir → interessado; recebeu preço, orçamento ou marcou horário/visita → proposta (com o valor, se tiver).
  · já sabe o preço e disse que quer ("quero 1", "fechado", "vou comprar o de 890", "pode fazer"), faltando só pagar, mandar a foto ou combinar entrega/horário → proposta com o valor (não é mais "interessado").
  · venda_fechada SÓ quando a venda aconteceu de verdade: pagou, confirmou o pedido com pagamento, ou é serviço agendado E pago. "Vou passar aí comprar" ou "quero agendar" é proposta: quem confirma a venda depois é o dono.
  · só perguntou o preço → conversando (proposta é quando ele já mostrou que quer: quantidade, dia, endereço).
  · o cliente disse que NÃO quer ("tá caro, não quero", "comprei em outro lugar", "não preciso mais") → venda_perdida com o motivo, e responde com educação deixando a porta aberta.
  · perguntou por algo que o negócio não faz → diz que não faz, oferece o que tem e segue em conversando. Isso NÃO é perda (ele não disse que não quer).
  · "vou pensar", "te aviso", "semana que vem" → retomar_depois.
- SEMPRE escreve a resposta pro cliente, mesmo quando usa ferramenta.
- Nunca insiste depois de um não. Nunca promete o que o negócio não disse que faz.
- DIA E HORÁRIO: o pedido traz HOJE e AMANHÃ (dia da semana e data) e se o negócio abre. Retirada, entrega, visita ou encomenda só num dia em que o negócio abre e respeitando a antecedência que está no que tu sabe. O cliente pediu pra um dia em que não abre (ou sem a antecedência): diz que nesse dia não dá e oferece o próximo dia que dá. Nunca aceita dia fechado. "Amanhã", "sábado" etc.: confere no calendário do pedido antes de responder.
- Nunca diz que vai confirmar ou verificar algo sem chamar perguntar_ao_dono NESSA MESMA resposta.
- Nunca responde só "não tenho essa informação" ou "não sei": se é coisa do negócio que tu não sabe (parcelamento, ingrediente, prazo, um produto), chama perguntar_ao_dono e diz que confirma até o PRAZO DE RESPOSTA.
- Nunca diz que passou a conversa pra alguém ou que alguém vai entrar em contato sem chamar passar_para_o_dono NESSA MESMA resposta. Reclamação, cliente irritado ou pedido de dinheiro de volta: chama passar_para_o_dono na primeira mensagem.
- Não supõe o gênero do cliente ("chateado/chateada"): usa palavras neutras se não souber.
- ÁUDIO E FOTO: "(áudio) ..." é a transcrição do que o cliente falou; "(mandou uma foto: ...)" é o que aparece na foto. Se vier "${NAO_OUVIU}" ou "${NAO_VIU}", tu NÃO ouviu nem viu: diz com honestidade que não conseguiu ouvir/ver e pede pra escrever. Nunca finge que ouviu ou viu.
- O cliente pediu pra apagar os dados dele (LGPD): diz que o pedido foi anotado e que o negócio apaga, e chama passar_para_o_dono com o motivo "pediu pra apagar os dados". O aviso de privacidade da 1ª resposta o sistema manda sozinho: tu não repete.
- "${COMPROVANTE}": tu NUNCA confirma pagamento nem diz que "caiu". Diz que recebeu o comprovante e que o dono confere e confirma. Não usa venda_fechada (o dono já foi avisado).
FORMATO: uma ou duas mensagens, cada uma entre <msg> e </msg>.`

// texto que é relatório pra equipe e não mensagem pro cliente (fala do cliente na 3ª pessoa, de etapa, de ferramenta)
const RELATORIO = /\b([Rr]espondi|[Aa]visei|[Mm]andei|[Pp]erguntei|[Dd]isse|[Ee]xpliquei)( pr[ao]| a| o| à)? [A-ZÁÉÍÓÚ][a-zà-ú]+\b|\b[Dd]eixei a conversa\b|\betapa\s*["“']|\b(a|o) cliente\b|\b([Ee]la|[Ee]le) (perguntou|pediu|quer saber)\b|perguntar_ao_dono|mudar_etapa/

export async function respondeCliente(conversa_id: string) {
  const cv = await db.um('conversas', { id: conversa_id })
  if (!cv || cv.canal !== 'cliente' || cv.modo !== 'ia') return null
  const neg = await db.um('negocios', { id: cv.negocio_id })
  let lead = cv.lead_id ? await db.um('leads', { id: cv.lead_id }) : null
  if (!neg || !lead) return null
  const msgs = await db.lista('msgs', { conversa_id }, { ordem: 'criado_em' })
  const hist = msgs.slice(-30).map(x => `${x.autor === 'cliente' ? 'CLIENTE' : x.autor === 'dono' || x.autor === 'equipe' ? 'DONO' : 'TU'}: ${x.texto}`).join('\n')
  // 07/11 (piloto): o que o cliente mandou desde a nossa última resposta. Se é só áudio/foto que não deu pra abrir, a resposta
  // é fixa (sem IA: nenhuma chance de fingir que ouviu ou viu)
  // 07/11 (piloto, LGPD): 1ª resposta pra esse cliente (ninguém do negócio falou com ele ainda) leva o aviso de privacidade no fim
  const primeira = !msgs.some(x => x.autor === 'maia' || x.autor === 'dono' || x.autor === 'equipe')
  let aviso = primeira ? avisoPrivacidade(neg) : null
  const ultNossa = msgs.map(x => x.autor).lastIndexOf('maia')
  const novas = msgs.slice(ultNossa + 1).filter(x => x.autor === 'cliente')
  // 08/11 (T12): mais de 40 respostas da Maia hoje nessa conversa: passa pro dono e avisa a equipe (limite.ts)
  const limite = limiteRespostas(neg)
  if (respostasHoje(msgs) >= limite) {
    await passaConversa(neg, cv, lead, { humano: false }, `a conversa passou de ${limite} respostas da Maia hoje`, 'sistema')
    const t = `Passei a ${tomDoNegocio(neg).pessoa === 'tu' ? 'tua' : 'sua'} conversa pra uma pessoa da equipe, que responde aqui mesmo.`
    await mandaTexto(cv, t)
    await avisaEquipe('conversa passou do limite', `${neg.nome}: a conversa com ${lead.nome || cv.telefone} passou de ${limite} respostas da Maia hoje. Passei pro dono (modo humano). Vale olhar no painel.`, neg.id)
    return { mensagens: [t], ferramentas: ['limite_respostas'], etapa: lead.etapa, humano: true, limite: true }
  }
  // 12/11 (limites.ts): os freios do negócio, antes de gastar IA. (1) o custo de IA do dia passou do teto; (2) contato NOVO
  // numa enxurrada (mais contatos novos na última hora do que o teto). Nos dois casos a Maia não responde com IA: a conversa
  // vai pro dono, o cliente recebe uma frase fixa e honesta (com o aviso de privacidade, se é a 1ª) e a equipe é avisada 1x por dia.
  const freio = await (async () => {
    const ia = await iaDoDia(neg)
    if (ia.estourou) return { motivo: 'ia_do_dia', dono: `o custo de IA de hoje chegou no teto (R$ ${ia.gasto} de R$ ${ia.teto})`,
      equipe: `${neg.nome}: o custo de IA de hoje chegou em R$ ${ia.gasto} (teto R$ ${ia.teto}). A Maia parou de responder os clientes até a meia-noite e passa cada conversa pro dono. Vale olhar o painel: pode ser conversa em círculo ou robô do outro lado.` }
    if (primeira) {
      const nv = await novasNaHora(neg)
      if (nv.passou) return { motivo: 'enxurrada', dono: `chegaram ${nv.novas} contatos novos na última hora (o teto é ${nv.teto}) e eu deixei os de agora contigo`,
        equipe: `${neg.nome}: ${nv.novas} contatos novos na última hora (teto ${nv.teto}). Os novos vão direto pro dono, sem IA. Pode ser anúncio bombando (bom: subir o teto) ou ataque/disparo errado (ruim: desligar o atendimento).` }
    }
    return null
  })().catch(() => null)
  if (freio) {
    // passa sem o recado por conversa (numa enxurrada seriam dezenas no WhatsApp do dono): o dono recebe UM recado por dia
    if ((await db.um('conversas', { id: cv.id }))?.modo !== 'humano') {
      await db.atualiza('conversas', { id: cv.id }, { modo: 'humano' })
      await db.evento('modo_humano', neg.id, { conversa_id: cv.id, por: 'sistema', motivo: freio.motivo })
      if (lead?.id) await db.atualiza('leads', { id: lead.id }, { proximo_followup_em: null }).catch(() => null)
    }
    const t = `${primeira ? `Oi! Aqui é a assistente virtual do ${neg.nome}. ` : ''}Recebi ${tomDoNegocio(neg).pessoa === 'tu' ? 'tua' : 'sua'} mensagem e uma pessoa da equipe responde aqui mesmo, assim que puder.`
    await mandaTexto(cv, t)
    if (aviso) await mandaTexto(cv, aviso)
    if (await avisaUmaVez(neg.id, freio.motivo, freio.motivo === 'ia_do_dia' ? 'teto de IA do dia' : 'enxurrada de contatos novos', freio.equipe)) {
      const dcv = await conversaDoDono(neg)
      await mandaTexto(dcv, `Aviso: ${freio.dono}. Os clientes que escreverem agora ficam contigo (eu não respondo esses): aparecem no painel e no teu WhatsApp do negócio. A equipe da Carreira no Digital já foi avisada.`).catch(() => null)
    }
    return { mensagens: aviso ? [t, aviso] : [t], ferramentas: ['freio_' + freio.motivo], etapa: lead.etapa, humano: true, limite: true }
  }
  if (novas.length && novas.every(x => midiaFalhou(x.texto))) {
    const audio = novas.some(x => String(x.texto).includes(NAO_OUVIU)), foto = novas.some(x => String(x.texto).includes(NAO_VIU))
    const oque = audio && foto ? 'abrir o áudio e a foto' : audio ? 'ouvir esse áudio' : 'ver essa foto'
    const t = `${primeira ? `Oi! Aqui é a assistente virtual do ${neg.nome}. ` : ''}Não consegui ${oque}. Consegue me escrever o que precisa, por favor?`
    await mandaTexto(cv, t)
    if (aviso) await mandaTexto(cv, aviso)
    await db.atualiza('conversas', { id: cv.id }, { ia_respostas: (cv.ia_respostas || 0) + 1, nao_lidas: 0 })
    return { mensagens: aviso ? [t, aviso] : [t], ferramentas: [] as string[], etapa: lead.etapa, midia_falhou: true }
  }
  const textoCliente = (novas.length ? novas : msgs.filter(x => x.autor === 'cliente').slice(-1)).map(x => x.texto).join(' / ')
  const ctx: Ctx = { humano: false, comprovante: msgs.slice(-12).some(x => x.autor === 'cliente' && ehComprovante(x.texto)), textoCliente }
  const ferrs = ferramentas(neg, cv, lead, ctx)
  // 08/11 (teste completo): pedido de pessoa, reclamação, devolução ou apagar dados: a IA já sabe que é passagem (e o sistema garante)
  const gatilho = gatilhoHumano(textoCliente)
  // 08/11 (regra fixa da casa): perguntou o preço → primeiro o valor (o que ganha), logo depois o número
  const precoAgora = perguntaPreco(textoCliente) ? '\nO CLIENTE PERGUNTOU O PREÇO (regra fixa: valor antes do preço). Depois da apresentação, a ordem é: 1º) uma ou duas frases curtas do que ele ganha (o que vem, o que inclui, o resultado), só com o que tu sabe do negócio; 2º) o preço, na mesma mensagem, logo em seguida. A frase com "R$" NUNCA vem antes da frase do valor.\nOrdem certa (exemplo de outro negócio): "A pizza grande tem 8 fatias e vem com a borda recheada. Ela sai R$ 59."\nOrdem errada: "A pizza grande sai R$ 59. Ela tem 8 fatias e vem com a borda recheada."\nSe o que tu sabe do negócio só tem o preço (nada do que inclui ou do resultado), diz o preço direto e não inventa benefício.' : ''

  const { r, modelo: modeloIA, refez } = await respondeMisto(regras(neg), `CLIENTE: ${lead.nome || cv.nome || 'sem nome'} · etapa ${lead.etapa}${lead.anuncio_ref ? ' · veio do anúncio ' + lead.anuncio_ref : ''}\n${diasDoNegocio(neg).texto}\nPRAZO DE RESPOSTA (se precisar perguntar ao dono): ${prazoResposta(neg).texto}${gatilho ? `\nATENÇÃO: ${gatilho}. Chama passar_para_o_dono AGORA com esse motivo e diz ao cliente que passou a conversa pra uma pessoa da equipe, que responde por aqui mesmo. NÃO pede detalhes nem pergunta o que aconteceu: quem conversa com ele agora é a pessoa.` : ''}${precoAgora}\n\nCONVERSA:\n${hist}\n\nResponde a(s) última(s) mensagem(ns) do cliente.`, ferrs,
    // 06/11: o atendimento do cliente roda no modelo menor (custo-benefício). MAIA_MODELO_CLIENTE troca
    // 08/11 (T11): modelo misto (misto.ts): decisão de venda ou passagem pro dono é refeita no modelo forte. MAIA_MODELO_MISTO=0 desliga
    { tipo: 'cliente', negocio_id: neg.id, conversa_id: cv.id }, !!gatilho)

  // 06/11: no teste, depois de usar as ferramentas a IA às vezes escreveu um RELATÓRIO ("Pronto, respondi a Carla e deixei na etapa...")
  // em vez da mensagem pro cliente. Isso nunca sai: só vale o que vem entre <msg>, e relatório é barrado.
  // Se não vier mensagem boa, pede de novo uma vez (sem ferramentas); se ainda falhar, não manda nada e chama a equipe.
  const boas = (t: string) => [...t.matchAll(/<msg>([\s\S]*?)<\/msg>/g)].map(x => x[1].trim()).filter(m => m && !RELATORIO.test(m))
  let partes = boas(r.texto)
  if (!partes.length) {
    const r2 = await comFerramentas(regras(neg), `CONVERSA:\n${hist}\n\nTua resposta anterior não foi uma mensagem pro cliente. Ela vai DIRETO pro WhatsApp do cliente: escreve só o que tu dirias pra ele, em 1 ou 2 mensagens, cada uma entre <msg> e </msg>. Não conta o que tu fez nem fala do sistema.`, [], 1,
      { modelo: modeloIA, uso: { tipo: 'cliente', negocio_id: neg.id, conversa_id: cv.id } })
    partes = boas(r2.texto)
  }
  // 08/11 (teste completo): confere o tom do negócio antes de mandar (fora do tom: reescreve; quase nunca acontece aqui)
  let enviadas = await Promise.all(partes.slice(0, 2).map(m => noTomDoNegocio(neg, m, { negocio_id: neg.id, conversa_id: cv.id })))
  // 08/11 (regra fixa da casa, conferência depois da resposta): perguntou o preço e a frase com o R$ veio antes do valor?
  // Reescreve mudando só a ordem (preco.ts). O preço nunca some nem vai pra outra mensagem
  let reordenou = false
  if (precoAgora && !gatilho && !ctx.humano) {
    const v = await valorAntesDoPreco(jeitoAtendimento(neg), enviadas, { modelos: [...new Set([modeloBarato(), modeloForte()])], uso: { tipo: 'cliente', negocio_id: neg.id, conversa_id: cv.id, fase: 'preco' } })
    enviadas = v.msgs; reordenou = v.reescreveu
  }
  // 08/11 (reteste, #17): na passagem pro dono, nada de pedir detalhes ao cliente (quem responde agora é a pessoa)
  if (enviadas.length && (ctx.humano || gatilho || respostaPassou(enviadas.join(' '), r.usadas.some(u => u.nome === 'perguntar_ao_dono' && u.saida?.ok)))) {
    enviadas = enviadas.map(semPedirDetalhes).filter(Boolean)
    if (!enviadas.length) enviadas = [`Passei a ${tomDoNegocio(neg).pessoa === 'tu' ? 'tua' : 'sua'} conversa pra uma pessoa da equipe, que responde aqui mesmo.`]
  }
  if (!enviadas.length) {
    await avisaEquipe('Maia sem resposta pro cliente', `A IA não conseguiu escrever uma mensagem pro cliente ${lead.nome || cv.telefone} no ${neg.nome}. Ninguém respondeu ainda: olha a conversa no painel.`, neg.id, true)
    return { mensagens: [], ferramentas: r.usadas.map(u => u.nome), etapa: lead?.etapa, sem_resposta: true }
  }
  // 08/11 (T12): a resposta da IA já trouxe um aviso de privacidade: o do sistema não vai junto (seria repetido)
  if (aviso && respostaJaAvisa(enviadas.join(' '))) aviso = null
  // 08/11 (T12; Guto: ligado por padrão, desliga com MAIA_VOZ_RESPOSTA=0): o cliente mandou áudio → a resposta vai em áudio
  // (voz.ts). Cliente que escreveu recebe texto. O texto fica salvo na conversa ("(áudio) ..."). A ElevenLabs falhou ou a Meta
  // recusou o áudio: vai em texto. Link não dá pra falar: vai junto, por escrito, depois do áudio
  const caminhoAudio = vozLigada() && novas.some(x => x.tipo === 'audio') ? await audioDaResposta(neg, cv, enviadas.join(' ')).catch(() => null) : null
  const envioAudio = caminhoAudio ? await mandaAudioCliente(cv, caminhoAudio, enviadas.join(' ')).catch((e: any) => ({ ok: false, erro: String(e?.message || e) })) : null
  if (envioAudio?.ok) {
    const links = enviadas.join(' ').match(/https?:\/\/\S+/g)
    if (links) await mandaTexto(cv, [...new Set(links)].join('\n'))
  } else for (const t of enviadas) await mandaTexto(cv, t)
  const usadas = r.usadas.map(u => u.nome)
  // 08/11 (teste completo, #14): o cliente pediu gente (ou reclamou, ou pediu devolução) ou a resposta disse que passou pra uma
  // pessoa, e a IA não chamou a ferramenta: o SISTEMA passa. Se a resposta não falou da passagem, vai uma frase curta dizendo
  const perguntouIA = r.usadas.some(u => u.nome === 'perguntar_ao_dono' && u.saida?.ok)
  const disse = respostaPassou(enviadas.join(' '), perguntouIA)
  let passouExtra: string | null = null
  if (!ctx.humano && (gatilho || disse)) {
    await passaConversa(neg, cv, lead, ctx, gatilho ? `${gatilho}: "${textoCliente.slice(0, 160)}"` : `eu disse ao cliente que ia passar pra uma pessoa ("${enviadas.join(' ').slice(0, 120)}")`, 'sistema')
    usadas.push('passar_para_o_dono (sistema)')
    if (!disse) { passouExtra = `Passei a ${tomDoNegocio(neg).pessoa === 'tu' ? 'tua' : 'sua'} conversa pra uma pessoa da equipe, que responde aqui mesmo.`; await mandaTexto(cv, passouExtra) }
  }
  // 08/11 (reteste r3, #20): o cliente pediu "amanhã"/"hoje" num dia em que o negócio NÃO abre e a resposta não disse isso
  // (numa rodada a IA respondeu "vou confirmar se a gente abre"): o sistema avisa com o calendário certo
  let diaExtra: string | null = null
  if (!ctx.humano) {
    const dd = diasDoNegocio(neg), pede = semAc(textoCliente)
    const alvo = /\bamanha\b/.test(pede) && dd.amanha.abre === false ? { d: dd.amanha, quando: 'amanhã' } : /\bhoje\b/.test(pede) && dd.hoje.abre === false ? { d: dd.hoje, quando: 'hoje' } : null
    if (alvo && !/\bnao (abr|funcion|atend|trabalh|vamos estar|estamos|estaremos|da pra|consigo|conseguimos)|fechad/.test(semAc(enviadas.join(' ')))) {
      diaExtra = `Só um aviso: ${alvo.quando} (${alvo.d.semana}, ${alvo.d.data}) a gente não abre.${dd.proximo ? ` O próximo dia é ${dd.proximo.semana}, ${dd.proximo.data}.` : ''}`
      await mandaTexto(cv, diaExtra)
    }
  }
  let sistemaPerguntou = false
  // 07/11 (piloto): rede de segurança: prometeu confirmar e não perguntou pro dono? O sistema pergunta (o cliente não fica esperando à toa)
  if (!ctx.humano && !ctx.comprovante && !perguntouIA && !usadas.includes('passar_para_o_dono') && (prometeuConfirmar(enviadas.join(' ')) || naoSabe(enviadas.join(' '))) && !foraDoAssunto(textoCliente) && !foraDoAssunto(enviadas.join(' '))) {
    const pergunta = novas.map(x => x.texto).join(' / ').slice(0, 300)
    if (pergunta) { const p = await ferrs.find(f => f.name === 'perguntar_ao_dono')!.roda({ pergunta }).catch(() => null); if (p?.ok) { sistemaPerguntou = true; usadas.push('perguntar_ao_dono (sistema)') } }
  }
  // 08/11: perguntou pro dono e a resposta não deu o horário? O cliente nunca fica sem prazo: vai uma frase curta com ele
  let prazoExtra: string | null = null
  // 08/11 (teste completo, #12): só quando a pergunta foi MESMO pro dono (pergunta recusada pela ferramenta não promete retorno)
  if ((perguntouIA || sistemaPerguntou) && !/até[^.?!]{0,25}\s(as|às) \d{1,2}h/i.test(enviadas.join(' '))) {
    // quem só disse "não tenho essa informação" ganha a frase inteira (vai confirmar + prazo)
    prazoExtra = sistemaPerguntou && !prometeuConfirmar(enviadas.join(' ')) ? `Vou confirmar isso aqui e te dou o retorno ${prazoResposta(neg).texto}.` : `Te dou o retorno ${prazoResposta(neg).texto}.`
    await mandaTexto(cv, prazoExtra)
  }
  if (aviso) await mandaTexto(cv, aviso)
  // a bola ficou com o cliente: se ele sumir, a retomada já está marcada
  lead = await db.um('leads', { id: lead.id })
  const firme = recusaFirme(textoCliente)
  if (!ctx.humano && lead && ['novo', 'conversando', 'interessado', 'proposta'].includes(lead.etapa) && firme && !r.usadas.some(u => u.nome === 'venda_perdida')) {
    lead = await perdeu(lead, firme, 'maia'); usadas.push('venda_perdida (sistema)')
  } else if (!ctx.humano && lead && ['novo', 'conversando', 'interessado'].includes(lead.etapa) && querComprar(textoCliente, neg) && !r.usadas.some(u => ['venda_fechada', 'venda_perdida'].includes(u.nome) || (u.nome === 'mudar_etapa' && u.entrada?.etapa === 'proposta'))) {
    lead = await mudaEtapa(lead, 'proposta', 'maia', { resumo: textoCliente.slice(0, 160) }); usadas.push('mudar_etapa proposta (sistema)')
  }
  if (!ctx.humano && lead && !['ganho', 'perdido'].includes(lead.etapa) && !lead.proximo_followup_em) await agendaFollowup(lead)
  await db.atualiza('conversas', { id: cv.id }, { ia_respostas: (cv.ia_respostas || 0) + 1, nao_lidas: 0 })
  return { mensagens: [...enviadas, ...(passouExtra ? [passouExtra] : []), ...(diaExtra ? [diaExtra] : []), ...(prazoExtra ? [prazoExtra] : []), ...(aviso ? [aviso] : [])], ferramentas: usadas, etapa: lead?.etapa, aviso_privacidade: !!aviso, humano: ctx.humano, modelo: modeloIA, refez, audio: envioAudio?.ok ? caminhoAudio : null, reordenou_preco: reordenou }
}

// a retomada de quem parou de responder: escrita pela IA, curta, sem pressão. Sem canal do negócio, vira lembrete pro dono.
export async function textoRetomada(neg: any, lead: any, numero: number) {
  const cv = await db.um('conversas', { negocio_id: neg.id, canal: 'cliente', telefone: lead.telefone || '' })
  const msgs = cv ? (await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })).filter(m => m.texto).slice(-12) : []
  const { emJson } = await import('./ia')
  const r = await emJson<{ texto: string }>(`${jeitoAtendimento(neg)}\nTu és a assistente virtual do ${neg.nome}. Escreve UMA mensagem curta de retomada pra um cliente que parou de responder. Sem pressão, útil, com uma pergunta fácil de responder. Retomada número ${numero} de 3 (a 3ª é a despedida: deixa a porta aberta).`,
    `${diasDoNegocio(neg).texto}\nCliente: ${lead.nome || ''} · interesse: ${lead.produto || lead.resumo || '?'} · etapa: ${lead.etapa}\nO que o negócio oferece: ${JSON.stringify(neg.contexto || {})}\nÚltimas mensagens: ${msgs.map(m => m.texto).join(' | ').slice(0, 1500)}\nDevolve {"texto":"..."}`)
  return noTomDoNegocio(neg, r.texto, { negocio_id: neg.id, conversa_id: cv?.id || null })
}
