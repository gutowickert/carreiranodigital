// O banco devolve no máximo 1000 linhas por consulta e não avisa quando corta. lerTudo repete a consulta
// de 1000 em 1000 até acabar. A consulta precisa vir ORDENADA (ex.: .order('id')), senão as páginas se
// misturam. Uso: lerTudo((de, ate) => supabase.from('tabela').select('a, b').eq(...).order('id').range(de, ate))
// (07/10/2026, Rick: tela Caixas; o Fluxo de Caixa tem a versão dele)
export async function lerTudo<T = any>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const linhas: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) { console.error('Erro lendo em páginas:', error); break }
    linhas.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return linhas
}
