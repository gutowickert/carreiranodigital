// Recado Encantado: aviso no celular do Guto (11/10) quando entra pedido completo e quando a venda confirma.
// Push pelo app ntfy (canal privado em RECADO_NTFY_TOPICO) + e-mail (RECADO_AVISO_EMAIL, pelo Resend). Nunca derruba o pedido.
import { enviaEmail, moldura } from '@/lib/recado/email'
import { recadoConfig as cfg } from '@/lib/recado/config'

const PAINEL = 'https://recadoencantando.com.br/painel'
export const nomeProduto = (personagem: string, pacote: string) => {
  const pac = (cfg.pacotes as any)[personagem]?.[pacote]
  return (personagem === 'noel' ? 'Papai Noel · ' : '') + (pac?.nome || `${personagem}/${pacote}`)
}
export const reais = (v: number) => 'R$ ' + (+v || 0).toFixed(2).replace('.', ',')

export async function avisaDono(titulo: string, texto: string, tags = 'bell') {
  const tarefas: Promise<any>[] = []
  const topico = process.env.RECADO_NTFY_TOPICO
  // formato JSON do ntfy: aceita acento no título (cabeçalho HTTP não aceita)
  if (topico) tarefas.push(fetch('https://ntfy.sh/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: topico, title: titulo, message: texto, tags: tags.split(','), click: PAINEL, priority: tags.includes('moneybag') ? 4 : 3 }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null))
  // WhatsApp pelo número oficial da escola, o mesmo do "bom dia": texto livre se a janela de 24 h está aberta, senão o modelo cnd_aviso_recado
  const quem = process.env.RECADO_AVISO_WHATS_EMAIL || process.env.RECADO_AVISO_EMAIL
  if (quem) tarefas.push((async () => {
    const { supabaseAdmin: sb } = await import('@/lib/supabase-admin'), { enviarAoTime } = await import('@/lib/assistente')
    const { data } = await sb.from('usuarios_perfil').select('id, org_id, nome, apelido, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia').eq('email', quem).not('whatsapp', 'is', null).limit(1)
    const u: any = data?.[0]; if (!u) return null
    const limpo = (s: string) => s.replace(/[\n\r]+/g, ' · ').replace(/\s{2,}/g, ' ').trim().slice(0, 900)
    return enviarAoTime(u, `*${titulo}*\n${texto}\n${PAINEL}`, { nome: 'cnd_aviso_recado', params: [limpo(titulo.replace(/[^\p{L}\p{N} !,.]/gu, '').trim()), limpo(texto)] })
  })().catch(() => null))
  const email = process.env.RECADO_AVISO_EMAIL
  if (email) tarefas.push(enviaEmail(email, titulo, moldura(titulo, texto.replace(/\n/g, '<br>'), 'Abrir o painel', PAINEL, false)).catch(() => null))
  await Promise.all(tarefas)
}
