// Maia: teste do banco PRÓPRIO (T16, 12/11). Sobe o sistema apontando SÓ pro banco novo (o da escola fica com endereço
// falso de propósito: se algum caminho da Maia ainda depender dele, o teste quebra) e confere, SEM IA e sem Meta:
// o painel lê o banco novo; negócio, peça com arquivo, campanha (com o teto de verba) e o freio do custo de IA gravam e
// leem lá; os dados copiados da escola estão inteiros. No fim apaga TUDO o que criou (o negócio de teste, em cascata, e o arquivo).
//
// Servidor (as variáveis do banco novo vêm do .env.maia-db, fora do git; nenhuma chave da escola, do WhatsApp nem da IA):
//   set -a; . ./.env.maia-db; set +a
//   NEXT_PUBLIC_SUPABASE_URL=https://banco-da-escola.invalid SUPABASE_SERVICE_ROLE_KEY=x NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
//   MAIA_PAINEL_SENHA=teste123 MAIA_SEM_AVISO=1 npx next start -p 3197
// Teste (no mesmo terminal com as variáveis do banco novo):
//   node scripts/maia-teste-banco-novo.mjs http://localhost:3197 teste123
import crypto from 'node:crypto'

const [URL = 'http://localhost:3197', SENHA = 'teste123'] = process.argv.slice(2)
const B = (process.env.MAIA_SUPABASE_URL || '').replace(/\/+$/, ''), K = process.env.MAIA_SUPABASE_SERVICE_KEY || ''
if (!B || !K) { console.log('faltam MAIA_SUPABASE_URL e MAIA_SUPABASE_SERVICE_KEY no ambiente'); process.exit(2) }
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra) } }
const H = (x = {}) => ({ apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', ...x })
const rest = async (caminho, opc = {}) => {
  const r = await fetch(`${B}/rest/v1/${caminho}`, { ...opc, headers: H(opc.headers) })
  const t = await r.text()
  if (!r.ok) throw new Error(`${caminho.split('?')[0]}: ${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : []
}
const conta = async (tab) => Number(((await fetch(`${B}/rest/v1/${tab}?select=id`, { method: 'HEAD', headers: H({ Prefer: 'count=exact', Range: '0-0' }) })).headers.get('content-range') || '/0').split('/')[1])
async function api(acao, corpo = {}) {
  const r = await fetch(`${URL}/api/maia/operacao`, { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) })
  const j = await r.json().catch(() => ({}))
  return { ...j, http: r.status }
}
const dado = r => r.dados ?? r.data ?? r
let negId = null, arquivo = null

try {
  console.log('1) O sistema está no banco novo, com os dados copiados')
  const res = await fetch(`${URL}/api/maia/operacao?acao=resumo`, { headers: { 'x-senha': SENHA } }).then(r => r.json()).catch(e => ({ erro: String(e) }))
  const rs = dado(res)
  confere('o painel diz banco: proprio', rs?.banco === 'proprio', JSON.stringify(res).slice(0, 200))
  confere('o painel enxerga os 2 negócios de teste copiados', rs?.negocios >= 2, String(rs?.negocios))
  confere('mensagens copiadas (219)', (await conta('maia_msgs')) >= 219)
  const objs = await fetch(`${B}/storage/v1/object/list/maia`, { method: 'POST', headers: H(), body: JSON.stringify({ prefix: '', limit: 100 }) }).then(r => r.json())
  confere('o bucket maia existe no banco novo e tem as pastas copiadas', Array.isArray(objs) && objs.length >= 1, JSON.stringify(objs).slice(0, 150))
  const bk = await fetch(`${B}/storage/v1/bucket/maia`, { headers: H() }).then(r => r.json())
  confere('o bucket é privado', bk?.public === false, JSON.stringify(bk).slice(0, 120))

  console.log('2) Gravar e ler: negócio, peça com arquivo, campanha com teto')
  const n = dado(await api('criar_negocio', { nome: 'TESTE · Banco novo (apagar)', dono_whatsapp: '5500099990009', cidade: 'Estrela', verba_dia: 30, meta: { ad_account_id: '123', page_id: '456', limites: { verba_max_dia: 50 } } }))
  negId = n?.id
  confere('negócio criado pelo painel', !!negId, JSON.stringify(n).slice(0, 200))
  const [doBanco] = await rest(`maia_negocios?id=eq.${negId}&select=id,meta`)
  confere('o negócio está gravado no banco novo, com o teto', doBanco?.meta?.limites?.verba_max_dia === 50, JSON.stringify(doBanco).slice(0, 200))
  arquivo = `${negId}/pecas/teste-banco-novo.jpg`
  const up = await fetch(`${B}/storage/v1/object/maia/${arquivo}`, { method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'image/jpeg' }, body: Buffer.from('arte de mentira') })
  confere('arquivo sobe no bucket do banco novo', up.ok, String(up.status))
  const agora = new Date().toISOString()
  await rest('maia_pecas', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: crypto.randomUUID(), negocio_id: negId, tipo: 'anuncio_imagem', status: 'aprovada', titulo: 'Teste', texto: 'Teste', gancho: 'Teste', cta: 'Chama', midia_ids: [], versao: 1, arquivo_path: arquivo, aprovado_dono_em: agora }) })
  let r = await api('criar_campanha', { negocio_id: negId, verba_dia: 80 })
  confere('campanha de R$ 80 com teto de R$ 50 é recusada', r.http >= 400 && /teto/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 200))
  r = await api('criar_campanha', { negocio_id: negId, verba_dia: 40 })
  const camp = dado(r)
  confere('campanha de R$ 40 criada pausada (simulada, sem Meta)', r.http < 400 && camp?.status === 'criada_pausada', JSON.stringify(r).slice(0, 200))
  const camps = await rest(`maia_campanhas?negocio_id=eq.${negId}&select=id,status`)
  confere('a campanha está no banco novo', camps.length === 1 && camps[0].status === 'criada_pausada', JSON.stringify(camps))

  console.log('3) O freio do custo de IA lê o banco novo')
  await rest('maia_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ tipo: 'uso_ia', negocio_id: negId, detalhe: { tipo: 'cliente', modelo: 'claude-sonnet-5-5', entrada: 2000000, saida: 0 } }) })
  r = await api('simular_cliente', { negocio_id: negId, telefone: '5500011119999', nome: 'Ana', texto: 'Oi, quanto custa?' })
  const resp = dado(r)?.respondeu
  confere('o cliente vai pra equipe (freio_ia_do_dia), sem chamar a IA', resp?.ferramentas?.includes('freio_ia_do_dia'), JSON.stringify(r).slice(0, 300))
  const cv = await rest(`maia_conversas?negocio_id=eq.${negId}&canal=eq.cliente&select=modo`)
  confere('a conversa ficou em modo humano no banco novo', cv[0]?.modo === 'humano', JSON.stringify(cv))
  const lim = await rest(`maia_eventos?negocio_id=eq.${negId}&tipo=eq.limite_atingido&select=id`)
  confere('o aviso do limite foi registrado 1 vez', lim.length === 1, String(lim.length))
  const l = dado(await api('limites', { negocio_id: negId }))
  confere('o retrato dos limites mostra o gasto do dia', l?.ia?.estourou === true, JSON.stringify(l).slice(0, 200))
} catch (e) {
  falha++; console.log('  ✘ erro:', e?.message || e)
} finally {
  console.log('4) Limpeza')
  if (arquivo) await fetch(`${B}/storage/v1/object/maia`, { method: 'DELETE', headers: H(), body: JSON.stringify({ prefixes: [arquivo] }) })
  if (negId) await rest(`maia_negocios?id=eq.${negId}`, { method: 'DELETE' })
  if (negId) await rest(`maia_eventos?negocio_id=eq.${negId}`, { method: 'DELETE' })   // maia_eventos não tem ligação com o negócio (é o registro): sai à mão
  const sobraNeg = negId ? await rest(`maia_negocios?id=eq.${negId}&select=id`) : ['?']
  const sobraEv = negId ? await rest(`maia_eventos?negocio_id=eq.${negId}&select=id`) : ['?']
  confere('nada do teste ficou no banco (o negócio apagado leva o resto junto; os eventos saem à mão)', sobraNeg.length === 0 && sobraEv.length === 0, `negócio: ${sobraNeg.length}, eventos: ${sobraEv.length}`)
}
console.log(`\n${ok} certas, ${falha} erradas`)
process.exit(falha ? 1 : 0)
