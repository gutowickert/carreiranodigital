// Maia: "o que falta pra ligar" (13/11). A lista de conferência de cada negócio antes de ativar (campanha no ar e a Maia
// atendendo os clientes). Cada item: verde (ok) ou pendente, com o que fazer e quem faz. Item "obrigatorio" trava o "pronto
// pra ligar"; os outros são recomendação. Só LÊ: não liga nada, não manda nada, não mexe no banco.
// O cadastro da implantação (skill implantacao-maia → importar.mjs) grava a ficha, o funil e os limites em negocios.contexto e
// as contas em negocios.meta. O número dos anúncios conferido fica em meta.whatsapp_conferido (ação conferir_whatsapp do painel).
import { maiaDb as db } from './db'
import { vazio, funilDo, limitesDoCadastro } from './cadastro'
import { tetoVerba } from './limites'
import { waDoNegocio } from './wa-negocio'
import { nomeDoModelo } from './modelos'

export type Item = { chave: string; grupo: string; titulo: string; ok: boolean; obrigatorio: boolean; detalhe: string; quem: 'equipe' | 'dono' | 'Guto' }
const dig = (s: any) => String(s || '').replace(/\D/g, '')

// os campos da ficha que a Maia precisa pra atender e anunciar (os mesmos obrigatórios do importar.mjs)
const FICHA: [string, string][] = [
  ['produto', 'o que vende'], ['preco', 'preços'], ['mais_vendido', 'mais vendido'], ['publico', 'público'],
  ['pagamento', 'formas de pagamento'], ['horario', 'horário'], ['prazo', 'prazo/antecedência'],
]

// o número que vai no botão do anúncio (o mesmo que meta.ts usa)
export const numeroDosAnuncios = (neg: any) => dig(neg?.meta?.wa?.numero || neg?.contexto?.whatsapp)
export const whatsConferido = (neg: any) => {
  const c = neg?.meta?.whatsapp_conferido
  const n = numeroDosAnuncios(neg)
  // conferido vale pro número que estava lá na hora (trocou o número: confere de novo)
  return !!c && !!n && (!c.numero || dig(c.numero).slice(-8) === n.slice(-8))
}

