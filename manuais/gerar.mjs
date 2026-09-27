// GERA lib/manuais-conteudo.ts A PARTIR DOS .md DESTA PASTA.
//
// ⚠️ POR QUE UM ARQUIVO GERADO. A tela /dashboard/sistemas/manual lê o texto como módulo importado:
// um `readFile` de .md solto funciona no computador e não existe no ar (a Vercel só leva o que é
// importado). Os .md continuam sendo a fonte — edita eles e roda:
//
//   node manuais/gerar.mjs
//
// O título de cada manual é o primeiro `# ` do arquivo; o resumo é o primeiro parágrafo depois dele.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const arquivos = readdirSync(aqui).filter(f => f.endsWith('.md')).sort()

const manuais = arquivos.map(f => {
  const txt = readFileSync(join(aqui, f), 'utf8')
  const linhas = txt.split('\n')
  const titulo = (linhas.find(l => l.startsWith('# ')) || f).replace(/^#\s*/, '').trim()
  const i = linhas.findIndex(l => l.startsWith('# '))
  const resumo = (linhas.slice(i + 1).find(l => l.trim() && !l.startsWith('#')) || '').trim()
  return { chave: f.replace(/^\d+-/, '').replace(/\.md$/, ''), titulo, resumo, conteudo: txt }
})

const saida = `// GERADO por manuais/gerar.mjs — NÃO EDITAR À MÃO. Edita os .md em manuais/ e roda o script.
/* eslint-disable */
export type Manual = { chave: string; titulo: string; resumo: string; conteudo: string }
export const MANUAIS: Manual[] = ${JSON.stringify(manuais, null, 2)}
`
writeFileSync(join(aqui, '..', 'lib', 'manuais-conteudo.ts'), saida)
console.log(`ok: ${manuais.length} manuais → lib/manuais-conteudo.ts (${manuais.map(m => m.chave).join(', ')})`)
