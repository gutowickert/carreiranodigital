// ACOMPANHAMENTO DAS ENTREGAS DE MARKETING (decisão do Nando, 27/09/2026).
//
// Tarefa de marketing de quem NÃO é chefe não fecha quando a pessoa conclui: fica "esperando
// aprovação" até um chefe confirmar. O chefe também pode devolver com um recado. Nasceu pro Mateus,
// vale pra qualquer um que receba tarefa de marketing.
//
// Tudo mora em `tarefas.observacoes` (JSON), sem tabela nova:
//   { passos: [..], minimo?: n,
//     entrega?:   { em, por }            ← concluiu, esperando aprovação
//     aprovacao?: { em, por }            ← um chefe confirmou (aí status = concluida)
//     devolvida?: { em, por, recado } }  ← um chefe devolveu (sai a entrega, volta pra ele)
// O status continua 'pendente' até a aprovação.

// Quem aprova: Nando, Rick e Guto. Um só confirma.
export const CHEFES = [
  'a37df4fd-f6f9-4603-a66a-e7258ad43004', // Nando
  '73c588d5-da34-45f3-921c-e65ff7000684', // Rick
  'f3861b55-9bee-4ffc-ad35-3eebdc1f7cd6', // Guto
]
export const ehChefe = (id: string | null | undefined) => !!id && CHEFES.includes(id)
// Como aparecem na tela ("acompanhadas pelo Nando, Rick e Guto", "devolvida por Rick").
export const APELIDO: Record<string, string> = { [CHEFES[0]]: 'Nando', [CHEFES[1]]: 'Rick', [CHEFES[2]]: 'Guto' }

// Acompanhada = tarefa de marketing cujo dono não é chefe.
export const acompanhada = (t: { setor?: string | null; usuario_id?: string | null }) =>
  t.setor === 'marketing' && !!t.usuario_id && !ehChefe(t.usuario_id)

export type Obs = { passos?: boolean[]; minimo?: number; entrega?: { em: string; por: string } | null; aprovacao?: { em: string; por: string } | null; devolvida?: { em: string; por: string; recado: string } | null; [k: string]: any }
export const lerObs = (s: string | null | undefined): Obs => { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {} } catch { return {} } }

// entregue e ainda sem resposta de um chefe
export const esperando = (o: Obs) => !!o.entrega && !o.aprovacao