export function itensParaLigar(neg: any, d: { pecas?: any[]; modelos?: Record<string, string> | null; donoFalou?: boolean } = {}): Item[] {
  const c = neg?.contexto || {}, m = neg?.meta || {}
  const it: Item[] = []
  const add = (x: Omit<Item, 'obrigatorio'> & { obrigatorio?: boolean }) => it.push({ obrigatorio: true, ...x })

  // 1) o cadastro
  const basicos = [['nicho', neg?.nicho], ['cidade', neg?.cidade], ['nome do dono', neg?.dono_nome]].filter(([, v]) => vazio(v)).map(([k]) => k)
  add({ chave: 'negocio', grupo: 'Cadastro', titulo: 'Dados do negócio (nicho, cidade, dono)', ok: !basicos.length, detalhe: basicos.length ? 'falta: ' + basicos.join(', ') : 'completo', quem: 'equipe' })
  const ficha = FICHA.filter(([k]) => vazio(c[k])).map(([, r]) => r)
  add({ chave: 'ficha', grupo: 'Cadastro', titulo: 'Ficha do que ela vende (produto, preço, pagamento, horário…)', ok: !ficha.length, detalhe: ficha.length ? 'falta: ' + ficha.join(', ') : 'completa', quem: 'equipe' })
  const f = funilDo(neg)
  add({ chave: 'funil', grupo: 'Cadastro', titulo: 'Funil: o "sim" do negócio e o próximo passo de cada etapa', ok: !!f.sim && f.etapas.length >= 2 && f.etapas.every(e => e.proximo_passo),
    detalhe: !f.sim ? 'falta o "sim" (o que conta como venda)' : f.etapas.length < 2 ? 'falta o caminho (pelo menos 2 etapas)' : f.etapas.some(e => !e.proximo_passo) ? 'tem etapa sem próximo passo' : `${f.etapas.length} etapas; sim: ${f.sim}`, quem: 'equipe' })
  const l = limitesDoCadastro(neg)
  const semLim = [['desconto máximo', l.desconto_maximo], ['o que nunca prometer', l.nunca_prometer], ['quando passar pro dono', l.passar_pro_dono]].filter(([, v]) => !v).map(([k]) => k)
  add({ chave: 'limites', grupo: 'Cadastro', titulo: 'Limites: desconto, o que nunca prometer, quando passar pro dono', ok: !semLim.length, detalhe: semLim.length ? 'falta: ' + semLim.join(', ') : 'combinados', quem: 'equipe' })
  const tom = m.atendimento?.tom
  add({ chave: 'tom', grupo: 'Cadastro', titulo: 'Jeito de falar com os clientes (tu ou você)', ok: !!tom?.pessoa, detalhe: tom?.pessoa ? `"${tom.pessoa === 'tu' ? 'tu' : 'você'}"${tom.gaucho ? ', gaúcho' : ''}, ${tom.estilo || 'leve'}` : 'sem escolha ainda (a Maia usaria "você", o padrão)', quem: 'equipe', obrigatorio: false })
  const pq = Array.isArray(c.perguntas) ? c.perguntas.length : 0
  add({ chave: 'perguntas', grupo: 'Cadastro', titulo: 'Perguntas frequentes com a resposta do dono', ok: pq > 0, detalhe: pq ? `${pq} pergunta(s)` : 'nenhuma ainda', quem: 'equipe', obrigatorio: false })

  // 2) as contas da Meta
  const conta = String(m.ad_account_id || '').trim(), pag = String(m.page_id || '').trim(), ig = String(m.ig_id || '').trim()
  add({ chave: 'conta_anuncio', grupo: 'Contas da Meta', titulo: 'Conta de anúncio', ok: /^(act_)?\d{5,}$/.test(conta), detalhe: conta ? (/^(act_)?\d{5,}$/.test(conta) ? conta : `"${conta}" não parece um ID de conta (act_ + números)`) : 'falta o ID', quem: 'equipe' })
  add({ chave: 'pagina', grupo: 'Contas da Meta', titulo: 'Página do Facebook', ok: /^\d{5,}$/.test(pag), detalhe: pag ? (/^\d{5,}$/.test(pag) ? pag : `"${pag}" não parece um ID de página`) : 'falta o ID', quem: 'equipe' })
  add({ chave: 'instagram', grupo: 'Contas da Meta', titulo: 'Instagram do negócio', ok: /^\d{5,}$/.test(ig), detalhe: ig ? (/^\d{5,}$/.test(ig) ? ig : `"${ig}" não parece um ID do Instagram`) : 'falta o ID', quem: 'equipe' })

  // 3) o WhatsApp
  const num = numeroDosAnuncios(neg)
  add({ chave: 'whats_anuncio', grupo: 'WhatsApp', titulo: 'Número do WhatsApp dos anúncios conferido no botão de um anúncio', ok: whatsConferido(neg),
    detalhe: !num ? 'falta o número (preenche e confere no painel)' : whatsConferido(neg) ? `+${num}, conferido${m.whatsapp_conferido?.em ? ' em ' + String(m.whatsapp_conferido.em).slice(0, 10) : ''}` : `+${num}: falta conferir (o botão de um anúncio de teste abre esse número?)`, quem: 'equipe' })
  add({ chave: 'whats_conectado', grupo: 'WhatsApp', titulo: 'WhatsApp do negócio conectado na Maia (o dono entra com o Facebook)', ok: !!waDoNegocio(neg), detalhe: waDoNegocio(neg) ? (m.wa?.inscrito === false ? 'conectado, mas o webhook não está inscrito' : 'conectado') : 'gera o link "conectar" no painel e manda pro dono', quem: 'dono' })
  const ms = d.modelos || null
  const precisa = [nomeDoModelo(neg, 'maia_retomada'), nomeDoModelo(neg, 'maia_resposta')]
  const aprov = ms ? precisa.filter(x => ms[x] === 'APPROVED') : []
  add({ chave: 'modelos', grupo: 'WhatsApp', titulo: 'Modelos de mensagem do negócio aprovados (retomada e resposta depois de 24 h)', ok: aprov.length === precisa.length,
    detalhe: !ms ? 'ainda sem status (pede no painel depois de conectar)' : `${aprov.length} de ${precisa.length} aprovados (${precisa.map(x => `${x}: ${ms[x] || 'não pedido'}`).join(', ')})`, quem: 'equipe', obrigatorio: false })

  // 4) o dono
  const dw = dig(neg?.dono_whatsapp)
  add({ chave: 'dono_whats', grupo: 'Dono', titulo: 'WhatsApp do dono (pra falar com a Maia)', ok: /^55\d{10,11}$/.test(dw) && !dw.startsWith('55000'), detalhe: !dw ? 'falta' : dw.startsWith('55000') ? 'é um número de teste (55000…)' : /^55\d{10,11}$/.test(dw) ? '+' + dw : `"${dw}" não parece celular com DDD (55 + DDD + número)`, quem: 'equipe' })
  add({ chave: 'dono_falou', grupo: 'Dono', titulo: 'O dono já mandou mensagem pro número da Maia (abre a conversa)', ok: !!d.donoFalou, detalhe: d.donoFalou ? 'já falou' : 'pede pro dono mandar um "oi" pra Maia', quem: 'dono', obrigatorio: false })

  // 5) os anúncios e a verba
  const aprovadas = (d.pecas || []).filter(p => ['anuncio_imagem', 'anuncio_video'].includes(p.tipo) && ['aprovada', 'no_ar'].includes(p.status)).length
  add({ chave: 'pecas', grupo: 'Anúncios', titulo: 'Pelo menos 3 anúncios aprovados pelo dono', ok: aprovadas >= 3, detalhe: `${aprovadas} aprovado(s)${aprovadas < 3 ? `: falta(m) ${3 - aprovadas}` : ''}`, quem: 'dono' })
  const verba = Number(neg?.verba_dia), teto = tetoVerba(neg)
  add({ chave: 'verba', grupo: 'Anúncios', titulo: `Verba por dia definida e dentro do teto (R$ ${teto})`, ok: verba > 0 && verba <= teto, detalhe: !(verba > 0) ? 'falta a verba por dia' : verba > teto ? `R$ ${verba}/dia passa do teto de R$ ${teto} (subir o teto é com o Guto)` : `R$ ${verba}/dia`, quem: verba > teto ? 'Guto' : 'equipe' })

  // 6) a chave geral (vale pra todos os negócios)
  add({ chave: 'chave_geral', grupo: 'Sistema', titulo: 'Chave geral do atendimento ligada na Vercel (MAIA_CLIENTES_LIGADO=1)', ok: process.env.MAIA_CLIENTES_LIGADO === '1', detalhe: process.env.MAIA_CLIENTES_LIGADO === '1' ? 'ligada' : 'desligada: nenhum negócio atende clientes de verdade', quem: 'Guto', obrigatorio: false })
  return it
}

