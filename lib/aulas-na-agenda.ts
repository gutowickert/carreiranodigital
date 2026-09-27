import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// AS AULAS NA AGENDA DE QUEM VAI DAR — sozinhas, sem ninguém cadastrar.
//
// Decisão do Nando (27/09/2026): o Mateus faz as aulas de ANL e da Formação que estão rolando, e
// "turma nova tem que entrar sozinha; se ele não der conta, a gente assume". Então toda data de
// aula de turma de ANL ou Formação (confirmada ou em vendas) vira compromisso no nome de quem está
// em `configuracoes` 'agenda.aulas_para' (lista de ids de usuarios_perfil). Turma cancelada tira as
// aulas futuras dela.
//
// ⚠️ ONDE RODA: na abertura da agenda, no máximo a cada 10 minutos por instância. Não há motor
// diário sobrando pra isso, e a agenda é justamente o lugar onde a aula precisa aparecer — se
// ninguém abre a agenda, ninguém precisaria da aula ali ainda.
//
// ⚠️ O COMPROMISSO É IDENTIFICADO PELO TÍTULO + INÍCIO (não há coluna de turma em agenda_eventos):
// "Aula ANL — anlportoalegre102601". Mudou a data de uma aula, a antiga some e a nova entra.

let ultima = 0
const PREFIXO = /^(anl|fc)/i
const tituloDe = (codigo: string) => `${/^anl/i.test(codigo) ? 'Aula ANL' : 'Aula Formação'} — ${codigo}`

export async function sincronizarAulas(org: string, forcar = false) {
  if (!forcar && Date.now() - ultima < 10 * 60_000) return
  ultima = Date.now()
  try {
    const { data: cfg } = await sb.from('configuracoes').select('valor').eq('org_id', org).eq('chave', 'agenda.aulas_para').maybeSingle()
    let pessoas: string[] = []
    try { pessoas = JSON.parse(cfg?.valor || '[]') } catch { }
    if (!pessoas.length) return

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const { data: turmas } = await sb.from('turmas').select('id, codigo, status').eq('org_id', org).in('status', ['confirmada', 'em_vendas', 'cancelada'])
    const ativas = (turmas || []).filter(t => PREFIXO.test(t.codigo || '') && t.status !== 'cancelada')
    const canceladas = new Set((turmas || []).filter(t => PREFIXO.test(t.codigo || '') && t.status === 'cancelada').map(t => tituloDe(t.codigo)))
    const codigo = Object.fromEntries(ativas.map(t => [t.id, t.codigo]))
    const { data: datas } = ativas.length
      ? await sb.from('turma_datas').select('turma_id, data, horario_inicio, horario_fim').in('turma_id', ativas.map(t => t.id)).gte('data', hoje)
      : { data: [] as any[] }

    // o que deveria estar na agenda: título + início
    const devidas = (datas || []).map((d: any) => {
      const hi = String(d.horario_inicio || '19:00').slice(0, 5), hf = String(d.horario_fim || '').slice(0, 5)
      return {
        titulo: tituloDe(codigo[d.turma_id]),
        inicio: new Date(`${d.data}T${hi}:00-03:00`).toISOString(),
        fim: hf ? new Date(`${d.data}T${hf}:00-03:00`).toISOString() : null,
        codigo: codigo[d.turma_id],
      }
    })

    for (const pessoa of pessoas) {
      const { data: tem } = await sb.from('agenda_eventos').select('id, titulo, inicio')
        .eq('org_id', org).eq('usuario_id', pessoa).like('titulo', 'Aula %').gte('inicio', `${hoje}T00:00:00-03:00`)
      const existentes = tem || []
      const chave = (t: string, i: string) => `${t}|${new Date(i).toISOString()}`
      const temChave = new Set(existentes.map(e => chave(e.titulo, e.inicio)))
      const devChave = new Set(devidas.map(d => chave(d.titulo, d.inicio)))

      const novas = devidas.filter(d => !temChave.has(chave(d.titulo, d.inicio))).map(d => ({
        org_id: org, usuario_id: pessoa, titulo: d.titulo, tipo: 'reuniao', inicio: d.inicio, fim: d.fim,
        dia_todo: false, publico: false, concluido: false, descricao: `Tu vai fazer esta aula (turma ${d.codigo}).`,
      }))
      if (novas.length) await sb.from('agenda_eventos').insert(novas)

      // aula que não existe mais (turma cancelada ou data mudou) sai da agenda
      const sobrando = existentes.filter(e => !devChave.has(chave(e.titulo, e.inicio)) && (canceladas.has(e.titulo) || /^Aula (ANL|Formação) — /.test(e.titulo)))
      if (sobrando.length) await sb.from('agenda_eventos').delete().in('id', sobrando.map(e => e.id))
    }
  } catch { /* a agenda abre do mesmo jeito; tenta de novo na próxima */ }
}
