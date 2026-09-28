// A CAMPAINHA DO WHATSAPP (28/09/2026): quando chega mensagem, o servidor avisa na hora as abas
// abertas do sistema, em vez de cada aba perguntar de 12 em 12 segundos. O aviso não carrega nada —
// só "chegou algo"; quem ouve confere o número de não lidas pelo caminho de sempre (com a sessão
// de quem está logado). Canal de broadcast do Supabase Realtime, sem tabela nem publicação.
//
// Quem ouve: components/Layout.tsx (o badge do WhatsApp no menu). Se a campainha falhar, o menu
// continua perguntando sozinho — nunca fica pior que antes.
export const CANAL_CAMPAINHA = 'wa-inbox'

export async function tocarCampainha() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: CANAL_CAMPAINHA, event: 'nova', payload: {} }] }),
    })
  } catch { /* melhor esforço: o menu tem a própria rede de segurança */ }
}
