// Qual MOTOR DE CADÊNCIA rege cada turma.
//
// `turmas.motor_cadencia`:
//   'turma'  (padrão) → cadência dos cursos: fluxo D1–D13, nutrição, reposição,
//                       urgência de lote, roteador de turma, e atendimento por IA.
//   'nenhum'          → FORA de toda automação de cadência E do atendimento por IA.
//                       O time atende na mão. É o caso do Deu Venda (implantação
//                       1 a 1, oferta contínua, cadência própria — ver docs).
//
// Futuro: 'individual' = motor próprio do Deu Venda, quando existir. Enquanto
// não existe, qualquer valor != 'turma' já sai de tudo — é o comportamento seguro.
//
// Por que existe: o motor seleciona leads por ETAPA na org inteira, não por turma.
// Sem esta trava, um lead do Deu Venda entra na cadência dos cursos no 1º cron e
// recebe mensagem de turma/lote que não tem nada a ver com o que ele comprou.

export type ForaDoMotor = { ids: Set<string>; codigos: Set<string> }

export async function turmasForaDoMotor(sb: any, org: string): Promise<ForaDoMotor> {
  const ids = new Set<string>()
  const codigos = new Set<string>()
  try {
    const { data } = await sb.from('turmas').select('id, codigo').eq('org_id', org).neq('motor_cadencia', 'turma')
    for (const t of data || []) {
      if (t?.id) ids.add(String(t.id))
      if (t?.codigo) codigos.add(String(t.codigo).toLowerCase())
    }
  } catch { /* na dúvida não trava nada — mantém o comportamento atual */ }
  return { ids, codigos }
}

// Lead pertence a uma turma fora do motor de turma?
export function leadForaDoMotor(lead: any, fora: ForaDoMotor): boolean {
  if (!fora || (!fora.ids.size && !fora.codigos.size)) return false
  if (lead?.turma_id && fora.ids.has(String(lead.turma_id))) return true
  if (lead?.codigo_turma && fora.codigos.has(String(lead.codigo_turma).toLowerCase())) return true
  return false
}
