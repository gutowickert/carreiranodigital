// Maia: o telefone do dono (23/11). O fone() do Oito tratava celular de POA sem 55 como Peru; a Maia usa foneDono e acha o dono salvo sem 55.
// Uso: node scripts/maia-teste-fone-dono.mjs
import path from 'node:path'
import { createJiti } from 'jiti'
const RAIZ = path.resolve(import.meta.dirname, '..')
process.env.MAIA_LOCAL = '1'; process.env.MAIA_LOCAL_PASTA = '.maia-teste/fone'; process.chdir(RAIZ)
const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true })
const { maiaDb: db } = await jiti.import(path.join(RAIZ, 'lib/maia/db.ts'))
const C = await jiti.import(path.join(RAIZ, 'lib/maia/canal.ts'))
let ok = 0, n = 0; const c = (x, m) => { n++; if (x) ok++; console.log((x ? '✔ ' : '✘ ') + m) }
c(C.foneDono('51 98103-0653') === '5551981030653', 'POA digitado sem 55 ganha o 55 (não vira Peru)')
c(C.foneDono('+55 (51) 98103-0653') === '5551981030653', 'com 55 fica igual')
c(C.foneDono('5132223344') === '555132223344', 'fixo de 10 dígitos ganha o 55')
const a = await db.insere('negocios', { nome: 'POA antigo', dono_whatsapp: '51981030001', status: 'ativo', plano: 'completa' })
const b = await db.insere('negocios', { nome: 'POA novo', dono_whatsapp: '5551981030002', status: 'ativo', plano: 'completa' })
c((await C.negocioDoTelefone('555181030001'))?.id === a.id, 'acha o dono salvo SEM 55 quando ele escreve (Meta manda 12 dígitos, sem o 9)')
c((await C.negocioDoTelefone('5551981030001'))?.id === a.id, 'acha o dono salvo SEM 55 (13 dígitos)')
c((await C.negocioDoTelefone('555181030002'))?.id === b.id, 'continua achando o salvo com 55')
c(!(await C.negocioDoTelefone('5551981039999')), 'número de outra pessoa não acha ninguém')
// 23/11: o post esperando o 👍 é descrito como POST (com a legenda), não como anúncio sem gancho
const D = await jiti.import(path.join(RAIZ, 'lib/maia/dono.ts'))
c(/^POST .*nossa sala/.test(D.descrevePeca({ tipo: 'post', titulo: 'Post foto · 23/11 às 9h35', texto: 'Essa é a nossa sala na escola' })), 'post da agenda: "POST … legenda"')
c(/^POST /.test(D.descrevePeca({ tipo: 'post', titulo: 'Carrossel · dicas', texto: 'x' })), 'carrossel: POST')
c(D.descrevePeca({ tipo: 'anuncio_imagem', titulo: 'a1', gancho: 'Pizza que chega quente' }) === 'ANÚNCIO "Pizza que chega quente"', 'anúncio: pelo gancho')
console.log(`${ok}/${n}`); process.exit(ok === n ? 0 : 1)
