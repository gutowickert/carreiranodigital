// Maia: teste do LOGIN DO INSTAGRAM E DA PÁGINA pelo dono (16/11, app/api/maia/conectar/social). Modo local, Meta de mentira.
// Servidor (pasta limpa):
//   rm -rf .teste-conectar-social
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-conectar-social MAIA_PAINEL_SENHA=teste123456789 MAIA_SEM_AVISO=1 MAIA_CRIPTO_CHAVE=cripto-do-teste \
//   MAIA_CONECTAR_SEGREDO=segredo-do-teste MAIA_META_APP_SECRET=segredo-app-falso MAIA_META_CONFIG_SOCIAL=999 \
//   NODE_OPTIONS=--import=./scripts/maia-rede-meta-falsa.mjs npx next dev --webpack -p 3260
// Teste: node scripts/maia-teste-conectar-social.mjs http://localhost:3260 teste123456789 .teste-conectar-social
import fs from 'node:fs'
import path from 'node:path'
const [URL_ = 'http://localhost:3260', SENHA = 'teste123456789', PASTA = '.teste-conectar-social'] = process.argv.slice(2)
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 300)) } }
const op = (acao, corpo = {}) => fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) }).then(r => r.json())
const dado = r => r.dados ?? r.data ?? r
const neg = id => JSON.parse(fs.readFileSync(path.join(PASTA, 'negocios.json'), 'utf8')).find(x => x.id === id)
const social = (n, t, corpo) => corpo ? fetch(URL_ + '/api/maia/conectar/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n, t, ...corpo }) }).then(async r => ({ ...(await r.json()), http: r.status, bruto: '' }))
  : fetch(URL_ + `/api/maia/conectar/social?n=${encodeURIComponent(n)}&t=${encodeURIComponent(t)}`).then(async r => ({ ...(await r.json()), http: r.status }))
const semChave = r => !/CHAVE-PAGINA|curta-|longa-/.test(JSON.stringify(r))

async function novo(nome, fone) {
  const n = dado(await op('criar_negocio', { nome, dono_whatsapp: fone, cidade: 'Lajeado' }))
  const l = dado(await op('link_conectar', { negocio_id: n.id }))
  const u = new URL(l.link)
  return { id: n.id, n: u.searchParams.get('n'), t: u.searchParams.get('t') }
}

console.log('1) O link e o botão')
const A = await novo('TESTE · Lotérica Social', '5500077770001')
let r = await social(A.n, A.t)
confere('o link do dono abre o botão (configuração do social)', r.ok && r.config_id === '999' && r.pagina === false, r)
confere('link com assinatura errada: 403', (await social(A.n, 'errada')).http === 403)
confere('POST com assinatura errada: 403', (await social(A.n, 'errada', { code: 'um' })).http === 403)

console.log('2) Uma página: guarda na hora')
r = await social(A.n, A.t, { code: 'um' })
confere('conectou a página e o Instagram', r.ok && r.pagina === 'Lotérica do Teste' && r.instagram === '@loterica.teste', r)
confere('nenhuma chave volta pro navegador', semChave(r), r)
let m = neg(A.id).meta
confere('o negócio ficou com a página e o Instagram', m.page_id === '111111111111' && m.ig_id === '178400000000001', m)
confere('a chave guardada é a da PÁGINA, cifrada (não aparece em claro no banco)', !!m.social_token && !String(m.social_token).includes('CHAVE-PAGINA') , m.social_token)
const resumo = await fetch(URL_ + '/api/maia/operacao?acao=negocios', { headers: { 'x-senha': SENHA } }).then(r => r.text())
confere('o painel nunca mostra a chave', !/CHAVE-PAGINA/.test(resumo))

console.log('3) Várias páginas: o dono escolhe')
const B = await novo('TESTE · Lotérica Várias', '5500077770002')
r = await social(B.n, B.t, { code: 'varias' })
confere('devolve as 2 páginas pra escolher, sem chave', r.ok && r.escolher?.length === 2 && semChave(r), r)
confere('ainda não guardou nada', !neg(B.id).meta?.page_id)
confere('a lista pendente fica cifrada no banco', !!neg(B.id).meta?.social_pendente && !JSON.stringify(neg(B.id).meta.social_pendente).includes('CHAVE-PAGINA'))
confere('página que não está na lista: recusa', (await social(B.n, B.t, { page_id: '999999999999' })).http === 400)
r = await social(B.n, B.t, { page_id: '333333333333' })
confere('a escolha guarda a página e o Instagram certos', r.ok && r.instagram === '@loterica.centro' && neg(B.id).meta.page_id === '333333333333' && neg(B.id).meta.ig_id === '178400000000003', r)
confere('depois da escolha a lista pendente some', !neg(B.id).meta.social_pendente)
confere('escolher de novo sem login: pede pra entrar de novo', /de novo/.test((await social(B.n, B.t, { page_id: '333333333333' })).erro || ''))

console.log('4) Os erros')
const C = await novo('TESTE · Lotérica Erros', '5500077770003')
confere('sem página liberada: explica', /nenhuma página/i.test((await social(C.n, C.t, { code: 'nada' })).erro || ''))
confere('a Meta recusa o code: explica, sem guardar', /não consegui trocar/.test((await social(C.n, C.t, { code: 'ruim' })).erro || '') && !neg(C.id).meta?.page_id)
r = await social(C.n, C.t, { code: 'varias' }); r = await social(C.n, C.t, { page_id: '222222222222' })
confere('página sem Instagram: guarda a página e avisa', r.ok && r.sem_instagram === true && neg(C.id).meta.page_id === '222222222222' && !neg(C.id).meta.ig_id, r)

// 23/11: o code amarrado ao redirect_uri (o erro do teste real): a troca tenta vazio e o endereço da página
const D = await novo('TESTE · Escola redirect', '5500077770004')
r = await social(D.n, D.t, { code: 'pagina', pagina: URL_ + '/maia/conectar', pagina_completa: URL_ + '/maia/conectar?n=x&t=y' })
confere('code amarrado ao endereço da página: troca com o endereço que o navegador mandou', r.ok && (r.escolher || neg(D.id).meta?.page_id), r)
const E = await novo('TESTE · Escola vazio', '5500077770005')
r = await social(E.n, E.t, { code: 'vazio', pagina: URL_ + '/maia/conectar' })
confere('code que pede redirect_uri vazio: troca', r.ok && (r.escolher || neg(E.id).meta?.page_id), r)
const F = await novo('TESTE · Escola sem página', '5500077770006')
r = await social(F.n, F.t, { code: 'pagina' })
confere('sem o endereço da página: explica o erro, sem guardar', /não consegui trocar/.test(r.erro || '') && !neg(F.id).meta?.page_id, r)
r = await social(D.n, D.t, { code: 'pagina', pagina: 'https://site-de-fora.com/maia/conectar' })
confere('endereço de fora não é usado na troca', /não consegui trocar/.test(r.erro || ''), r)

// 23/11: o login devolve a chave do usuário direto (o jeito novo): confere na Meta que é do nosso app
const G = await novo('TESTE · Escola chave', '5500077770007')
r = await social(G.n, G.t, { access_token: 'curta-um' })
confere('chave do usuário direto do login: conferida e a página fica guardada', r.ok && (r.escolher || neg(G.id).meta?.page_id), r)
const H = await novo('TESTE · Chave de outro app', '5500077770008')
r = await social(H.n, H.t, { access_token: 'tk-outro-app' })
confere('chave de OUTRO app: recusa, sem guardar', /não consegui conferir/.test(r.erro || '') && !neg(H.id).meta?.page_id, r)
r = await social(H.n, H.t, { access_token: 'invalida' })
confere('chave inválida: recusa, sem guardar', /não consegui conferir/.test(r.erro || '') && !neg(H.id).meta?.page_id, r)

console.log(`\n${ok} certas, ${falha} erradas`)
process.exit(falha ? 1 : 0)
