// Maia: o teste do PAINEL DO DONO (07/11). Roda DEPOIS do scripts/maia-teste.mjs, no mesmo servidor em MODO LOCAL
// (precisa dos negócios, leads e conversas que ele cria).
// Uso: node scripts/maia-teste-painel-dono.mjs [url] [senha]   (padrão http://localhost:3190 teste123)
// Variáveis: MAIA_CONECTAR_SEGREDO (o mesmo do servidor, pra forjar um link vencido com assinatura certa)
//            MAIA_LOCAL_PASTA (opcional: põe gasto de anúncio e avisos de exemplo no 1º negócio, pros prints)
import fs from 'node:fs'
import path from 'node:path'
import { createHmac } from 'node:crypto'

const URL_ = process.argv[2] || 'http://localhost:3190'
const SENHA = process.argv[3] || 'teste123'
const SEG = process.env.MAIA_CONECTAR_SEGREDO || 'seg123'
const log = (...a) => console.log(...a)
const rel = []
const anota = (ok, o) => { rel.push({ ok, o }); log((ok ? '  ✔ ' : '  ✘ ') + o) }

async function op(acao, corpo = {}) {
  const r = await fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'teste', ...corpo }) })
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status)); return j
}
async function ver(acao, q = {}) {
  const r = await fetch(URL_ + '/api/maia/operacao?' + new URLSearchParams({ acao, ...q }), { headers: { 'x-senha': SENHA } })
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status)); return j
}
const IP = { 'x-real-ip': '10.1.1.' + Math.floor(Math.random() * 200) }   // os testes normais num IP
let nIp = 0; const outroIp = () => ({ 'x-real-ip': '10.2.' + Math.floor(Math.random() * 200) + '.' + (++nIp) })   // cada tentativa errada num IP próprio (senão o limite de 10 erros bloqueia o resto do teste)
const entrar = (t, ip = IP) => fetch(URL_ + '/api/maia/painel', { method: 'POST', headers: { 'content-type': 'application/json', ...ip }, body: JSON.stringify({ acao: 'entrar', t }) })
const painel = (t, q = 'acao=tudo', ip = IP) => fetch(URL_ + '/api/maia/painel?' + q, { headers: { cookie: 'maia_dono=' + encodeURIComponent(t), ...ip } })
const acao = (t, corpo, cab = { 'x-maia-painel': '1' }) => fetch(URL_ + '/api/maia/painel', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'maia_dono=' + encodeURIComponent(t), ...IP, ...cab }, body: JSON.stringify(corpo) })
const tokenDe = (link) => new URL(link).searchParams.get('t')
// o mesmo jeito de assinar do servidor (lib/maia/painel-dono.ts), pra forjar um link VENCIDO com assinatura certa
const forja = (id, v, exp) => { const k = createHmac('sha256', SEG).update('maia:painel-dono:v1').digest(); return `${id}.${v}.${exp}.${createHmac('sha256', k).update(`painel-dono.${id}.${v}.${exp}`).digest('base64url').slice(0, 43)}` }

