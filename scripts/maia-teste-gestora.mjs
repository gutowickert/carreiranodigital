// Maia Gestora (T15, 08/11): o teste. Duas partes.
//  1) as regras (lib/maia/gestora.ts), direto no node, sem servidor: os 10 casos do teste-regras.js do protótipo + privacidade
//     + o horário + (com VIGIA=<pasta ferramentas/maia-gestora>) o mesmo resultado do regras.js antigo nos mesmos dados.
//  2) com uma URL: de ponta a ponta contra o sistema em MODO LOCAL (MAIA_LOCAL=1), com 3 negócios e CRMs INVENTADOS em arquivo.
//     Nada sai do PC: sem banco, sem Meta, sem WhatsApp.
// Uso:
//   node --no-warnings scripts/maia-teste-gestora.mjs                                 (só a parte 1)
//   node --no-warnings scripts/maia-teste-gestora.mjs http://localhost:3197 teste123  (as duas)
// O servidor da parte 2 sobe assim (pasta limpa):
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-maia-gestora MAIA_GESTORA_META_PASTA=.teste-maia-gestora/meta-gestora \
//   MAIA_GESTORA_DONOS=11111111-0000-4000-8000-000000000002,11111111-0000-4000-8000-000000000003 MAIA_PAINEL_SENHA=teste123 npx next start -p 3197
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import * as G from '../lib/maia/gestora.ts'

const URL_ = process.argv[2] || ''
const SENHA = process.argv[3] || 'teste123'
const PASTA = path.resolve(process.env.PASTA || '.teste-maia-gestora')
const log = (...a) => console.log(...a)
const rel = []
const anota = (ok, o) => { rel.push({ ok: !!ok, o }); log((ok ? '  ✔ ' : '  ✘ ') + o) }

