import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { supabaseDoUsuario } from '@/lib/supabase-user'

// QUEM EU VEJO — a regra da hierarquia, num lugar só.
//
// Vejo o que é de X quando: X sou eu, X responde a mim (direta ou indiretamente), ou sou dono
// (admin), que enxerga a casa inteira. Item sem responsável é do grupo e todos veem — isso fica
// com quem chama, porque cada tela decide o que "sem responsável" significa pra ela.
//
// POR QUE ARQUIVO PRÓPRIO: a mesma regra vale na agenda geral e na agenda de entregas. Escrita
// duas vezes, uma hora as duas divergem — e privacidade que vale numa tela e não na outra é
// contornável pela outra.
//
// Devolve null quando não há sessão válida. Quem chama tem que tratar isso como "não responde":
// uma agenda que devolve dados pra quem não se identificou é um vazamento.

export type QuemEuVejo = {
  eu: { id: string; nome: string; papel: string; setor: string; org_id: string }
  souDono: boolean
  abaixo: Set<string>
  visiveis: Set<string>
  pessoas: { id: string; nome: string; papel: string; setor: string; ativo: boolean }[]
}

// Com vários chefes por pessoa isto é um grafo, não uma árvore: `vistos` impede que um caminho
// que se reencontra (dois gerentes, mesmo dono) seja percorrido de novo — e segura ciclo, que é
// cadastro errado, mas acontece.
function descendentes(de: string, vinculos: { usuario_id: string; gestor_id: string }[]) {
  const abaixoDe = new Map<string, string[]>()
  for (const v of vinculos) {
    const lista = abaixoDe.get(v.gestor_id) || []
    lista.push(v.usuario_id)
    abaixoDe.set(v.gestor_id, lista)
  }
  const vistos = new Set<string>()
  const fila = [de]
  while (fila.length) {
    const atual = fila.shift()!
    for (const filho of abaixoDe.get(atual) || []) {
      if (vistos.has(filho) || filho === de) continue
      vistos.add(filho)
      fila.push(filho)
    }
  }
  return vistos
}

// Só "tem alguém da casa logado?". Para rota que não filtra por hierarquia mas não pode responder
// pra quem não se identificou. Sem isto, um pedido sem token cai em `orgDaRequest`, que devolve a
// empresa padrão — e a rota entrega (ou grava) como se fosse gente de dentro.
export async function temSessao(authorization: string | null): Promise<boolean> {
  return !!(await meuPerfil(authorization))
}

// Só "quem sou eu" — o perfil de quem pediu, sem carregar a hierarquia. Para o que é pessoal (o
// balão da agenda, por exemplo), onde a pergunta é "o que é meu", e não "o que eu enxergo".
export async function meuPerfil(authorization: string | null): Promise<{ id: string; org_id: string } | null> {
  if (!authorization) return null
  const { data: u } = await supabaseDoUsuario(authorization).auth.getUser().catch(() => ({ data: { user: null } as any }))
  const uid = u?.user?.id
  if (!uid) return null
  const { data } = await sb.from('usuarios_perfil').select('id,org_id').or(`auth_id.eq.${uid},id.eq.${uid}`).limit(1).maybeSingle()
  return data || null
}

export async function quemEuVejo(authorization: string | null, org: string): Promise<QuemEuVejo | null> {
  const { data: u } = await supabaseDoUsuario(authorization).auth.getUser().catch(() => ({ data: { user: null } as any }))
  const uid = u?.user?.id
  if (!uid) return null

  // Por `auth_id` OU por `id`: nos perfis antigos o id do perfil É o id do login, e nem todos
  // tiveram o auth_id preenchido. Procurar só por um dos dois deixaria gente de fora calada.
  const { data: eu } = await sb.from('usuarios_perfil')
    .select('id,nome,papel,setor,org_id').or(`auth_id.eq.${uid},id.eq.${uid}`).limit(1).maybeSingle()
  if (!eu) return null

  const [{ data: pessoas }, { data: vinculos }] = await Promise.all([
    sb.from('usuarios_perfil').select('id,nome,papel,setor,ativo').eq('org_id', org).order('nome'),
    sb.from('usuarios_gestores').select('usuario_id,gestor_id').eq('org_id', org),
  ])

  const abaixo = descendentes(eu.id, vinculos || [])
  const souDono = eu.papel === 'admin'
  const visiveis = new Set<string>([eu.id, ...abaixo])
  if (souDono) for (const p of pessoas || []) visiveis.add(p.id)

  return { eu, souDono, abaixo, visiveis, pessoas: pessoas || [] }
}