async function main() {
  log('Maia · teste do painel do dono em ' + URL_)
  const res = await ver('resumo')
  if (res.modo !== 'local') throw new Error('o sistema NÃO está em modo local: teste cancelado')
  const negs = await ver('negocios')
  if (negs.length < 2) throw new Error('rode antes o scripts/maia-teste.mjs (precisa de 2+ negócios)')
  const [A, B] = negs.find(n => /Ótica/.test(n.nome)) ? [negs.find(n => /Ótica/.test(n.nome)), negs.find(n => !/Ótica/.test(n.nome))] : negs

  // dados de exemplo pros prints (gasto de anúncio e avisos que "já foram pro dono"), direto na pasta do modo local
  if (process.env.MAIA_LOCAL_PASTA) {
    const pasta = path.join(process.cwd(), process.env.MAIA_LOCAL_PASTA)
    const le = (t) => { try { return JSON.parse(fs.readFileSync(path.join(pasta, t + '.json'), 'utf8')) } catch { return [] } }
    const met = le('metricas_dia').filter(m => m.negocio_id !== A.id)
    for (let i = 0; i < 10; i++) met.push({ negocio_id: A.id, dia: new Date(Date.now() - 3 * 3600e3 - i * 86400e3).toISOString().slice(0, 10), gasto: 30, impressoes: 2100, alcance: 1500, conversas_iniciadas: 4, cliques: 60 })
    fs.writeFileSync(path.join(pasta, 'metricas_dia.json'), JSON.stringify(met, null, 1))
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
    const av = le('avisos').filter(a => a.negocio_id !== A.id)
    av.push({ id: crypto.randomUUID(), negocio_id: A.id, dia: hoje, tipo: 'quente_parado', nivel: 'atencao', titulo: 'Rui está parado há 2 dias', texto: 'Ele perguntou da armação infantil e ficou de falar com a esposa.', acao: 'Responde se tem armação infantil: a Maia repassa pra ele.', status: 'enviado', criado_em: new Date().toISOString() })
    av.push({ id: crypto.randomUUID(), negocio_id: A.id, dia: hoje, tipo: 'gasto_sem_conversa', nivel: 'urgente', titulo: '(interno, não pode aparecer) aviso ainda na revisão da equipe', texto: 'x', status: 'revisao_equipe', criado_em: new Date().toISOString() })
    fs.writeFileSync(path.join(pasta, 'avisos.json'), JSON.stringify(av, null, 1))
    log('  (gasto de anúncio e avisos de exemplo postos no ' + A.nome + ')')
  }

  // 1) o link certo abre o painel do negócio dele, com cookie httpOnly
  const lA = await op('link_painel_dono', { negocio_id: A.id }), lB = await op('link_painel_dono', { negocio_id: B.id })
  const tA = tokenDe(lA.link), tB = tokenDe(lB.link)
  anota(lA.vale_dias === 30 && /\/maia\/painel\?t=/.test(lA.link), `o painel da equipe gera o link do dono (vale ${lA.vale_dias} dias)`)
  let r = await entrar(tA)
  const ck = r.headers.get('set-cookie') || ''
  anota(r.status === 200 && /HttpOnly/i.test(ck) && /Secure/i.test(ck) && /SameSite=Lax/i.test(ck) && /Path=\/api\/maia\/painel/.test(ck), 'link válido entra e vira cookie httpOnly, Secure, SameSite=Lax, só no caminho da API')
  const pag = await fetch(URL_ + '/maia/painel').then(x => x.text())
  anota(/history\.replaceState/.test(pag) && /no-referrer/.test(pag), 'a página tira o token da barra de endereço e não manda referer')
  r = await painel(tA); const dA = await r.json(), txtA = JSON.stringify(dA)
  anota(r.status === 200 && dA.negocio?.nome === A.nome, `o link do ${A.nome} abre o ${dA.negocio?.nome}`)
  const leadsA = await ver('leads', { negocio: A.id }), leadsB = await ver('leads', { negocio: B.id })
  const idsA = new Set(leadsA.map(l => l.id)), idsP = new Set(dA.funil.map(l => l.id))
  anota(idsP.size === idsA.size && [...idsP].every(i => idsA.has(i)) && !leadsB.some(l => idsP.has(l.id)), `funil: ${idsP.size} contatos, todos do negócio dele, nenhum de outro`)
  const cvsA = new Set((await ver('conversas', { negocio: A.id })).filter(c => c.canal === 'cliente').map(c => c.id))
  anota(dA.conversas.length === cvsA.size && dA.conversas.every(c => cvsA.has(c.id)), `atendimento: ${dA.conversas.length} conversas, só as dos clientes dele`)
  const outros = negs.filter(n => n.id !== A.id)
  const proibido = ['"token"', tA, tB, '(guardada)', 'wa_phone_id', 'nota_equipe', 'aprovado_equipe_por', 'negocio_id', 'painel_versao', 'interno, não pode aparecer', SEG, ...outros.map(n => n.id), ...outros.map(n => n.nome)]
  const achou = proibido.filter(p => txtA.includes(p))
  anota(!achou.length, 'a resposta não tem token, chave, nota da equipe, id de negócio nem nada de outro negócio' + (achou.length ? ' — achou: ' + achou.join(', ') : ''))

  // 2) adulterado, de outro negócio, vencido, versão errada
  const [id, v, exp, sig] = tA.split('.'), [idB, , , sigB] = tB.split('.')
  const casos = [
    ['negócio trocado no token (assinatura de outro)', `${idB}.${v}.${exp}.${sig}`],
    ['assinatura de outro negócio no id dele', `${id}.${v}.${exp}.${sigB}`],
    ['validade esticada', `${id}.${v}.${Number(exp) + 86400}.${sig}`],
    ['assinatura mexida', `${id}.${v}.${exp}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`],
    ['vencido (assinatura certa)', forja(id, Number(v), Math.floor(Date.now() / 1000) - 60)],
    ['versão que ainda não existe', forja(id, Number(v) + 5, Number(exp))],
    ['vazio', ''],
  ]
  for (const [nome, t] of casos) { const e = await entrar(t, outroIp()), g = await painel(t, 'acao=tudo', outroIp()); anota(e.status === 401 && g.status === 401, `recusado: ${nome}`) }
  anota((await entrar(forja(id, Number(v), Math.floor(Date.now() / 1000) + 3600))).status === 200, '(conferência do teste: o mesmo jeito de assinar, com validade boa, entra)')

  // 3) o link de conexão do WhatsApp não abre o painel, e o do painel não abre a conexão
  const lc = await op('link_conectar', { negocio_id: A.id }), uc = new URL(lc.link), tc = uc.searchParams.get('t')
  anota((await entrar(tc, outroIp())).status === 401 && (await entrar(`${A.id}.${tc}`, outroIp())).status === 401 && (await painel(`${A.id}.0.${tc}`, 'acao=tudo', outroIp())).status === 401, 'o link de conectar o WhatsApp NÃO abre o painel')
  const cn = await fetch(URL_ + '/api/maia/conectar?' + new URLSearchParams({ n: A.id, t: tA }))
  anota(cn.status === 403, 'o link do painel NÃO abre a página de conectar o WhatsApp')

  // 4) conversa de outro negócio, e ações em coisa de outro negócio
  const cvB = (await ver('conversas', { negocio: B.id })).find(c => c.canal === 'cliente')
  if (cvB) anota((await painel(tA, 'acao=conversa&id=' + cvB.id)).status === 404, 'a conversa de um cliente de outro negócio não abre')
  const cvA = dA.conversas[0]
  if (cvA) { const c = await (await painel(tA, 'acao=conversa&id=' + cvA.id)).json(); anota(c.msgs?.length > 0 && c.msgs.every(m => ['cliente', 'maia', 'dono'].includes(m.autor)), `a conversa dele abre completa (${c.msgs?.length} mensagens)`) }
  const leadB = leadsB[0], pecaB = (await ver('pecas', { negocio: B.id }))[0]
  anota((await acao(tA, { acao: 'venda', lead_id: leadB.id, valor: 1 })).status === 404 && (await acao(tA, { acao: 'perda', lead_id: leadB.id, motivo: 'x' })).status === 404, 'não marca venda nem perda em contato de outro negócio')
  if (pecaB) anota((await acao(tA, { acao: 'aprovar', peca_id: pecaB.id })).status === 404, 'não aprova anúncio de outro negócio')
  const leadB2 = (await ver('leads', { negocio: B.id })).find(l => l.id === leadB.id)
  anota(leadB2.etapa === leadB.etapa && leadB2.valor === leadB.valor, 'o contato do outro negócio ficou como estava')
  anota((await acao(tA, { acao: 'venda', lead_id: leadsA[0].id }, {})).status === 403, 'ação sem o cabeçalho da página é recusada (proteção contra outro site)')

  // 5) as ações do dono, pelas mesmas funções do WhatsApp
  const abertoA = leadsA.find(l => !['ganho', 'perdido'].includes(l.etapa))
  if (abertoA) {
    r = await acao(tA, { acao: 'venda', lead_id: abertoA.id, valor: '250', produto: 'teste do painel' })
    const l = (await ver('leads', { negocio: A.id })).find(x => x.id === abertoA.id)
    anota(r.status === 200 && l.etapa === 'ganho' && Number(l.valor) === 250, `o dono marcou venda pelo painel: ${l.nome} ganho R$ ${l.valor}`)
  }
  const aprovada = (await ver('pecas', { negocio: A.id })).find(p => p.status !== 'com_dono')
  if (aprovada) anota((await acao(tA, { acao: 'aprovar', peca_id: aprovada.id })).status === 400, 'só aprova anúncio que está esperando o 👍 dele')

  // 6) os números batem com os do painel da equipe (/api/maia/operacao?acao=numeros)
  const d2 = await (await painel(tA)).json()
  for (const p of ['hoje', 'semana', 'mes']) {
    const P = d2.periodos[p], n = await ver('numeros', { negocio: A.id, de: P.de, ate: P.ate })
    const campos = ['leads_novos', 'ganhos', 'perdidos', 'receita', 'gasto', 'conversao', 'custo_por_venda', 'em_aberto']
    const dif = campos.filter(k => JSON.stringify(P[k]) !== JSON.stringify(n[k]))
    anota(!dif.length, `${p}: os números batem com a equipe (${P.leads_novos} contatos, ${P.ganhos} vendas, R$ ${P.receita}, investimento R$ ${P.gasto})` + (dif.length ? ' — diferentes: ' + dif.join(', ') : ''))
  }
  log(`    retomadas: ${d2.retomadas.agendadas.length} agendadas (${d2.retomadas.atrasadas} atrasadas), ${d2.retomadas.feitas.length} feitas, ${d2.retomadas.respondidas} respondidas · esperando o dono: ${d2.esperando.length} · avisos: ${d2.avisos.length}`)
  if (process.env.MAIA_LOCAL_PASTA) anota(d2.avisos.length === 1 && d2.avisos[0].status === 'enviado', 'avisos: só o que já foi pro dono aparece (o da revisão da equipe não)')

  // 7) revogar: o link antigo para na hora (e salvar o formulário do negócio não ressuscita)
  const rv = await op('painel_dono_revogar', { negocio_id: A.id })
  const tN = tokenDe(rv.link)
  anota((await entrar(tA, outroIp())).status === 401 && (await painel(tA, 'acao=tudo', outroIp())).status === 401, 'depois de "trocar link", o link antigo não abre mais (nem o cookie)')
  anota((await entrar(tN)).status === 200, 'o link novo abre')
  await op('atualizar_negocio', { id: A.id, meta: { ad_account_id: '111', page_id: '222' } })
  anota((await painel(tA, 'acao=tudo', outroIp())).status === 401 && (await painel(tN)).status === 200, 'salvar os dados do negócio não ressuscita o link revogado nem derruba o novo')

  // 8) pelo WhatsApp: o dono pede o painel e a Maia manda o link
  const w = await op('simular_dono', { negocio_id: A.id, texto: 'Maia, me manda o link do meu painel?' })
  const falou = (w?.respondeu?.mensagens || []).join(' / ')
  const lw = (falou.match(/https?:\/\/\S+\/maia\/painel\?t=[\w.-]+/) || [])[0]
  log('    dono: Maia, me manda o link do meu painel?\n    maia: ' + falou + '  [' + (w?.respondeu?.ferramentas || []).join(', ') + ']')
  anota(!!lw && (await entrar(tokenDe(lw))).status === 200, 'no WhatsApp, o dono pede "meu painel" e a Maia manda um link que abre')

  // 9) o resumo da semana leva o link
  const relA = (await ver('fila')).find(p => p.tipo === 'relatorio' && p.negocio_id === A.id && p.status === 'revisao_equipe')
  if (relA) {
    await op('aprovar_peca', { peca_id: relA.id })
    const cvd = (await ver('conversas', { negocio: A.id })).find(c => c.canal === 'dono')
    const ult = (await ver('msgs', { conversa: cvd.id })).filter(m => m.autor === 'maia').slice(-1)[0]
    const lr = (ult?.texto.match(/https?:\/\/\S+\/maia\/painel\?t=[\w.-]+/) || [])[0]
    anota(!!lr && (await entrar(tokenDe(lr))).status === 200, 'o resumo da semana, aprovado pela equipe, chega pro dono com o link do painel')
  } else anota(false, 'não achei o resumo da semana do negócio na fila (rodou o maia-teste.mjs antes?)')

  // 10) força bruta: 10 links errados no mesmo IP bloqueiam por 15 min (até o link certo)
  const ipRuim = { 'x-real-ip': '10.9.9.' + Math.floor(Math.random() * 200) }
  for (let i = 0; i < 10; i++) await entrar('lixo-' + i, ipRuim)
  anota((await entrar(tN, ipRuim)).status === 429 && (await entrar(tN)).status === 200, 'depois de 10 links errados o IP fica bloqueado (os outros IPs seguem entrando)')

  const falhas = rel.filter(x => !x.ok)
  log(`\n${rel.length - falhas.length} de ${rel.length} conferências do painel do dono passaram.`)
  if (falhas.length) { log('Falharam:\n' + falhas.map(f => ' - ' + f.o).join('\n')); process.exit(1) }
}
main().catch(e => { console.error('\nERRO: ' + e.message); process.exit(1) })