// ═══════════════════════════ PARTE 1: as regras
log('Parte 1 · as regras (lib/maia/gestora.ts)')
const L = G.LIMITES
{
  // os 10 casos do ferramentas/maia-gestora/teste-regras.js (06/11), iguaizinhos
  const hoje = '2026-11-06', agora = Date.parse('2026-11-06T15:00:00-03:00')
  const dia = n => new Date(Date.parse(hoje + 'T12:00:00Z') - n * 86400e3).toISOString().slice(0, 10)
  const linha = (n, gasto, conversas, camp = 'WOOD - WHATSAPP') => ({ data: dia(n), ad_id: 'a1', ad_name: 'PRESENTE 1', campaign_name: camp, adset_name: 'c', gasto, conversas })
  const confere = (nome, avisos, tipo, esperado = true) => anota(avisos.some(a => a.tipo === tipo) === esperado, nome + (avisos.some(a => a.tipo === tipo) === esperado ? '' : ' → ' + JSON.stringify(avisos.map(a => a.tipo))))
  const meta = (linhas, extra = {}) => G.regrasMeta({ meta: linhas, hoje, horaBR: 15, L, rascunhos: [], cliente: {}, ...extra })
  const normal = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => linha(n, 35, 20))
  confere('Wood: gasto sem conversa hoje', meta([...normal, linha(0, 22, 0)]), 'gasto_sem_conversa')
  confere('dia normal não dá alarme', meta([...normal, linha(0, 22, 7)]), 'gasto_sem_conversa', false)
  confere('Escola: parou de gastar', meta([...[2, 3, 4, 5, 6, 7, 8].map(n => linha(n, 170, 3)), linha(1, 230, 4), linha(0, 0.32, 0)], { cliente: { conta_prepaga: true } }), 'parou_de_gastar')
  confere('custo por conversa subiu', meta([...[4, 5, 6, 7, 8, 9, 10].map(n => linha(n, 30, 10)), ...[1, 2, 3].map(n => linha(n, 30, 4))]), 'custo_subiu')
  confere('rascunho não publicado', meta(normal, { rascunhos: [{ objeto: 'conjunto', campo: 'verba por dia', para: 8, publicado: false }] }), 'rascunho')
  const iso = h => new Date(agora - h * 3600e3).toISOString()
  const d = {
    etapas: [{ chave: 'aguardando_pagamento', label: 'Aguardando pagamento', papel: 'parking' }],
    leads: [1, 2, 3, 4].map(i => ({ id: 'L' + i, nome: 'Pessoa ' + i, whatsapp: '5551999' + i, etapa: 'aguardando_pagamento', criado_em: iso(300), atualizado_em: iso(100) })),
    matriculas: [], lead_andamentos: [1, 2, 3, 4].map(i => ({ lead_id: 'L' + i, etapa_nova: 'aguardando_pagamento', criado_em: iso(24 * (3 + i)) })),
    wa_conversas: [{ id: 'C1', lead_id: 'L1' }, ...[1, 2, 3, 4, 5, 6].map(i => ({ id: 'N' + i }))],
    wa_mensagens: [
      { conversa_id: 'C1', direcao: 'recebida', criado_em: iso(80), texto: 'Quero fazer copos pra empresa' },
      { conversa_id: 'C1', direcao: 'enviada', criado_em: iso(79.9), texto: 'Quantos copos você precisa?' },
      { conversa_id: 'C1', direcao: 'recebida', criado_em: iso(79.5), texto: 'Uns 50' },
      { conversa_id: 'C1', direcao: 'enviada', criado_em: iso(79.4), texto: 'Ótimo! Deixa eu confirmar essa condição com o time e já te retorno.' },
      ...[1, 2, 3, 4, 5, 6].flatMap(i => [{ conversa_id: 'N' + i, direcao: 'recebida', criado_em: iso(30), texto: 'oi, quanto custa?' }, { conversa_id: 'N' + i, direcao: 'enviada', criado_em: iso(30 - 1.1), texto: 'Oi!' }]),
    ],
    webhook_logs: [1, 2, 3, 4].map(() => ({ origem: 'capi-wa-leadsubmitted', status: 'erro', recebido_em: iso(20), erro: 'Não há uma conta do WhatsApp Business vinculada a este conjunto de dados' })),
  }
  const { av } = G.regrasCRM({ d, cliente: { etapas_quentes: { aguardando_pagamento: 'aguardando pagamento' } }, agora, L, resumo: {} })
  confere('Escola: aguardando pagamento parado', av, 'quente_parado')
  confere('Escola: envio pra Meta falhando (sem WABA)', av, 'capi_falhando')
  confere('Wood: "vou confirmar com o time" sem volta', av, 'promessa_sem_volta')
  confere('Wood: pedido de empresa parado', av, 'pedido_grande_parado')
  confere('Dani: primeira resposta lenta', av, 'resposta_lenta')

  // privacidade: a mesma conversa num negócio da área da saúde não leva nome nenhum
  const saude = G.regrasCRM({ d, cliente: { saude: true, etapas_quentes: { aguardando_pagamento: 'aguardando pagamento' } }, agora, L, resumo: {} }).av
  anota(saude.every(a => !(a.pessoas || []).length), 'saúde: nenhum aviso leva nome de pessoa')
  anota(av.find(a => a.tipo === 'quente_parado')?.pessoas?.[0]?.startsWith('Pessoa'), 'fora da saúde: o aviso leva o primeiro nome (pra o dono saber quem chamar)')
  anota(G.primeiroNome('THIAGO pereira da silva') === 'Thiago P.', 'primeiro nome + inicial ("Thiago P.")')
  anota((av.find(a => a.tipo === 'quente_parado')?.lead_ids || []).length === 4, 'o aviso guarda os ids dos leads (é o que vai pro banco, não o nome)')
  const an = G.analisa({ cliente: { saude: true, etapas_quentes: { aguardando_pagamento: 'x' } }, crm: d, meta: normal, agora })
  const txt = G.textoDono('Espaço Teste', an, { saude: true, comNomes: true })
  anota(!/Pessoa \d/.test(txt) && /área da saúde/.test(txt), 'a mensagem da saúde não tem nome e diz por quê')
  const an2 = G.analisa({ cliente: { etapas_quentes: { aguardando_pagamento: 'x' } }, crm: d, meta: normal, agora })
  anota(/Quem: Pessoa/.test(G.textoDono('Wood', an2, { comNomes: true })) && !/Quem:/.test(G.textoDono('Wood', an2, { comNomes: false })), 'nome só quando pedido (comNomes): o aviso da equipe sai sem nome')
  // modo de 2 em 2 horas: só as urgentes da Meta, sem ler CRM
  const u = G.analisa({ cliente: {}, crm: d, meta: [...normal, linha(0, 22, 0)], agora, modo: 'urgentes' })
  anota(u.avisos.length === 1 && u.avisos[0].tipo === 'gasto_sem_conversa', 'modo urgente: só "gasto sem conversa"/"parou de gastar", nada de CRM')
  // horário (Brasília)
  const h = s => G.qualModo(new Date(s))
  anota(h('2026-11-10T07:20:00-03:00') === 'dia' && h('2026-11-09T07:05:00-03:00') === 'semana' && h('2026-11-10T11:00:00-03:00') === 'urgentes' && h('2026-11-10T19:30:00-03:00') === 'urgentes' && h('2026-11-10T10:00:00-03:00') === null && h('2026-11-10T21:00:00-03:00') === null && h('2026-11-10T08:00:00-03:00') === null,
    'horário: 7h tudo, segunda 7h semana, 9/11/13/15/17/19h urgentes, resto nada')
  anota(G.MODELO_AVISO.name === 'maia_aviso' && /\{\{1\}\}, tenho \{\{2\}\} avisos de hoje sobre \{\{3\}\}\. Quer ver\?/.test(G.MODELO_AVISO.components[0].text), 'modelo maia_aviso pronto ("{{1}}, tenho {{2}} avisos de hoje sobre {{3}}. Quer ver?")')

  // o mesmo resultado do protótipo (lib/regras.js) nos mesmos dados
  if (process.env.VIGIA) {
    const req = createRequire(import.meta.url)
    const V = req(path.join(path.resolve(process.env.VIGIA), 'lib', 'regras.js'))
    const limpa = avs => JSON.stringify(avs.map(({ lead_ids, ...a }) => ({ ...a, numeros: Object.fromEntries(Object.entries(a.numeros || {}).filter(([k]) => k !== 'ad_id')) })))
    const casos = [
      ['meta', x => x.regrasMeta({ meta: [...normal, linha(0, 22, 0)], hoje, horaBR: 15, L, rascunhos: [{ objeto: 'c', campo: 'v', para: 8, publicado: false }], cliente: { conta_prepaga: true } })],
      ['crm', x => x.regrasCRM({ d, cliente: { etapas_quentes: { aguardando_pagamento: 'aguardando pagamento' }, preco_unidade_pedido_grande: 31 }, agora, L, resumo: {} }).av],
      ['crm saúde', x => x.regrasCRM({ d, cliente: { saude: true, etapas_pagas: ['aguardando_pagamento'], valor_etapa_paga: 200 }, agora, L, resumo: {} }).av],
    ]
    for (const [nome, f] of casos) anota(limpa(f(V)) === limpa(f(G)), `igual ao protótipo (regras.js): ${nome}`)
  }
}