export function resumoParaLigar(itens: Item[]) {
  const faltam = itens.filter(i => i.obrigatorio && !i.ok)
  const recomendados = itens.filter(i => !i.obrigatorio && !i.ok)
  return { pronto: !faltam.length, faltam: faltam.length, recomendados: recomendados.length,
    texto: !faltam.length ? (recomendados.length ? `pronto pra ligar (${recomendados.length} recomendação pendente)` : 'pronto pra ligar') : `faltam ${faltam.length}` }
}

// lê o que precisa do banco e monta a lista de um negócio
export async function faltaLigar(neg: any, pre: { pecas?: any[] } = {}) {
  const pecas = pre.pecas ? pre.pecas.filter(p => p.negocio_id === neg.id) : await db.lista('pecas', { negocio_id: neg.id })
  const ult = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'modelos_status' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
  const cv = neg.dono_whatsapp ? await db.um('conversas', { negocio_id: neg.id, canal: 'dono' }) : null
  const donoFalou = cv ? !!(await db.um('msgs', { conversa_id: cv.id, autor: 'dono' })) : false
  const itens = itensParaLigar(neg, { pecas, modelos: ult?.detalhe || null, donoFalou })
  const ligar_ate = neg?.contexto?.implantacao?.ligar_ate || null
  return { negocio_id: neg.id, nome: neg.nome, status: neg.status, ligar_ate, ...resumoParaLigar(itens), itens,
    whatsapp: { numero: numeroDosAnuncios(neg) || null, conferido: whatsConferido(neg), do_whats_conectado: !!neg?.meta?.wa?.numero } }
}
