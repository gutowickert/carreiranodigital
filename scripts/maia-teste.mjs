// Maia: o teste de ponta a ponta (03/11). Roda contra o sistema em MODO LOCAL (MAIA_LOCAL=1), sem banco e sem WhatsApp de verdade.
// Uso: node scripts/maia-teste.mjs [url] [senha]    (padrão http://localhost:3100 teste123)
// Três negócios de nichos diferentes. Pra cada um: cadastro → o dono conversa e manda fotos → anúncios gerados →
// oficina (simulada aqui com a própria foto, quando a oficina de verdade não estiver rodando) → equipe aprova → dono dá 👍 →
// campanha pausada (Meta simulada) → equipe liga → clientes conversam (ganho, perda, "vou pensar") → dono conta venda → rotina → números.
import fs from 'node:fs'
import path from 'node:path'

const URL_ = process.argv[2] || 'http://localhost:3100'
const SENHA = process.argv[3] || 'teste123'
const OFICINA = process.env.MAIA_OFICINA_CHAVE || 'oficina123'
const FOTOS = process.env.FOTOS || 'C:/maia-v1/.maia-fotos-teste'
const log = (...a) => console.log(...a)
const relatorio = []
const anota = (ok, o) => { relatorio.push({ ok, o }); log((ok ? '  ✔ ' : '  ✘ ') + o) }

async function op(acao, corpo = {}) {
  const r = await fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'teste', ...corpo }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status))
  return j
}
async function ver(acao, q = {}) {
  const r = await fetch(URL_ + '/api/maia/operacao?' + new URLSearchParams({ acao, ...q }), { headers: { 'x-senha': SENHA } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status))
  return j
}
// a oficina "de mentira": devolve a própria foto do dono como arte (o teste da oficina de verdade é separado)
async function oficinaFalsa() {
  let n = 0
  for (;;) {
    const r = await fetch(URL_ + '/api/maia/oficina', { headers: { 'x-chave': OFICINA } }).then(r => r.json())
    if (!r.tarefa) break
    const b = await fetch(URL_ + r.midia.url).then(r => r.arrayBuffer())
    await fetch(URL_ + '/api/maia/oficina', { method: 'POST', headers: { 'x-chave': OFICINA, 'content-type': 'application/json' }, body: JSON.stringify({ tarefa_id: r.tarefa.id, arquivo_b64: Buffer.from(b).toString('base64'), mime: r.midia.mime || 'image/jpeg' }) })
    n++
  }
  return n
}
const foto = (nome) => ({ arquivo_b64: fs.readFileSync(path.join(FOTOS, nome)).toString('base64'), mime: 'image/jpeg' })
const fala = (r) => (r?.respondeu?.mensagens || []).join(' / ')
const ferr = (r) => (r?.respondeu?.ferramentas || []).join(', ') || '-'

