// Matt (Press Kit Studios / The DJ Office): aviso de VENDA NOVA no WhatsApp do Guto (26/11).
// Roda junto com o vigia do Recado (pg_cron a cada 10 min), então avisa mesmo com o PC desligado.
// Lê o painel do Matt pela office-api com a chave de VISITANTE (só leitura) e compara a semana atual com a última leitura.
// A chave de visitante e o último estado moram em recado_suporte_estado (chaves matt:office_key e matt:ultimo).
// Envio: número oficial da escola; texto livre com a janela de 24 h aberta, senão o modelo cnd_aviso_recado.
const API = 'https://yvnrgyxwpkriawpzxpal.supabase.co/functions/v1/office-api'
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const H = () => ({ apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json' })

async function le(chave: string): Promise<any> {
  const r = await fetch(`${U()}/rest/v1/recado_suporte_estado?chave=eq.${encodeURIComponent(chave)}&select=valor`, { headers: H() }).catch(() => null)
  const j: any = await r?.json().catch(() => null)
  const v = j?.[0]?.valor
  if (typeof v !== 'string') return v ?? null
  try { return JSON.parse(v) } catch { return v }
}
async function grava(chave: string, valor: any) {
  await fetch(`${U()}/rest/v1/recado_suporte_estado`, { method: 'POST', headers: { ...H(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ chave, valor: JSON.stringify(valor), atualizado_em: new Date().toISOString() }) }).catch(() => null)
}

async function avisaGuto(titulo: string, texto: string) {
  const quem = process.env.RECADO_AVISO_WHATS_EMAIL || process.env.RECADO_AVISO_EMAIL
  if (!quem) return { ok: false, error: 'sem e-mail do Guto' }
  const { supabaseAdmin: sb } = await import('@/lib/supabase-admin'), { enviarAoTime } = await import('@/lib/assistente')
  const { data } = await sb.from('usuarios_perfil').select('id, org_id, nome, apelido, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia').eq('email', quem).not('whatsapp', 'is', null).limit(1)
  const u: any = data?.[0]; if (!u) return { ok: false, error: 'Guto sem WhatsApp no perfil' }
  const limpo = (s: string) => s.replace(/[\n\r]+/g, ' · ').replace(/\s{2,}/g, ' ').trim().slice(0, 900)
  return enviarAoTime(u, `*${titulo}*\n${texto}`, { nome: 'cnd_aviso_recado', params: [limpo(titulo.replace(/[^\p{L}\p{N} !,.]/gu, '').trim()), limpo(texto)] })
}

export async function vigiaMatt() {
  const chave = process.env.MATT_OFFICE_KEY || await le('matt:office_key')
  if (!chave) return { ok: false, motivo: 'sem chave do painel' }
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-office-key': String(chave) }, body: JSON.stringify({ action: 'dash' }), signal: AbortSignal.timeout(15000) }).catch(() => null)
  const d: any = await r?.json().catch(() => null)
  const w = Array.isArray(d?.weeks) ? d.weeks[d.weeks.length - 1] : null
  if (!w) return { ok: false, motivo: 'painel sem semana' }
  const atual = { w: w.w, vendas: +w.sales || 0, pagas: +w.paid_sales || 0, em: new Date().toISOString() }
  const antes = await le('matt:ultimo')
  await grava('matt:ultimo', atual)
  if (!antes || typeof antes !== 'object') return { ok: true, primeira: true }
  const base = antes.w === atual.w ? antes : { vendas: 0, pagas: 0 }   // virou a semana: conta do zero
  const novas = atual.vendas - (+base.vendas || 0)
  if (novas <= 0) return { ok: true, novas: 0 }
  const pagasNovas = Math.max(0, atual.pagas - (+base.pagas || 0)), testes = Math.max(0, novas - pagasNovas)
  const titulo = novas === 1 ? 'Venda nova do Matt' : `${novas} vendas novas do Matt`
  const partes = [pagasNovas ? `${pagasNovas} paga${pagasNovas > 1 ? 's' : ''}` : '', testes ? `${testes} teste${testes > 1 ? 's' : ''} grátis` : ''].filter(Boolean).join(' e ')
  const texto = `${partes || novas + ' nova'}. Na semana: ${atual.vendas} venda${atual.vendas === 1 ? '' : 's'} (${atual.pagas} paga${atual.pagas === 1 ? '' : 's'}).`
  const env = await avisaGuto(titulo, texto).catch((e: any) => ({ ok: false, error: String(e?.message || e) }))
  return { ok: true, novas, envio: env }
}
