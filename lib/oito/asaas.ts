// Oito Posts: a assinatura mensal pelo Asaas (a mesma conta do Recado, ASAAS_API_KEY).
// Assinatura com billingType UNDEFINED: o cliente escolhe Pix, boleto ou cartão na fatura; todo mês o Asaas gera a próxima.
// Sem webhook novo: o status é lido da própria assinatura (quando o cliente volta, e a cada 10 min pelo trabalhador).
// No modo local (sem chave), a fatura é simulada: a página de teste tem um botão "simular pagamento".
const A = () => ({ access_token: process.env.ASAAS_API_KEY as string, 'Content-Type': 'application/json', 'User-Agent': 'oito-posts' })
const api = async (caminho: string, opts: any = {}) => {
  const r = await fetch('https://api.asaas.com/v3' + caminho, { ...opts, headers: A(), cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Asaas ' + r.status + ': ' + JSON.stringify(j.errors || j).slice(0, 300))
  return j
}
const PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const maisDias = (n: number) => new Date(Date.now() - 3 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)
const maisUmMes = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() + 1); return x.toISOString().slice(0, 10) }
export const simulado = () => !process.env.ASAAS_API_KEY
// na Vercel nunca simula: sem chave, a assinatura falha (senão daria pra "pagar" de mentira)
export const podeSimular = () => simulado() && !process.env.VERCEL

export async function criaAssinatura(d: { codigo: string; marcaNome: string; nome: string; documento: string; email: string; whatsapp: string; valor: number }) {
  if (simulado()) return { customer: 'sim-' + d.codigo, assinatura: 'sim-' + d.codigo, fatura: null as string | null }
  const fone = d.whatsapp.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  const c = await api('/customers', { method: 'POST', body: JSON.stringify({ name: d.nome, cpfCnpj: d.documento.replace(/\D/g, ''), email: d.email, mobilePhone: fone, externalReference: d.codigo, notificationDisabled: false }) })
  const s = await api('/subscriptions', { method: 'POST', body: JSON.stringify({ customer: c.id, billingType: 'UNDEFINED', value: d.valor, nextDueDate: maisDias(2), cycle: 'MONTHLY', description: `${d.marcaNome} · 8 posts por mês`, externalReference: d.codigo }) })
  const p = await api(`/subscriptions/${s.id}/payments`)
  return { customer: c.id as string, assinatura: s.id as string, fatura: (p.data?.[0]?.invoiceUrl as string) || null }
}

// devolve a situação da assinatura: até quando está paga, a fatura em aberto e se está atrasada
export async function situacao(assinatura: string, pagoAteLocal?: string | null) {
  if (assinatura.startsWith('sim-')) return { pagoAte: pagoAteLocal || null, faturaAberta: null as string | null, atrasada: false, cancelada: false }
  const [s, p] = await Promise.all([api(`/subscriptions/${assinatura}`), api(`/subscriptions/${assinatura}/payments?limit=20`)])
  const pags: any[] = p.data || []
  const pagos = pags.filter(x => PAGO.includes(x.status)).map(x => x.dueDate as string).sort()
  const aberta = pags.filter(x => ['PENDING', 'OVERDUE'].includes(x.status)).sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1))[0]
  return {
    pagoAte: pagos.length ? maisUmMes(pagos[pagos.length - 1]) : null,
    faturaAberta: (aberta?.invoiceUrl as string) || null,
    atrasada: pags.some(x => x.status === 'OVERDUE'),
    cancelada: s.status === 'INACTIVE' || !!s.deleted,
  }
}

// 15/10: a fatura em aberto que já venceu (ou vence hoje) ganha vencimento novo, pra o Pix funcionar de novo
export async function renovaFatura(assinatura: string) {
  if (assinatura.startsWith('sim-')) return null
  const p = await api(`/subscriptions/${assinatura}/payments?limit=20`)
  const aberta = (p.data || []).filter((x: any) => ['PENDING', 'OVERDUE'].includes(x.status)).sort((a: any, b: any) => (a.dueDate > b.dueDate ? 1 : -1))[0]
  if (!aberta) return null
  if (aberta.dueDate <= hoje()) {
    const nova = await api(`/payments/${aberta.id}`, { method: 'POST', body: JSON.stringify({ dueDate: maisDias(2), billingType: aberta.billingType || 'UNDEFINED', value: aberta.value }) })
    return (nova.invoiceUrl as string) || (aberta.invoiceUrl as string)
  }
  return aberta.invoiceUrl as string
}

export async function cancelaAssinatura(assinatura: string) {
  if (assinatura.startsWith('sim-')) return
  await api(`/subscriptions/${assinatura}`, { method: 'DELETE' })
}
export const asaasHoje = hoje
export const asaasMaisUmMes = maisUmMes