const NEGOCIOS = [
  {
    cad: { nome: 'Ótica Tempo de Visão (teste)', nicho: 'ótica', cidade: 'Gravataí', dono_nome: 'Kate', dono_whatsapp: '5500077770001', plano: 'completa', verba_dia: 30, meta: { ad_account_id: '111', page_id: '222' } },
    dono: ['Oi Maia! Tudo bem? Aqui é a Kate, da ótica.', 'A gente faz exame de vista grátis na compra do óculos, e parcela em até 24x no crediário. O público é mais família e gente de 40+ com vista cansada.'],
    fotos: ['otica1.jpg', 'otica2.jpg', 'otica3.jpg'],
    clientes: [
      { tel: '5500011110001', nome: 'Paulo', msgs: ['Oi, vi o anúncio. Vocês parcelam óculos?', 'Show, quero fazer o exame sábado de manhã. Fechado, vou comprar o óculos multifocal de 890.'], esperado: 'interessado|proposta|ganho' },
      { tel: '5500011110002', nome: 'Marta', msgs: ['Quanto custa uma lente?', 'Ah, tá caro pra mim, vou comprar na internet mesmo. Obrigada, não quero.'], esperado: 'perdido' },
      { tel: '5500011110003', nome: 'Rui', msgs: ['Tem armação infantil?', 'Vou ver com a minha esposa e te aviso semana que vem.'], esperado: 'aberto' },
    ],
    resposta_dono: 'Respondendo as perguntas: lente simples sai a partir de R$ 190. Armação infantil tem sim, a partir de R$ 199. Sábado a gente abre das 9h ao meio-dia.',
    venda_dono: 'Maia, fechei hoje com a Joana, um óculos de 650, ela veio pelo anúncio.',
  },
  {
    cad: { nome: 'Mundo do Papelão (teste)', nicho: 'embalagens', cidade: 'Porto Alegre', dono_nome: 'Lúcia', dono_whatsapp: '5500077770002', plano: 'essencial', verba_dia: 25, meta: { ad_account_id: '333', page_id: '444' } },
    dono: ['Oi Maia, sou a Lúcia do Mundo do Papelão. Vendemos caixas de papelão, plástico bolha e fita pra quem vende pela internet. Pedido mínimo de 50 caixas, entrega em Porto Alegre e região.'],
    fotos: ['papelao1.jpg', 'papelao2.jpg'],
    clientes: [
      { tel: '5500022220001', nome: 'Diego', msgs: ['Vocês tem caixa pra mandar tênis?', 'Quero 100 caixas, pode fechar, quanto fica? Pode mandar o pix.'], esperado: 'qualquer' },
    ],
    venda_dono: 'Vendi 200 caixas pro Diego, deu 480 reais.',
  },
  {
    cad: { nome: 'Wood Brindes (teste)', nicho: 'brindes personalizados', cidade: 'Lajeado', dono_nome: 'Rafa', dono_whatsapp: '5500077770003', plano: 'completa', verba_dia: 20, meta: { ad_account_id: '555', page_id: '666' } },
    dono: ['Oi Maia! Aqui é o Rafa da Wood. A gente faz copo térmico personalizado com foto ou com logo. Pra presente de aniversário, casal, e brinde de empresa. Unidade R$ 89, e pra empresa a partir de 20 unidades sai R$ 45 cada. Entrega em Lajeado e região.'],
    fotos: ['wood1.jpg', 'wood2.jpg'],
    clientes: [
      { tel: '5500033330001', nome: 'Carla', msgs: ['Oi! Quero um copo com a foto dos meus filhos pro dia dos pais. Quanto fica?', 'Perfeito, quero 1. Já te mando o pix e a foto agora.'], esperado: 'proposta|ganho' },
    ],
    venda_dono: 'Maia, vendi 30 copos pra empresa do Marcos, R$ 1.350. E a Fernanda desistiu, achou caro.',
  },
]