// ═══════════════════════════ PARTE 2: de ponta a ponta no modo local
async function parte2() {
  log('\nParte 2 · de ponta a ponta no modo local (' + URL_ + ')')
  const api = async (corpo, q) => {
    const r = await fetch(URL_ + '/api/maia/gestora' + (q ? '?' + new URLSearchParams(q) : ''), corpo ? { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify(corpo) } : { headers: { 'x-senha': SENHA } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error((corpo?.acao || q?.acao) + ': ' + (j.erro || r.status))
    return j
  }
  const tab = t => { try { return JSON.parse(fs.readFileSync(path.join(PASTA, t + '.json'), 'utf8')) } catch { return [] } }
  const poe = (t, ls) => { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(path.join(PASTA, t + '.json'), JSON.stringify(ls, null, 1)) }

  // 3 negócios inventados (nomes de pessoas inventados também). Os dados ficam em volta de domingo 08/11/2026 7h10.
  const T0 = Date.parse('2026-11-08T07:10:00-03:00')
  const iso = h => new Date(T0 - h * 3600e3).toISOString()
  const dia = n => new Date(Date.parse('2026-11-08T12:00:00Z') - n * 86400e3).toISOString().slice(0, 10)
  const ID = n => '11111111-0000-4000-8000-00000000000' + n
  const LID = (n, i) => `22222222-0000-4000-8000-${String(n).padStart(4, '0')}${String(i).padStart(8, '0')}`
  const negs = [
    { id: ID(1), nome: 'Escola Inventada (teste)', plano: 'gestao', status: 'implantacao', dono_nome: 'Guto', dono_whatsapp: '5500088880001', meta: { ad_account_id: '9001' }, crm: { tipo: 'pasta', pasta: path.join(path.basename(PASTA), 'crm-escola') }, gestora: { chave: 'escola', conta_prepaga: true, etapas_quentes: { aguardando_pagamento: 'aguardando pagamento' } } },
    { id: ID(2), nome: 'Brindes Inventados (teste)', plano: 'gestao', status: 'implantacao', dono_nome: 'Rafa', dono_whatsapp: '5500088880002', meta: { ad_account_id: '9002' }, crm: { tipo: 'pasta', pasta: path.join(path.basename(PASTA), 'crm-brindes') }, gestora: { chave: 'brindes', preco_unidade_pedido_grande: 31, etapas_quentes: { arte_enviada: 'arte enviada' } } },
    { id: ID(3), nome: 'Clínica Inventada (teste)', plano: 'gestao', status: 'implantacao', dono_nome: 'Lia', dono_whatsapp: '5500088880003', meta: { ad_account_id: '9003' }, crm: { tipo: 'teunegocio', url_env: 'MAIA_CRM_TESTE_URL', chave_env: 'MAIA_CRM_TESTE_LEITURA' }, gestora: { chave: 'clinica', saude: true, etapas_quentes: { lote_preco_ok: 'pensando' }, etapas_pagas: ['lote_preco_ok'], valor_etapa_paga: 200 } },
    { id: ID(4), nome: 'Negócio só da Maia (teste)', plano: 'essencial', status: 'ativo', dono_nome: 'Ana', dono_whatsapp: '5500088880004', meta: {}, gestora: {} },
  ]
  poe('negocios', negs.map(n => ({ contexto: {}, marca: {}, equipe_whatsapp: [], aprovacao_equipe: true, criado_em: new Date().toISOString(), ...n })))
  // a Meta (o que o conector teria baixado): escola parou ontem; brindes gastou sem conversa ontem; clínica normal. E 09/11 também.
  const ml = (conta, camp, ad, n, g, c) => ({ data: dia(n), ad_id: ad, ad_name: 'Anúncio ' + ad, campaign_name: camp, adset_name: 'conj', gasto: g, conversas: c })
  const escolaMeta = [...[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ml(1, 'ESCOLA WHATS', 'e1', n, 170, 4)), ml(1, 'ESCOLA WHATS', 'e1', 1, 0, 0), ml(1, 'ESCOLA WHATS', 'e1', -1, 0, 0)]
  const brindesMeta = [...[2, 3, 4, 5, 6, 7, 8, 9].map(n => ml(2, 'BRINDES - WHATSAPP', 'b1', n, 35, 20)), ml(2, 'BRINDES - WHATSAPP', 'b1', 1, 30, 0), ml(2, 'BRINDES - WHATSAPP', 'b2', 5, 90, 0), ml(2, 'BRINDES - WHATSAPP', 'b1', -1, 26, 0)]
  // clínica: a conversa ficou 4x mais cara nos últimos 3 dias (custo subiu)
  const clinicaMeta = [...[4, 5, 6, 7, 8, 9, 10].map(n => ml(3, 'CLINICA WHATS', 'c1', n, 40, 8)), ...[1, 2, 3].map(n => ml(3, 'CLINICA WHATS', 'c1', n, 40, 2))]
  const mp = path.join(PASTA, 'meta-gestora'); fs.mkdirSync(mp, { recursive: true })
  fs.writeFileSync(path.join(mp, 'escola.json'), JSON.stringify(escolaMeta)); fs.writeFileSync(path.join(mp, 'brindes.json'), JSON.stringify(brindesMeta)); fs.writeFileSync(path.join(mp, 'clinica.json'), JSON.stringify(clinicaMeta))
  // CRMs em pasta (o formato do teunegócio OS)
  const crm = (nome, t) => { const p = path.join(PASTA, nome); fs.mkdirSync(p, { recursive: true }); for (const [k, v] of Object.entries(t)) fs.writeFileSync(path.join(p, k + '.json'), JSON.stringify(v)) }
  const nomesE = ['Thiago Pereira', 'Márcia Lopes', 'Joana Dias', 'Pedro Alves', 'Carla Nunes', 'Bruno Melo']
  crm('crm-escola', {
    etapas: [{ chave: 'aguardando_pagamento', label: 'Aguardando pagamento' }],
    leads: nomesE.map((n, i) => ({ id: LID(1, i), nome: n, whatsapp: '555199900' + i, origem: 'anuncio', anuncio_id: 'e1', etapa: 'aguardando_pagamento', criado_em: iso(24 * 10), atualizado_em: iso(24 * 5) })),
    matriculas: [], lead_andamentos: nomesE.map((n, i) => ({ lead_id: LID(1, i), etapa_nova: 'aguardando_pagamento', criado_em: iso(24 * (3 + i)) })),
    wa_conversas: [], wa_mensagens: [],
    webhook_logs: [1, 2, 3, 4].map(() => ({ origem: 'capi-wa', status: 'erro', recebido_em: iso(20), erro: 'Não há uma conta do WhatsApp Business vinculada a este conjunto de dados' })),
    orcamentos: [{ id: 'o1', lead_id: LID(1, 0) }], orcamento_aberturas: [{ orcamento_id: 'o1', aberto_em: iso(10) }],
  })
  crm('crm-brindes', {
    etapas: [], leads: [{ id: LID(2, 1), nome: 'Rosana Silveira', whatsapp: '5551988880001', origem: 'anuncio', anuncio_id: 'b1', etapa: 'arte_enviada', criado_em: iso(24 * 6), atualizado_em: iso(24 * 4) }],
    matriculas: [], lead_andamentos: [], wa_conversas: [{ id: 'cv1', lead_id: LID(2, 1) }],
    wa_mensagens: [
      { conversa_id: 'cv1', direcao: 'recebida', criado_em: iso(80), texto: 'Quero copos pra empresa' },
      { conversa_id: 'cv1', direcao: 'enviada', criado_em: iso(79.9), texto: 'Quantos copos você precisa?' },
      { conversa_id: 'cv1', direcao: 'recebida', criado_em: iso(79.5), texto: 'Uns 50' },
      { conversa_id: 'cv1', direcao: 'enviada', criado_em: iso(79.4), texto: 'Deixa eu confirmar com o time e já te retorno.' },
    ],
    webhook_logs: [],
  })
  // a clínica usa CRM com chave de leitura que NÃO existe neste servidor: tem que ser pulada, com nota
  log('  (3 negócios inventados + 1 só da Maia, CRMs e Meta em arquivo, em ' + PASTA + ')')

  // 1) prévia: calcula e não grava nada
  const pv = await api({ acao: 'rodar', modo: 'dia', previa: true, relogio: new Date(T0).toISOString() })
  const porNome = n => pv.negocios.find(x => x.nome.startsWith(n)) || {}
  anota(pv.negocios.length === 3, 'só os negócios com a configuração da Gestora entram (3 de 4)')
  anota(!tab('avisos').length && !tab('eventos').some(e => e.tipo === 'aviso_equipe'), 'prévia: nada gravado, ninguém avisado')
  anota((porNome('Escola').tipos || []).join() === 'urgente:parou_de_gastar,urgente:quente_parado,atencao:capi_falhando,atencao:proposta_aberta', 'escola: parou de gastar, 6 quentes parados, envio pra Meta falhando, abriu a proposta → ' + (porNome('Escola').tipos || []).join(' '))
  anota(['gasto_sem_conversa', 'pedido_grande_parado', 'promessa_sem_volta', 'quente_parado'].every(t => (porNome('Brindes').tipos || []).some(x => x.endsWith(':' + t))), 'brindes: gasto sem conversa, pedido grande (50 un.), promessa sem volta, arte parada → ' + (porNome('Brindes').tipos || []).join(' '))
  anota(porNome('Clínica').crm === 'pulado' && (porNome('Clínica').notas || []).some(n => /falta a chave de leitura \(MAIA_CRM_TESTE_URL\/MAIA_CRM_TESTE_LEITURA\)/.test(n)), 'clínica sem a chave do CRM: o CRM é pulado e a nota diz qual chave falta')
  anota(pv.total === pv.negocios.reduce((s, x) => s + x.avisos, 0) && pv.total > 0, `prévia conta ${pv.total} aviso(s) no total`)

  // 2) a rodada das 7h: grava, avisa a equipe UMA vez, e o dono só de quem está em MAIA_GESTORA_DONOS
  const r1 = await api({ acao: 'rodar', modo: 'dia', relogio: new Date(T0).toISOString() })
  const avs = tab('avisos')
  anota(avs.length === r1.total, `grava os avisos em maia_avisos (${avs.length})`)
  anota(avs.every(a => !/Thiago|Márcia|Rosana|Pereira/.test(JSON.stringify(a))), 'maia_avisos não guarda nome de ninguém')
  anota(avs.find(a => a.tipo === 'quente_parado' && a.negocio_id === ID(1))?.lead_ids?.length === 6, 'guarda os ids dos leads (6)')
  const eq = tab('eventos').filter(e => e.tipo === 'aviso_equipe')
  anota(eq.length === 1, 'uma mensagem só pra equipe na rodada das 7h')
  anota(eq.length && !/Thiago|Márcia|Rosana|Pedro|Joana/.test(eq[0].detalhe.texto) && /Escola Inventada: 4/.test(eq[0].detalhe.texto), 'a mensagem da equipe tem os números por negócio e nenhum nome: ' + (eq[0]?.detalhe?.texto || '').slice(0, 140))
  anota(avs.filter(a => a.negocio_id === ID(1)).every(a => a.status === 'revisao_equipe') && avs.filter(a => a.negocio_id === ID(2)).every(a => a.status === 'enviado'), 'quem não está na lista fica com a equipe; quem está vai pro dono ("enviado")')
  const daConv = id => { const c = tab('conversas').find(c => c.negocio_id === id && c.canal === 'dono'); return c ? tab('msgs').filter(m => m.conversa_id === c.id).map(m => m.texto).join('\n') : '' }
  const mB = daConv(ID(2)), mC = daConv(ID(3)), mE = daConv(ID(1))
  anota(/Rosana S\./.test(mB) && !/Silveira/.test(mB), 'o dono dos brindes recebe o primeiro nome + inicial (Rosana S.)')
  anota(!/Escola Inventada|Clínica Inventada/.test(mB) && !/Brindes Inventados|Escola Inventada/.test(mC), 'o aviso de um cliente não cita outro cliente')
  anota(mC && /área da saúde/.test(mC) && !/Quem:/.test(mC), 'a clínica (saúde) recebe sem nome nenhum')
  anota(!mE, 'a escola (fora da lista) não recebe nada direto')
  anota(tab('crm_dia').some(x => x.negocio_id === ID(1) && x.quentes_parados === 6), 'a foto do dia vai pra maia_crm_dia')

  // 3) de novo na mesma hora (o cron ou o botão): não repete a mensagem nem os avisos
  const r2 = await api({ acao: 'rodar', modo: 'urgentes', relogio: new Date(T0 + 4 * 3600e3).toISOString() })
  anota(tab('avisos').length === avs.length && r2.negocios.every(x => !x.novos) && tab('eventos').filter(e => e.tipo === 'aviso_equipe').length === 1, '11h do mesmo dia: os urgentes já avisados não repetem e a equipe não é chamada de novo')

  // 4) dia seguinte (segunda 09/11), 11h: só as urgentes da Meta, só o que é novo
  const r3 = await api({ acao: 'rodar', modo: 'urgentes', relogio: '2026-11-09T11:00:00-03:00' })
  const novos09 = tab('avisos').filter(a => a.dia === '2026-11-09')
  anota(novos09.length && novos09.every(a => ['gasto_sem_conversa', 'parou_de_gastar'].includes(a.tipo) && a.nivel === 'urgente'), '2 em 2 horas: só "gasto sem conversa" e "parou de gastar" → ' + novos09.map(a => a.tipo).join(' '))
  const eq2 = tab('eventos').filter(e => e.tipo === 'aviso_equipe')
  anota(eq2.length === 2 && /urgente/.test(eq2[1].detalhe.titulo), 'urgente novo: a equipe é avisada na hora')

  // 5) segunda 7h: resumo da semana + funil por anúncio
  const r4 = await api({ acao: 'rodar', modo: 'semana', relogio: '2026-11-09T07:10:00-03:00' })
  const fs9 = tab('funil_semana')
  anota(fs9.some(x => x.negocio_id === ID(2) && x.semana === '2026-11-09' && x.ad_id === 'b1' && Number(x.gasto) > 0), 'maia_funil_semana gravado por anúncio (semana = a segunda)')
  anota(/resumo da semana/.test(daConv(ID(2))) && /Funil por anúncio/.test(daConv(ID(2))), 'o dono da lista recebe o resumo da semana com o funil')

  // 6) a aba Avisos: lista, resolvido, ignorar, ajudou?, ver quem
  const g = await api(null, { acao: 'avisos', dias: '14' })
  anota(g.negocios.length === 3 && g.negocios.every(n => n.avisos.length), 'aba Avisos: os avisos por negócio')
  const a1 = g.negocios.find(n => n.id === ID(1)).avisos.find(a => a.tipo === 'quente_parado')
  await api({ acao: 'marcar', id: a1.id, status: 'resolvido' }); await api({ acao: 'util', id: a1.id, util: true })
  const a2 = g.negocios.find(n => n.id === ID(1)).avisos.find(a => a.tipo === 'capi_falhando')
  await api({ acao: 'marcar', id: a2.id, status: 'ignorado' }); await api({ acao: 'util', id: a2.id, util: false })
  const t1 = tab('avisos').find(a => a.id === a1.id), t2 = tab('avisos').find(a => a.id === a2.id)
  anota(t1.status === 'resolvido' && t1.resolvido_em && t1.util === true && t2.status === 'ignorado' && t2.util === false, '"resolvido", "ignorar" e "ajudou?" gravam')
  const g2 = await api(null, { acao: 'avisos' })
  anota(g2.placar.marcados === 2 && g2.placar.ajudou === 1, 'o placar do "ajudou?" (1 de 2)')
  const quem = await api(null, { acao: 'pessoas', id: a1.id })
  anota(quem.nomes.length === 6 && quem.nomes.includes('Thiago P.') && !quem.nomes.some(n => /Pereira/.test(n)), '"ver quem": busca no CRM na hora, primeiro nome + inicial')
  const avC = g.negocios.find(n => n.id === ID(3)).avisos[0]
  const quemC = await api(null, { acao: 'pessoas', id: avC.id })
  anota(quemC.saude && !quemC.nomes.length, '"ver quem" na saúde: nunca')
  let neg = null; try { await api({ acao: 'marcar', id: a1.id, status: 'apagado' }) } catch (e) { neg = e.message }
  anota(neg && /inválido/.test(neg), 'status que não existe é recusado')
  let sem = null; try { const r = await fetch(URL_ + '/api/maia/gestora?acao=avisos'); sem = r.status } catch { }
  anota(sem === 401, 'sem a senha do painel: 401')
  const pag = await fetch(URL_ + '/maia/operacao/avisos.html').then(r => r.text())
  anota(/Avisos da Maia|Maia · Avisos/.test(pag) && /Resolvido/.test(pag) && /Ignorar/.test(pag) && /Ajudou\?/.test(pag), 'a página da aba Avisos abre')
}

if (URL_) {
  try { await parte2() } catch (e) { anota(false, 'parte 2 parou: ' + e.message) }
}
const ok = rel.filter(r => r.ok).length
log(`\n${ok}/${rel.length} conferências certas`)
process.exit(ok === rel.length ? 0 : 1)
