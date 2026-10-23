import { supabase } from '@/lib/supabase'

// Mensagens de uma conversa SEM baixar de novo a mídia que já está na tela.
// ⚠️ Áudio e imagem ficam gravados dentro da própria mensagem (`midia_url` em base64, 200–570 KB cada).
// As conversas abertas recarregam a cada 5 s, e com `select('*')` cada recarga baixava todos os
// áudios de novo: foi o que mais pesou no banco em 23/10/2026. Aqui lê tudo menos a mídia e só busca
// `midia_url` das mensagens que ainda não têm a mídia em `anteriores` (a lista que já está na tela).
// Devolve null se a leitura falhar, pra tela manter o que já mostrava em vez de esvaziar.
const SEM_MIDIA = 'id,conversa_id,zapi_id,direcao,tipo,texto,midia_mime,status,enviado_por,criado_em,canal,org_id'

export async function lerMensagens(conversaIds: string[], anteriores: any[]): Promise<any[] | null> {
  if (!conversaIds.length) return []
  const { data, error } = await supabase.from('wa_mensagens')
    .select(SEM_MIDIA).in('conversa_id', conversaIds).order('criado_em', { ascending: true })
  if (error || !data) return null

  const ids = new Set(data.map((m: any) => m.id))
  const midia = new Map<string, string>(anteriores.filter(m => m.midia_url && ids.has(m.id)).map(m => [m.id, m.midia_url]))
  let q: any = supabase.from('wa_mensagens').select('id,midia_url').in('conversa_id', conversaIds).not('midia_url', 'is', null)
  if (midia.size) q = q.not('id', 'in', `(${[...midia.keys()].join(',')})`)
  const { data: novas } = await q
  for (const m of novas || []) midia.set(m.id, m.midia_url)

  return data.map((m: any) => ({ ...m, midia_url: midia.get(m.id) ?? null }))
}