async function main() {
  log('Maia · teste de ponta a ponta em ' + URL_)
  const res = await ver('resumo')
  if (res.modo !== 'local') throw new Error('o sistema NÃO está em modo local: teste cancelado pra não mexer no banco')
  anota(true, `modo local, Meta ${res.meta_real ? 'REAL (!)' : 'simulada'}`)
  if (res.meta_real) throw new Error('Meta real ligada: teste cancelado')

  for (const N of NEGOCIOS) {
    log('\n=== ' + N.cad.nome)
    const neg = await op('criar_negocio', N.cad)
    anota(!!neg.id, 'negócio criado')
    for (const t of N.dono) { const r = await op('simular_dono', { negocio_id: neg.id, texto: t }); log('    dono: ' + t + '\n    maia: ' + fala(r) + '  [' + ferr(r) + ']') }
    for (const f of N.fotos) await op('simular_dono', { negocio_id: neg.id, ...foto(f), legenda: '' })
    let r = await op('simular_dono', { negocio_id: neg.id, texto: 'Mandei as fotos. Pode criar os anúncios?' })
    log('    dono: Mandei as fotos. Pode criar os anúncios?\n    maia: ' + fala(r) + '  [' + ferr(r) + ']')
    const usouCriar = (r?.respondeu?.ferramentas || []).includes('criar_anuncios')
    if (!usouCriar) { await op('gerar_anuncios', { negocio_id: neg.id, quantidade: 2 }) }
    anota(true, `anúncios pedidos ${usouCriar ? 'pela Maia (ferramenta)' : 'pelo painel (a Maia não chamou a ferramenta)'}`)
    const feitas = await oficinaFalsa()
    let pecas = await ver('pecas', { negocio: neg.id })
    const naRevisao = pecas.filter(p => p.status === 'revisao_equipe')
    anota(naRevisao.length > 0 && feitas > 0, `${naRevisao.length} peça(s) na revisão da equipe (oficina entregou ${feitas})`)
    for (const p of naRevisao) log(`    · ${p.tipo} · "${p.gancho}" · ${p.texto.replace(/\n/g, ' ')} · [${p.cta}]`)
    // a equipe pede ajuste na primeira e aprova as outras
    if (naRevisao[0]) {
      await op('ajustar_peca', { peca_id: naRevisao[0].id, nota: 'deixa o gancho mais curto e fala do parcelamento ou do preço' })
      await oficinaFalsa()
      const p2 = (await ver('pecas', { negocio: neg.id })).find(p => p.id === naRevisao[0].id)
      anota(p2.versao === 2 && p2.status === 'revisao_equipe', `ajuste da equipe refez a peça (versão ${p2.versao}): "${p2.gancho}"`)
    }
    for (const p of (await ver('pecas', { negocio: neg.id })).filter(p => p.status === 'revisao_equipe')) await op('aprovar_peca', { peca_id: p.id })
    await op('pedir_joinha', { negocio_id: neg.id })
    pecas = await ver('pecas', { negocio: neg.id })
    anota(pecas.filter(p => p.status === 'com_dono').length > 0, `${pecas.filter(p => p.status === 'com_dono').length} peça(s) com o dono esperando o 👍`)
    // campanha antes do 👍 tem que falhar
    let falhou = false; try { await op('criar_campanha', { negocio_id: neg.id }) } catch { falhou = true }
    anota(falhou, 'sem o 👍 do dono, a campanha NÃO é criada')
    r = await op('simular_dono', { negocio_id: neg.id, texto: '👍' })
    log('    dono: 👍\n    maia: ' + fala(r) + '  [' + ferr(r) + ']')
    pecas = await ver('pecas', { negocio: neg.id })
    anota(pecas.filter(p => p.status === 'aprovada').length > 0, `${pecas.filter(p => p.status === 'aprovada').length} peça(s) aprovada(s) pelo dono`)
    const camp = await op('criar_campanha', { negocio_id: neg.id, raio_km: 20 })
    anota(camp.status === 'criada_pausada' && camp.simulada, `campanha criada PAUSADA (simulada): ${camp.nome}, R$ ${camp.verba_dia}/dia, ${camp.meta_ad_ids.length} anúncio(s)`)
    const at = await op('ativar_campanha', { campanha_id: camp.id })
    anota(at.status === 'ativa', 'equipe ligou a campanha')
    // clientes do negócio (canal simulado: o WhatsApp do negócio só abre com o Tech Provider)
    for (const c of N.clientes) {
      let ult
      for (const t of c.msgs) { ult = await op('simular_cliente', { negocio_id: neg.id, telefone: c.tel, nome: c.nome, texto: t, anuncio: camp.meta_ad_ids[0] }); log(`    ${c.nome}: ${t}\n    maia: ${fala(ult)}  [${ferr(ult)}]`) }
      const lead = (await ver('leads', { negocio: neg.id })).find(l => l.telefone === c.tel)
      const okEt = c.esperado === 'qualquer' || (c.esperado === 'aberto' ? !['ganho', 'perdido'].includes(lead.etapa) && !!lead.proximo_followup_em : c.esperado.split('|').includes(lead.etapa))
      anota(okEt, `cliente ${c.nome}: etapa ${lead.etapa}${lead.valor ? ' R$ ' + lead.valor : ''}${lead.motivo_perda ? ' (' + lead.motivo_perda + ')' : ''}${lead.proximo_followup_em ? ' · retomada ' + lead.proximo_followup_em.slice(0, 10) : ''} (esperado: ${c.esperado})`)
    }
    if (N.resposta_dono) {
      r = await op('simular_dono', { negocio_id: neg.id, texto: N.resposta_dono })
      log('    dono: ' + N.resposta_dono + '\n    maia: ' + fala(r) + '  [' + ferr(r) + ']')
      anota((r?.respondeu?.ferramentas || []).includes('responder_cliente'), 'a Maia repassou as respostas do dono pros clientes')
    }
    r = await op('simular_dono', { negocio_id: neg.id, texto: N.venda_dono })
    log('    dono: ' + N.venda_dono + '\n    maia: ' + fala(r) + '  [' + ferr(r) + ']')
    anota((r?.respondeu?.ferramentas || []).includes('registrar_venda'), 'a Maia registrou a venda que o dono contou')
    r = await op('simular_dono', { negocio_id: neg.id, texto: 'Como foi a semana? Quanto eu vendi?' })
    log('    dono: Como foi a semana? Quanto eu vendi?\n    maia: ' + fala(r) + '  [' + ferr(r) + ']')
    anota((r?.respondeu?.ferramentas || []).includes('numeros'), 'a Maia buscou os números no sistema pra responder')
    const n = await ver('numeros', { negocio: neg.id })
    log(`    números: ${n.leads_novos} contatos, ${n.ganhos} vendas, R$ ${n.receita}, conversão ${n.conversao}%, perdas ${JSON.stringify(n.motivos_perda)}`)
  }
  // follow-up: as retomadas vencem e a rotina avisa o dono (o canal do negócio ainda não existe)
  const venc = await op('teste_vencer_retomadas')
  // rotina: retomadas, confirmação de venda com o dono e resumo da semana (vai pra equipe, não direto pro dono)
  // 07/11: retomadas e perguntas pro dono só saem das 9h às 20h; o teste roda a rotina "às 14h de hoje" (relogio só vale no modo local)
  const rot = await op('rodar_rotina', { forcar_relatorio: true, relogio: new Date().toISOString().slice(0, 10) + 'T17:00:00.000Z' })
  anota((rot.relatorios || []).length === NEGOCIOS.length, `rotina: ${(rot.relatorios || []).length} resumo(s) da semana gerado(s)`)
  anota((rot.retomadas || []).length > 0 || venc.vencidas === 0, `rotina: ${(rot.retomadas || []).length} retomada(s) feitas de ${venc.vencidas} vencida(s)`)
  anota(Array.isArray(rot.confirmacoes), `rotina: perguntou ao dono sobre ${(rot.confirmacoes || []).reduce((s, x) => s + x.perguntou, 0)} contato(s) com orçamento ou horário`)
  // a Kate responde a pergunta de confirmação
  const otica = (await ver('negocios')).find(n => /Ótica/.test(n.nome))
  if (otica && (rot.confirmacoes || []).some(x => x.negocio === otica.id)) {
    const cvs = await ver('conversas', { negocio: otica.id }); const cvd = cvs.find(c => c.canal === 'dono')
    const ms = await ver('msgs', { conversa: cvd.id }); log('    maia pro dono: ' + ms.filter(m => m.autor === 'maia').slice(-2).map(m => m.texto).join(' / '))
    const rr = await op('simular_dono', { negocio_id: otica.id, texto: 'O Paulo fechou sim, levou o multifocal de 890!' })
    log('    dono: O Paulo fechou sim, levou o multifocal de 890!\n    maia: ' + fala(rr) + '  [' + ferr(rr) + ']')
    const paulo = (await ver('leads', { negocio: otica.id })).find(l => l.nome === 'Paulo')
    anota(paulo?.etapa === 'ganho' && Number(paulo.valor) === 890, `confirmação do dono virou venda: Paulo ${paulo?.etapa} R$ ${paulo?.valor}`)
  }
  for (const n of await ver('negocios')) { const cvd = (await ver('conversas', { negocio: n.id })).find(c => c.canal === 'dono'); const ms = await ver('msgs', { conversa: cvd.id }); const lemb = ms.filter(m => m.autor === 'maia' && /chamar de novo/.test(m.texto)); if (lemb.length) log('    lembrete de retomada pro dono (' + n.nome + '): ' + lemb.slice(-1)[0].texto) }
  const fila = await ver('fila')
  const rel = fila.filter(p => p.tipo === 'relatorio')
  anota(rel.length === NEGOCIOS.length && rel.every(p => p.status === 'revisao_equipe'), 'os resumos foram pra revisão da equipe antes do dono')
  if (rel[0]) log('    exemplo de resumo:\n    ' + rel[0].texto.replace(/\n/g, '\n    '))
  const resumo = await ver('resumo')
  log('\nRESUMO DO PAINEL: ' + JSON.stringify(resumo))
  const falhas = relatorio.filter(x => !x.ok)
  log(`\n${relatorio.length - falhas.length} de ${relatorio.length} conferências passaram.`)
  if (falhas.length) log('Falharam:\n' + falhas.map(f => ' - ' + f.o).join('\n'))
}
main().catch(e => { console.error('\nERRO: ' + e.message); process.exit(1) })
