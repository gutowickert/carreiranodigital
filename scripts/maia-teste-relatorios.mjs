// Maia: o teste da ANÁLISE DE 2 EM 2 DIAS e do RELATÓRIO DO MÊS (13/11, lib/maia/relatorios.ts e relatorios-conta.ts).
// Duas partes:
//  1) as contas e as regras (relatorios-conta.ts), direto no node, sem servidor: segue / segura / mudar, o teto de verba,
//     a métrica secundária (com e sem implantação), o tom do mês, a projeção e a trava dos números da IA.
//  2) com uma URL: de ponta a ponta contra o sistema em MODO LOCAL, com 2 negócios INVENTADOS em arquivo (nada sai do PC:
//     sem banco, sem Meta, sem WhatsApp de verdade: todo telefone começa com 55000). Sem IA (as conclusões montadas).
// Uso:
//   node --no-warnings scripts/maia-teste-relatorios.mjs                                                 (só a parte 1)
//   node --no-warnings scripts/maia-teste-relatorios.mjs http://localhost:3215 teste123 .teste-relatorios   (as duas)
// O servidor da parte 2 sobe assim (pasta limpa):
//   rm -rf .teste-relatorios
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-relatorios MAIA_PAINEL_SENHA=teste123 MAIA_SEM_AVISO=1 MAIA_CONECTAR_SEGREDO=seg123 \
//   MAIA_GESTORA_META_PASTA=.teste-relatorios/meta npx next dev --webpack -p 3215
// No fim grava o exemplo da página do relatório em <pasta>/exemplo-relatorio-do-mes.html e o da imagem da análise em
// <pasta>/exemplo-analise-2-dias.png (e .jpg, o que a oficina entregou de verdade).
// 13/11: a imagem da análise sai pela OFICINA de verdade (maia-oficina/oficina.js --uma-vez, com o Chrome do PC): o servidor
// precisa de MAIA_OFICINA_CHAVE=oficina123 (ou OFICINA_CHAVE=<a mesma>) e a pasta maia-oficina com npm ci.
// Fotos e logo: as da Wood (as mesmas do teste da criação), se existirem neste PC.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as C from '../lib/maia/relatorios-conta.ts'

const [URL_ = '', SENHA = 'teste123', PASTA = '.teste-relatorios'] = process.argv.slice(2)
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra) } }
const D = 86400e3
const agora = Date.now()
const dias = k => new Date(agora - k * D).toISOString()

// ═══════════ PARTE 1: as contas, sem servidor
console.log('1) As regras da análise (sem servidor)')
const sec = { nome: 'pediu orçamento', etapa: 'proposta', padrao: false }
const ad = (id, x) => ({ id, nome: id, campanha_id: 'c_' + id, verba_dia: 20, campanha_ativa: true, inicio: dias(10), gasto: 100, conversas: 10, contatos: 6, secundaria: 2, vendas: 0, receita: 0, ...x })
let d = C.decide({ anuncios: [ad('a', { vendas: 2, secundaria: 3 }), ad('b', { vendas: 1 })], vendas_historico: 3, ciclo: 7, teto: 60, agora, secundaria: sec })
confere('todos vendendo: estimula o melhor (sobe 30%, 20 → 26)', d.conclusao === 'mudar' && d.sugestoes.length === 1 && d.sugestoes[0].tipo === 'estimular' && d.sugestoes[0].verba_para === 26, JSON.stringify(d.sugestoes))
d = C.decide({ anuncios: [ad('a', { vendas: 2, verba_dia: 30 }), ad('b', { vendas: 1, verba_dia: 30 })], vendas_historico: 3, ciclo: 7, teto: 60, agora, secundaria: sec })
confere('no teto (30 + 30 = R$ 60): não sugere subir verba, segue como está', d.conclusao === 'segue' && !d.sugestoes.length, JSON.stringify(d))
d = C.decide({ anuncios: [ad('novo', { inicio: dias(2), contatos: 2, secundaria: 0 })], vendas_historico: 0, ciclo: 7, teto: 60, agora, secundaria: sec })
confere('anúncio de 2 dias sem venda: segura (dentro do ciclo de 7 dias, faltam 5)', d.conclusao === 'segura' && /ainda está dentro do tempo normal de venda \(7 dias; faltam 5 dias\)/.test(d.texto), d.texto)
d = C.decide({ anuncios: [ad('velho', { inicio: dias(9), contatos: 4, secundaria: 1 })], vendas_historico: 0, ciclo: 7, teto: 60, agora, secundaria: sec })
confere('passou do ciclo (9 dias > 7) sem venda: sugere pausar', d.conclusao === 'mudar' && d.sugestoes[0]?.tipo === 'pausar' && /passou do tempo normal de venda \(7 dias\)/.test(d.sugestoes[0].motivo), JSON.stringify(d.sugestoes))
d = C.decide({ anuncios: [ad('ruim', { inicio: dias(3), contatos: 6, secundaria: 0 }), ad('bom', { inicio: dias(3), contatos: 6, secundaria: 3 })], vendas_historico: 0, ciclo: 7, teto: 60, agora, secundaria: sec })
confere('sem venda E secundária ruim (0 de 6), mesmo dentro do ciclo: pausar; e estimula o que leva gente pro orçamento', d.sugestoes.some(s => s.tipo === 'pausar' && s.anuncio === 'ruim') && d.sugestoes.some(s => s.tipo === 'estimular' && s.anuncio === 'bom'), JSON.stringify(d.sugestoes))
const est = d.sugestoes.find(s => s.tipo === 'estimular')
confere('verba nova dentro do teto: 20 → 26 (30%; a soma das campanhas no ar fica ≤ R$ 60)', est?.verba_de === 20 && est?.verba_para === 26)
confere('a conclusão pergunta se o dono topa testar', /Topa testar assim\?/.test(d.texto))
d = C.decide({ anuncios: [ad('ruim', { inicio: dias(3), contatos: 6, secundaria: 0 }), ad('bom', { inicio: dias(3), contatos: 6, secundaria: 3 })], vendas_historico: 12, ciclo: 7, teto: 60, agora, secundaria: sec })
confere('com 10+ vendas julga por VENDA: secundária ruim sozinha não pausa nem estimula', d.julga_por === 'vendas' && !d.sugestoes.some(s => s.tipo === 'estimular') && d.conclusao === 'segura', JSON.stringify(d))
// 13/11 (prova da Wood): ROI, dobrar, anúncio sem entrega e teste semanal
d = C.decide({ anuncios: [ad('caro', { vendas: 3, receita: 300, gasto: 120 }), ad('bom', { vendas: 2, receita: 200, gasto: 30 })], vendas_historico: 5, ciclo: 7, teto: 60, agora, secundaria: sec, cpa_meta: 20 })
confere('já vendeu mas cada venda custou R$ 40 (meta R$ 20): sugere pausar pelo ROI; o barato fica', d.sugestoes.some(s => s.tipo === 'pausar' && s.anuncio === 'caro' && s.motivo.includes('meta é até R$ 20')) && !d.sugestoes.some(s => s.tipo === 'pausar' && s.anuncio === 'bom'), JSON.stringify(d.sugestoes))
d = C.decide({ anuncios: [ad('caro', { vendas: 3, receita: 300, gasto: 120 })], vendas_historico: 5, ciclo: 7, teto: 60, agora, secundaria: sec })
confere('sem meta de CPA na implantação: quem vende não é pausado pelo ROI', !d.sugestoes.some(s => s.tipo === 'pausar'), JSON.stringify(d.sugestoes))
d = C.decide({ anuncios: [ad('ouro', { vendas: 10, receita: 2000, gasto: 80, verba_dia: 10 })], vendas_historico: 10, ciclo: 7, teto: 60, agora, secundaria: sec })
confere('custo de tráfego até 5% do que vendeu (80 de 2.000 = 4%): sugere DOBRAR (10 → 20)', d.sugestoes[0]?.tipo === 'estimular' && d.sugestoes[0].verba_para === 20 && /^dobrar/.test(d.sugestoes[0].texto), JSON.stringify(d.sugestoes))
d = C.decide({ anuncios: [ad('mudo', { contatos: 0, conversas: 0, secundaria: 0, gasto: 3 })], vendas_historico: 5, ciclo: 7, teto: 60, agora, secundaria: sec, cpa_meta: 20 })
confere('anúncio que a Meta quase não entrega (R$ 3, 0 contato): fica ligado', !d.sugestoes.some(s => s.tipo === 'pausar'), JSON.stringify(d.sugestoes))
d = C.decide({ anuncios: [ad('mudo', { contatos: 1, conversas: 1, secundaria: 0, gasto: 25 })], vendas_historico: 5, ciclo: 7, teto: 60, agora, secundaria: sec, cpa_meta: 20 })
confere('passou do ciclo e já gastou um CPA (R$ 25 ≥ R$ 20) sem vender: sugere pausar', d.sugestoes.some(s => s.tipo === 'pausar' && s.anuncio === 'mudo'), JSON.stringify(d.sugestoes))
d = C.decide({ anuncios: [ad('a', { vendas: 2, verba_dia: 30 }), ad('b', { vendas: 1, verba_dia: 30 })], vendas_historico: 3, ciclo: 7, teto: 60, agora, secundaria: sec, teste_semana: true, produto: 'copo térmico' })
confere('oferta vendendo e passou uma semana: sugere testar um anúncio de outro produto', d.conclusao === 'mudar' && d.sugestoes.some(s => s.tipo === 'testar' && s.texto.includes('outro produto (o que vende hoje: copo térmico)')), JSON.stringify(d.sugestoes))
d = C.decide({ anuncios: [ad('a', { vendas: 2, verba_dia: 30 }), ad('b', { vendas: 1, verba_dia: 30 })], vendas_historico: 3, ciclo: 7, teto: 60, agora, secundaria: sec, teste_semana: false })
confere('teste de produto novo só 1 vez por semana', !d.sugestoes.some(s => s.tipo === 'testar'))
confere('sem métrica secundária na implantação: vale a etapa padrão (proposta), marcada como padrão', JSON.stringify(C.secundariaDo({ contexto: {} })) === JSON.stringify({ nome: 'receberam proposta ou orçamento', etapa: 'proposta', padrao: true }))
confere('"agendou visita" vira a etapa interessado; texto que não dá pra medir fica sem etapa', C.secundariaDo({ contexto: { trafego: { metricas_secundarias: ['agendou visita'] } } }).etapa === 'interessado' && C.secundariaDo({ contexto: { trafego: { metricas_secundarias: [{ nome: 'abriu a porta' }] } } }).etapa === null)
confere('ciclo de venda: o da implantação, senão 7 dias (padrão)', C.cicloDo({ contexto: { trafego: { ciclo_venda_dias: 15 } } }).dias === 15 && C.cicloDo({}).padrao === true)
const evs = [{ para: 'conversando', criado_em: dias(5) }, { para: 'proposta', criado_em: dias(3) }, { para: 'ganho', criado_em: dias(1) }]
confere('chegou na secundária na 1ª vez que passou de "proposta" pra frente', C.chegouEm({ etapa: 'ganho' }, evs, 'proposta') === dias(3) && C.chegouEm({ etapa: 'conversando' }, evs.slice(0, 1), 'proposta') === null)
const ta = C.textoAnalise({ negocio: 'X', dono: 'Ana', de: '2026-11-11T10:00:00Z', ate: '2026-11-13T10:00:00Z', gasto: 100, conversas: 8, contatos: 5, secundaria: null, sec: { nome: 'abriu a porta', etapa: null, padrao: false }, vendas: 0, receita: 0, decisao: { texto: 'Segue como está.' }, ciclo: { dias: 7 } })
confere('a análise sem secundária medível diz isso e segue com conversas e vendas', /ainda não dá pra medir no funil/.test(ta) && /R\$ 12,50 por conversa/.test(ta), ta)
confere('dia do relatório: 2/12/2026 é quarta; quem abre de qui a sáb recebe dia 3; sem saber os dias, dia 2', C.diaDoRelatorioCom([4, 5, 6], 2026, 12) === 3 && C.diaDoRelatorioCom(null, 2026, 12) === 2 && C.diaDoRelatorioCom([3], 2026, 12) === 2)
confere('a trava da IA: número inventado derruba o texto; número dos dados passa', C.iaSoComNumerosDados('Foram 47 conversas e R$ 600', { a: 47, b: 600 }) && !C.iaSoComNumerosDados('Foram 52 conversas', { a: 47 }))

// ═══════════ PARTE 2: de ponta a ponta no modo local
if (!URL_) { console.log(`\n${ok} ok, ${falha} falha(s)`); process.exit(falha ? 1 : 0) }
const RUN = String(Date.now()).slice(-5)
async function api(acao, corpo = {}) {
  const r = await fetch(`${URL_}/api/maia/operacao`, { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'teste', ...corpo }) })
  const j = await r.json().catch(() => ({}))
  return { ...j, http: r.status }
}
const arq = tab => path.join(PASTA, tab + '.json')
const le = tab => { try { return JSON.parse(fs.readFileSync(arq(tab), 'utf8')) } catch { return [] } }
const grava = (tab, l) => { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(arq(tab), JSON.stringify(l, null, 1)) }
const poe = (tab, linhas) => { const l = le(tab); for (const x of linhas) l.push(x); grava(tab, l) }
const mexe = (tab, id, campos) => { const l = le(tab); const x = l.find(y => y.id === id); Object.assign(x, campos); grava(tab, l) }
const id = () => crypto.randomUUID()
let nEv = 100000
const CHAVE = process.env.OFICINA_CHAVE || 'oficina123'
const oficina = () => spawnSync(process.execPath, ['maia-oficina/oficina.js', '--uma-vez'], { env: { ...process.env, MAIA_URL: URL_, MAIA_OFICINA_CHAVE: CHAVE }, encoding: 'utf8', timeout: 180000 })
// as fotos reais da Wood (o carrossel que a oficina fez no teste da criação, com as fotos dela) e a logo
const WOOD = 'C:/Users/carre/Desktop/Wood - Segatto', CARR = 'C:/Users/carre/Desktop/Maia-teste-locucao-carrossel-13-11'
const FOTO = n => { const a = path.join(CARR, `carrossel-0${n}.jpg`); return fs.existsSync(a) ? a : null }
const LOGO = fs.existsSync(WOOD + '/marca/logo-wood.jpg') ? WOOD + '/marca/logo-wood.jpg' : null
const MARCA_WOOD = { cores: { primaria: '#3d4f54', secundaria: '#c9a96e' } }
// põe um arquivo no armazenamento do modo local (<pasta>/arquivos/<caminho>) e devolve o caminho
const guarda = (caminho, origem) => { if (!origem) return null; const d = path.join(PASTA, 'arquivos', caminho); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(origem, d); return caminho }
const ev = (negocio_id, tipo, detalhe, criado_em) => ({ id: ++nEv + Number(RUN), tipo, negocio_id, detalhe, criado_em })

const res = await fetch(`${URL_}/api/maia/operacao?acao=resumo`, { headers: { 'x-senha': SENHA } }).then(r => r.json()).catch(() => ({}))
if (res.modo !== 'local') { console.log('o sistema NÃO está em modo local: teste cancelado'); process.exit(1) }

// ─── negócio A: a análise de 2 em 2 dias
console.log('\n2) A análise dos anúncios (negócio A)')
const NOME_A = 'Wood Arte a Laser', NOME_M = 'Wood Arte a Laser (mês)'
const A = await api('criar_negocio', { nome: NOME_A, nicho: 'copos e garrafas personalizados', cidade: 'Estrela', dono_nome: 'Ana Teste', dono_whatsapp: '550007771' + RUN, verba_dia: 50 })
mexe('negocios', A.id, { status: 'ativo', marca: { ...MARCA_WOOD, logo_path: guarda(`${A.id}/marca/logo.jpg`, LOGO) }, meta: { ad_account_id: 'act_rel_a' + RUN }, contexto: { trafego: { metricas_secundarias: ['pediu orçamento'], ciclo_venda_dias: 5 } } })
const peca = (neg, gancho, extra = {}) => ({ id: id(), negocio_id: neg, tipo: 'anuncio_imagem', status: 'no_ar', titulo: gancho, gancho, texto: 't', cta: 'c', midia_ids: [], versao: 1, criado_em: dias(20), atualizado_em: dias(20), ...extra })
const pa = peca(A.id, 'Presente que ninguém esquece', { arquivo_path: guarda(`${A.id}/pecas/a.jpg`, FOTO(1)) }), pb = peca(A.id, 'Promo de terça', { arquivo_path: guarda(`${A.id}/pecas/b.jpg`, FOTO(5)) }), pc = peca(A.id, 'Caixa nova de Natal', { arquivo_path: guarda(`${A.id}/pecas/c.jpg`, FOTO(3)) })
poe('pecas', [pa, pb, pc])
const camp = (neg, nome, p, ad, verba, ativ) => ({ id: id(), negocio_id: neg, nome, status: 'ativa', verba_dia: verba, peca_ids: [p.id], meta_ad_ids: [ad], simulada: true, criado_em: ativ, ativada_em: ativ })
poe('campanhas', [camp(A.id, 'Presente', pa, 'ad_a', 20, dias(20)), camp(A.id, 'Promo', pb, 'ad_b', 20, dias(12)), camp(A.id, 'Natal', pc, 'ad_c', 10, dias(2))])
const lead = (neg, nome, extra) => ({ id: id(), negocio_id: neg, telefone: '550006' + RUN + String(Math.random()).slice(2, 6), nome, origem: 'anuncio', etapa: 'conversando', followups: 0, ...extra })
const L = {
  a1: lead(A.id, 'A1', { anuncio_ref: 'ad_a', criado_em: dias(8), etapa: 'ganho', valor: 135, ganho_em: dias(3), atualizado_em: dias(3) }),
  a2: lead(A.id, 'A2', { anuncio_ref: 'ad_a', criado_em: dias(7), etapa: 'ganho', valor: 85, ganho_em: dias(0.5), atualizado_em: dias(0.5) }),
  a3: lead(A.id, 'A3', { anuncio_ref: 'ad_a', criado_em: dias(6), etapa: 'proposta', atualizado_em: dias(1) }),
  a4: lead(A.id, 'A4', { anuncio_ref: 'ad_a', criado_em: dias(5), atualizado_em: dias(5) }),
  a5: lead(A.id, 'A5', { anuncio_ref: 'ad_a', criado_em: dias(4), atualizado_em: dias(4) }),
  a6: lead(A.id, 'A6', { anuncio_ref: 'ad_a', criado_em: dias(1), atualizado_em: dias(1) }),
  c1: lead(A.id, 'C1', { anuncio_ref: 'ad_c', criado_em: dias(1), atualizado_em: dias(1) }),
  c2: lead(A.id, 'C2', { anuncio_ref: 'ad_c', criado_em: dias(0.5), atualizado_em: dias(0.5) }),
}
for (let k = 0; k < 6; k++) L['b' + k] = lead(A.id, 'B' + k, { anuncio_ref: 'ad_b', criado_em: dias(10 - k), atualizado_em: dias(10 - k) })
poe('leads', Object.values(L))
const le_ = (l, para, quando) => ({ id: ++nEv, negocio_id: A.id, lead_id: l.id, tipo: para === 'ganho' ? 'ganho' : 'etapa', autor: 'maia', para, detalhe: {}, criado_em: quando })
poe('lead_eventos', [le_(L.a1, 'proposta', dias(6)), le_(L.a1, 'ganho', dias(3)), le_(L.a2, 'proposta', dias(1)), le_(L.a2, 'ganho', dias(0.5)), le_(L.a3, 'proposta', dias(1))])
poe('metricas_dia', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => ({ negocio_id: A.id, dia: dias(k).slice(0, 10), gasto: 50, conversas_iniciadas: 4 })))
// a Meta por anúncio (o arquivo que a leitura só-GET usa no modo local): A R$ 20/dia e 2 conversas; B R$ 20 e 1; C R$ 10 e 1
fs.mkdirSync(path.join(PASTA, 'meta'), { recursive: true })
const linhasA = []
for (let k = 0; k < 10; k++) { linhasA.push({ data: dias(k).slice(0, 10), ad_id: 'ad_a', gasto: 20, conversas: 2 }, { data: dias(k).slice(0, 10), ad_id: 'ad_b', gasto: 20, conversas: 1 }); if (k < 2) linhasA.push({ data: dias(k).slice(0, 10), ad_id: 'ad_c', gasto: 10, conversas: 1 }) }
fs.writeFileSync(path.join(PASTA, 'meta', 'rel_a' + RUN + '.json'), JSON.stringify(linhasA))

let r = await api('analise_anuncios', { negocio_id: A.id })
const tx = String(r.texto || '')
console.log(tx.split('\n').map(l => '     │ ' + l).join('\n'))
confere('abre com "Análise dos anúncios do <negócio>" e o período', /^Análise dos anúncios do Wood Arte a Laser \(\d\d\/\d\d a \d\d\/\d\d\), Ana:/.test(tx))
// o período são os 2 últimos dias; maia_metricas_dia conta por dia inteiro (3 dias de R$ 50 e 4 conversas, igual ao resumo da semana)
confere('investido R$ 150, 12 conversas, R$ 12,50 por conversa', /Investido: R\$ 150 · 12 conversas · R\$ 12,50 por conversa/.test(tx))
confere('métrica secundária da implantação: 2 chegaram em "pediu orçamento" de 3 contatos novos', /Chegaram em "pediu orçamento": 2 de 3 contatos novos$/m.test(tx))
confere('vendas no período: 1, somando R$ 85 (a de 3 dias atrás não conta)', /Vendas: 1, somando R\$ 85$/m.test(tx))
confere('conclusão: pausar a "Promo de terça" (0 de 6 no orçamento, sem venda)', /Sugiro mudar: pausar "Promo de terça" \(6 contatos, nenhum chegou em "pediu orçamento" \(a média dos anúncios é 21%\) e nenhuma venda\)/.test(tx))
confere('e subir "Presente que ninguém esquece" de R$ 20 pra R$ 24 (2 vendas, conversa a R$ 10), dentro do teto', /subir a verba de "Presente que ninguém esquece" de R\$ 20 pra R\$ 24 por dia \(2 vendas, conversa a R\$ 10\)/.test(tx))
confere('o anúncio novo (2 dias, ciclo de 5) fica em teste, sem mexer', (r.dados?.decisao?.em_teste || []).some(x => x.nome === 'Caixa nova de Natal' && x.faltam_dias === 3), JSON.stringify(r.dados?.decisao?.em_teste))
confere('termina perguntando se o dono topa testar', /Topa testar assim\? Me responde aqui que eu passo pra equipe ajustar\.$/.test(tx))
confere('a prévia não grava nada', !le('pecas').some(p => p.negocio_id === A.id && p.tipo === 'relatorio'))

// gerar: mesmo sem "equipe aprova tudo", sugestão de mudar vai pra equipe
await api('atualizar_negocio', { id: A.id, aprovacao_equipe: false })
r = await api('analise_anuncios', { negocio_id: A.id, gerar: true })
const pAn = le('pecas').find(p => p.id === r.peca?.id)
const tarA = le('tarefas').find(t => t.peca_id === pAn?.id)
confere('a análise vira tarefa de IMAGEM pra oficina (a peça espera em "gerando", com a legenda curta)', pAn?.status === 'gerando' && tarA?.tipo === 'relatorio' && tarA.dados?.analise?.conclusao?.tipo === 'mudar' && /^Análise dos anúncios do Wood Arte a Laser .*Topa testar\? Me responde aqui\.$/.test(pAn.cta || ''), JSON.stringify({ st: pAn?.status, cta: pAn?.cta }))
const card = tarA?.dados?.analise || {}
confere('o card leva os 5 números: R$ 150, 12, R$ 12,50, "2 de 3" e 1 venda (R$ 85)', JSON.stringify(card.numeros?.map(x => x.valor)) === JSON.stringify(['R$ 150', '12', 'R$ 12,50', '2 de 3', '1']) && /R\$ 85/.test(card.numeros?.[4]?.rotulo || ''), JSON.stringify(card.numeros))
confere('o anúncio da vez é o que a sugestão manda estimular, com a miniatura do criativo', card.anuncio?.nome === 'Presente que ninguém esquece' && card.anuncio_arquivo === pa.arquivo_path && card.pergunta === 'Topa testar?', JSON.stringify(card.anuncio))
const of = oficina()
console.log((of.stdout || '').split('\n').filter(Boolean).map(l => '     │ oficina: ' + l).join('\n'))
const pAn2 = le('pecas').find(p => p.id === pAn?.id)
confere('a oficina (Chrome) fez a imagem e devolveu: a peça vai pra equipe com a imagem', !!pAn2?.arquivo_path && pAn2.status === 'revisao_equipe' && fs.existsSync(path.join(PASTA, 'arquivos', pAn2.arquivo_path)), (of.stderr || '').slice(0, 300) + JSON.stringify({ st: pAn2?.status }))
confere('"sugiro mudar" passa pela equipe mesmo com a aprovação automática ligada', pAn2?.status === 'revisao_equipe' && pAn2.texto === tx, pAn2?.status)
if (pAn2?.arquivo_path) {
  fs.copyFileSync(path.join(PASTA, 'arquivos', pAn2.arquivo_path), path.join(PASTA, 'exemplo-analise-2-dias.jpg'))
  fs.writeFileSync(path.join(PASTA, 'card-analise.json'), JSON.stringify(card, null, 1))
  const png = spawnSync(process.execPath, ['maia-oficina/oficina.js', '--teste-analise', path.join(PASTA, 'card-analise.json'), ...(LOGO ? ['--logo', LOGO] : []), ...(FOTO(1) ? ['--foto', FOTO(1)] : []), '--marca', JSON.stringify(MARCA_WOOD), '--saida', path.resolve(PASTA, 'exemplo-analise-2-dias.png')], { encoding: 'utf8', timeout: 120000 })
  confere('o modo de teste da oficina grava o PNG de exemplo', fs.existsSync(path.join(PASTA, 'exemplo-analise-2-dias.png')), (png.stdout || '') + (png.stderr || ''))
}
confere('o evento guarda a conclusão e as sugestões (pra equipe e pro relatório do mês)', le('eventos').some(e => e.tipo === 'analise_2dias' && e.detalhe?.peca_id === pAn?.id && e.detalhe?.conclusao === 'mudar' && e.detalhe.sugestoes.length === 2))
const ap = await api('aprovar_peca', { peca_id: pAn?.id })
const dcvA = le('conversas').find(c => c.negocio_id === A.id && c.canal === 'dono')
const msgA = le('msgs').filter(m => m.conversa_id === dcvA?.id && /^\(imagem\) Análise dos anúncios/.test(m.texto || ''))
confere('equipe aprova: vai pro WhatsApp do dono como IMAGEM, com a legenda curta e o link do painel', ap.http < 400 && msgA.length === 1 && msgA[0].tipo === 'imagem' && /Topa testar\?/.test(msgA[0].texto) && /\/maia\/painel\?t=/.test(msgA[0].texto), JSON.stringify(ap).slice(0, 200))
const lk = await api('link_painel_dono', { negocio_id: A.id })
const tokA = new globalThis.URL(lk.link).searchParams.get('t')
const entra = async t => (await fetch(`${URL_}/api/maia/painel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'entrar', t }) })).headers.get('set-cookie')?.split(';')[0] || ''
const ckA = await entra(tokA)
let pd = await (await fetch(`${URL_}/api/maia/painel?acao=tudo`, { headers: { cookie: ckA } })).json().catch(() => ({}))
confere('o painel do dono mostra a análise (e ela não entra no lugar do resumo da semana)', pd.analises?.length === 1 && pd.analises[0].texto === tx && !!pd.analises[0].imagem && !(pd.resumos || []).some(x => /^Análise/.test(x.texto)), JSON.stringify(pd.analises))
r = await api('pedido_dono', { negocio_id: A.id, qual: 'analise' })
confere('pelo WhatsApp ("me manda a análise"): devolve a análise que acabou de ir', r.analise === tx, JSON.stringify(r).slice(0, 200))

// a agenda (8h no fuso do negócio; ter a sáb)
mexe('negocios', A.id, { meta: { ad_account_id: 'act_rel_a' + RUN, atendimento: { dias: [2, 3, 4, 5, 6] } } })
const sabado = new Date(Date.UTC(2026, 10, 14, 11)).toISOString(), dom = new Date(Date.UTC(2026, 10, 15, 11)).toISOString(), ter = new Date(Date.UTC(2026, 10, 17, 11)).toISOString()
r = await api('rodar_relatorios', { agora: sabado })
confere('menos de 2 dias depois da última: não faz outra', !(r || []).some?.(x => x.negocio === A.id) && !Object.values(r).some(x => x?.negocio === A.id && x.analise), JSON.stringify(r).slice(0, 200))
r = await api('rodar_relatorios', { agora: dom })
confere('domingo (o negócio não abre): não faz', !Object.values(r).some(x => x?.negocio === A.id && x.analise), JSON.stringify(r).slice(0, 200))
r = await api('rodar_relatorios', { agora: new Date(Date.UTC(2026, 10, 17, 14)).toISOString() })
confere('fora das 8h: não faz', !Object.values(r).some(x => x?.negocio === A.id && x.analise))
r = await api('rodar_relatorios', { agora: ter })
confere('terça 8h, 4 dias depois: faz a análise', Object.values(r).some(x => x?.negocio === A.id && x.analise), JSON.stringify(r).slice(0, 300))

// ─── negócio M: o relatório do mês (outubro de 2026)
console.log('\n3) O relatório do mês (negócio M, outubro)')
const M = await api('criar_negocio', { nome: NOME_M, nicho: 'copos e garrafas personalizados', cidade: 'Estrela', dono_nome: 'Marta Teste', dono_whatsapp: '550007772' + RUN, verba_dia: 30 })
mexe('negocios', M.id, { status: 'ativo', marca: { ...MARCA_WOOD, logo_path: guarda(`${M.id}/marca/logo.jpg`, LOGO) }, meta: { ad_account_id: 'act_rel_m' + RUN } })   // sem trafego: secundária padrão
const out = (dia, h = 15, min = 0) => new Date(Date.UTC(2026, 9, dia, h, min)).toISOString()
const pm1 = peca(M.id, 'Caixa pra presentear', { criado_em: out(2), aprovado_dono_em: out(2), arquivo_path: guarda(`${M.id}/pecas/m1.jpg`, FOTO(1)) }), pm2 = peca(M.id, 'Promo do mês', { criado_em: out(9), aprovado_dono_em: out(9), status: 'aprovada' })
const pm3 = peca(M.id, 'Rascunho', { criado_em: out(20), status: 'descartada' })
const cm1 = camp(M.id, 'Presente', pm1, 'ad_m1', 20, out(3)), cm2 = camp(M.id, 'Promo', pm2, 'ad_m2', 10, out(10))
poe('pecas', [pm1, pm2, pm3]); poe('campanhas', [cm1, cm2])
const Ls = []
for (let k = 0; k < 10; k++) Ls.push(lead(M.id, 'M1-' + k, { anuncio_ref: 'ad_m1', criado_em: out(4 + k), atualizado_em: out(4 + k) }))
for (let k = 0; k < 5; k++) Ls.push(lead(M.id, 'M2-' + k, { anuncio_ref: 'ad_m2', criado_em: out(11 + k), atualizado_em: out(11 + k) }))
Ls.push(lead(M.id, 'Insta1', { origem: 'instagram', criado_em: out(12), etapa: 'ganho', valor: 100, ganho_em: out(14) }), lead(M.id, 'Insta2', { origem: 'instagram', criado_em: out(13) }))
// M1: 4 chegaram no orçamento, 2 compraram (R$ 200 cada); perdas: 2 acharam caro (M2), 1 parou de responder (M1)
Object.assign(Ls[0], { etapa: 'ganho', valor: 200, ganho_em: out(8) }); Object.assign(Ls[1], { etapa: 'ganho', valor: 200, ganho_em: out(9) })
Object.assign(Ls[2], { etapa: 'proposta' }); Object.assign(Ls[3], { etapa: 'perdido', motivo_perda: 'parou de responder depois das retomadas', perdido_em: out(20) })
Object.assign(Ls[10], { etapa: 'perdido', motivo_perda: 'achou caro', perdido_em: out(18) }); Object.assign(Ls[11], { etapa: 'perdido', motivo_perda: 'achou caro', perdido_em: out(19) })
poe('leads', Ls)
poe('lead_eventos', [0, 1, 2, 3].map(k => ({ id: ++nEv, negocio_id: M.id, lead_id: Ls[k].id, tipo: 'etapa', autor: 'maia', para: 'proposta', detalhe: {}, criado_em: out(5 + k) })))
poe('metricas_dia', Array.from({ length: 20 }, (_, k) => ({ negocio_id: M.id, dia: out(k + 1).slice(0, 10), gasto: 30, conversas_iniciadas: 5 })))
const linhasM = []
for (let k = 1; k <= 20; k++) linhasM.push({ data: out(k).slice(0, 10), ad_id: 'ad_m1', gasto: 20, conversas: 4 }, { data: out(k).slice(0, 10), ad_id: 'ad_m2', gasto: 10, conversas: 1 })
fs.writeFileSync(path.join(PASTA, 'meta', 'rel_m' + RUN + '.json'), JSON.stringify(linhasM))
poe('eventos', [ev(M.id, 'campanha_pausada', { campanha: cm2.id, por: 'equipe' }, out(25))])
// conversas: 4 no mês; 2 a Maia passou pro time (uma reclamação, respondida 90 min depois e virou venda; uma que parou sem resposta)
const cvs = [0, 1, 2, 3].map(k => ({ id: id(), negocio_id: M.id, canal: 'cliente', telefone: '550008' + RUN + k, modo: k >= 2 ? 'humano' : 'ia', lead_id: Ls[k].id, criado_em: out(5 + k), ultima_msg_em: out(5 + k) }))
poe('conversas', cvs)
const msg = (cv, autor, quando, texto = 'oi') => ({ id: id(), conversa_id: cv.id, negocio_id: M.id, autor, tipo: 'texto', texto, status: 'recebido', criado_em: quando })
poe('msgs', [
  msg(cvs[0], 'cliente', out(5, 15, 0)), msg(cvs[0], 'maia', out(5, 15, 2)),
  msg(cvs[1], 'cliente', out(6, 15, 0)), msg(cvs[1], 'maia', out(6, 15, 4)),
  msg(cvs[2], 'cliente', out(7, 15, 0)), msg(cvs[2], 'maia', out(7, 15, 6)), msg(cvs[2], 'cliente', out(7, 15, 10), 'veio errado, que absurdo'), msg(cvs[2], 'dono', out(7, 16, 40), 'desculpa, já resolvo'),
  msg(cvs[3], 'cliente', out(8, 15, 0)), msg(cvs[3], 'maia', out(8, 15, 8)), msg(cvs[3], 'cliente', out(8, 15, 20), 'quero falar com uma pessoa'),
])
// a conversa da reclamação virou venda DEPOIS da passagem (o lead 1 ganhou dia 9; a passagem foi dia 7)
mexe('conversas', cvs[2].id, { lead_id: Ls[1].id })
poe('eventos', [ev(M.id, 'modo_humano', { conversa_id: cvs[2].id, por: 'maia', motivo: 'reclamação do cliente' }, out(7, 15, 10)), ev(M.id, 'modo_humano', { conversa_id: cvs[3].id, por: 'sistema', motivo: 'pediu pra falar com uma pessoa' }, out(8, 15, 20)),
  ev(M.id, 'modo_humano', { conversa_id: cvs[1].id, por: 'Guto', motivo: 'equipe assumiu' }, out(6, 16))])   // a equipe assumir não é "a IA precisou de ajuda"
// orgânico: 3 posts publicados (2 de bastidores, 1 de promo)
const post = (dia, tema, reach, inter, foto) => { const cam = guarda(`${M.id}/social/p${dia}.jpg`, FOTO(foto)); const p = peca(M.id, 'post ' + tema, { tipo: 'post', criado_em: out(dia - 1), texto: `Legenda do post sobre ${tema}`, arquivo_path: cam }); poe('pecas', [p]); return ev(M.id, 'social_post', { peca_id: p.id, tipo: 'foto', tema, midias: cam ? [{ caminho: cam, tipo: 'foto' }] : [], status: 'publicado', publicado_em: out(dia, 21), resultado: { ig: { reach, total_interactions: inter, views: reach * 2, saved: 3 } } }, out(dia - 1)) }
poe('eventos', [post(6, 'bastidores', 800, 60, 3), post(13, 'bastidores', 600, 40, 2), post(20, 'promo', 200, 5, 6)])

r = await api('relatorio_mes', { negocio_id: M.id, mes: '2026-10' })
const dm = r.dados || {}, w = dm.whatsapp || {}, t = dm.trafego || {}, o = dm.organico || {}
confere('WhatsApp: 4 conversas, 3 vendas (R$ 500), 3 perdas, 17 contatos novos', w.conversas === 4 && w.ganhos === 3 && w.receita === 500 && w.perdas === 3 && w.contatos_novos === 17, JSON.stringify(w).slice(0, 300))
confere('motivos de perda: achou caro (2), parou de responder (1)', JSON.stringify(w.motivos) === JSON.stringify([['achou caro', 2], ['parou de responder depois das retomadas', 1]]), JSON.stringify(w.motivos))
confere('a 1ª resposta da Maia: 5 min em média (2, 4, 6 e 8)', w.primeira_resposta_min === 5 && w.conversas_atendidas === 4, String(w.primeira_resposta_min))
confere('onde a IA precisou de ajuda: 2 passadas (a da equipe não conta), 1 reclamação', w.passadas === 2 && w.reclamacoes === 1, JSON.stringify(w.passadas_motivos))
confere('o time: 1 de 2 respondida, em 90 min; 1 parou sem resposta; 1 venda depois da passagem', w.time.respondidas === 1 && w.time.tempo_medio_min === 90 && w.time.paradas === 1 && w.time.vendas_depois === 1, JSON.stringify(w.time))
confere('tráfego: R$ 600, 100 conversas, R$ 6 por conversa, verba média R$ 30 em 20 dias', t.gasto === 600 && t.conversas === 100 && t.custo_conversa === 6 && t.verba_media_dia === 30 && t.dias_com_gasto === 20, JSON.stringify({ g: t.gasto, c: t.conversas, cc: t.custo_conversa, v: t.verba_media_dia }))
confere('secundária padrão (sem implantação): 4 receberam proposta; 2 vendas de anúncio (R$ 400); retorno R$ 0,83', t.secundaria === 4 && dm.sec?.padrao === true && t.vendas === 2 && t.receita === 400 && t.retorno === 0.83, JSON.stringify({ s: t.secundaria, v: t.vendas, r: t.retorno }))
const am1 = (t.anuncios || []).find(a => a.id === 'ad_m1'), am2 = (t.anuncios || []).find(a => a.id === 'ad_m2')
confere('"Caixa pra presentear": R$ 400, 10 contatos, R$ 5 por conversa, 4 no orçamento, 2 vendas → qualificado', am1?.gasto === 400 && am1.contatos === 10 && am1.custo_conversa === 5 && am1.secundaria === 4 && am1.vendas === 2 && am1.qualificado === true, JSON.stringify(am1))
confere('"Promo do mês": R$ 200, 5 contatos, R$ 10 por conversa, ninguém no orçamento → não qualificou', am2?.gasto === 200 && am2.contatos === 5 && am2.custo_conversa === 10 && am2.secundaria === 0 && am2.qualificado === false, JSON.stringify(am2))
confere('o que mudou no mês: as 2 campanhas ligadas e a Promo pausada', (t.mexidas || []).length === 3 && /pausada a campanha "Promo"/.test(t.mexidas[2]?.texto || ''), JSON.stringify(t.mexidas))
confere('orgânico: 3 posts, 1.600 de alcance, 2 contatos do Instagram; repetir bastidores (700 de média)', o.total === 3 && o.alcance === 1600 && o.contatos === 2 && /posts sobre bastidores \(700 de alcance médio\)/.test(o.estimular || ''), JSON.stringify({ t: o.total, a: o.alcance, c: o.contatos, e: o.estimular }))
confere('criação: 6 peças no mês (3 anúncios, um deles descartado, e 3 posts), 2 aprovadas pelo dono', dm.criacao?.criadas === 6 && dm.criacao.aprovadas === 2, JSON.stringify(dm.criacao))
confere('tom do mês: vendeu R$ 500 com R$ 600 de anúncio e sem mês anterior → "precisamos olhar juntos"', r.tom === 'olhar' && /precisa olhar juntos/.test(r.aviso || ''), r.aviso)
const p1 = r.projecao?.cenarios?.[0]
confere('projeção: R$ 30/dia x 30 ÷ R$ 6 = 150 conversas; 13% viram venda = ~20; x R$ 200 = ~R$ 4.000', p1?.conversas === 150 && p1.vendas === 20 && p1.receita === 4000, JSON.stringify(p1))
confere('projeção com verba maior fica no teto (R$ 39) e conta a conversa 15% mais cara', /R\$ 39 por dia/.test(r.projecao?.cenarios?.[1]?.titulo || '') && /15% mais cara/.test(r.projecao.cenarios[1].conta))
confere('projeção do time: a conversa que parou, na taxa de venda do mês (75%) = ~0,8 venda', /1 conversa x 75% .*= ~0,8 vendas a mais/.test(r.projecao?.cenarios?.[2]?.conta || ''), r.projecao?.cenarios?.[2]?.conta)
const tw = String(r.texto || '')
console.log(tw.split('\n').map(l => '     │ ' + l).join('\n'))
confere('o resumo do WhatsApp é curto e tem os números do mês', /^Relatório do mês: outubro de 2026 do Wood Arte a Laser \(mês\), Marta\./.test(tw) && /WhatsApp: 4 conversas, 3 vendas, 3 perdas/.test(tw) && /Anúncios: R\$ 600, 100 conversas \(R\$ 6 cada\)/.test(tw) && tw.split('\n').length <= 8)
confere('semana a semana: investido 210/210/180/0/0, vendas 0/3/0/0/0, conversas 35/35/30/0/0', JSON.stringify((dm.semanas || []).map(w => [w.rotulo, w.investido, w.vendas, w.conversas])) === JSON.stringify([['01–07', 210, 0, 35], ['08–14', 210, 3, 35], ['15–21', 180, 0, 30], ['22–28', 0, 0, 0], ['29–31', 0, 0, 0]]), JSON.stringify(dm.semanas))
confere('anúncio campeão: "Caixa pra presentear" (2 vendas), com o criativo da peça', dm.campeao_anuncio?.nome === 'Caixa pra presentear' && dm.campeao_anuncio.arquivo === pm1.arquivo_path && /2 vendas/.test(dm.campeao_anuncio.motivo), JSON.stringify(dm.campeao_anuncio))
confere('postagem campeã: a de bastidores do dia 06 (800 de alcance), com a mídia', dm.campeao_post?.alcance === 800 && !!dm.campeao_post.midia?.caminho, JSON.stringify(dm.campeao_post))
confere('a página traz a logo, o anúncio e o post campeões (embutidos no exemplo) e os gráficos', ['Os campeões do mês', 'Semana a semana', 'Anúncio campeão', 'Postagem campeã', 'class="hero"', 'var(--marca)'].every(x => (r.html || '').includes(x)) && ((r.html || '').match(/data:image\/jpeg;base64,/g) || []).length === (LOGO && FOTO(1) ? 3 : 0), '')
confere('a página tem os cards e os números', ['Conversas do WhatsApp', 'Onde a IA precisou de ajuda', 'Onde o time pode melhorar', 'Campanhas e anúncios', 'Orgânico', 'Cada função da Maia', 'Projeção', 'Precisamos olhar juntos', 'Caixa pra presentear', '1,5 h'].every(s => (r.html || '').includes(s)), '')
fs.writeFileSync(path.join(PASTA, 'exemplo-relatorio-do-mes.html'), r.html || '')

// aviso (dia 1) e relatório (dia 2), pela equipe, até a página no painel
r = await api('relatorio_mes', { negocio_id: M.id, mes: '2026-10', aviso: true })
confere('o aviso do dia 1 vira peça pra equipe aprovar, com o tom', le('pecas').find(p => p.id === r.peca?.id)?.status === 'revisao_equipe' && /amanhã separa uma horinha que eu te mando o relatório completo de outubro de 2026/.test(r.texto || ''), r.texto)
r = await api('relatorio_mes', { negocio_id: M.id, mes: '2026-10', aviso: true })
confere('o aviso não sai duas vezes no mesmo mês', !!r.pulou)
r = await api('relatorio_mes', { negocio_id: M.id, mes: '2026-10', gerar: true, ia: false })
const pRel = le('pecas').find(p => p.id === r.peca?.id)
confere('o relatório vira peça "Relatório do mês 2026-10" pra equipe', pRel?.status === 'revisao_equipe' && pRel.titulo === 'Relatório do mês 2026-10' && le('eventos').some(e => e.tipo === 'relatorio_mes' && e.detalhe?.peca_id === pRel.id && e.detalhe.dados?.whatsapp?.ganhos === 3))
const lkM = await api('link_painel_dono', { negocio_id: M.id }), tokM = new globalThis.URL(lkM.link).searchParams.get('t'), ckM = await entra(tokM)
let pg = await fetch(`${URL_}/api/maia/painel?acao=relatorio&id=${pRel?.id}`, { headers: { cookie: ckM } })
confere('antes da equipe aprovar, a página não abre pro dono', pg.status === 404)
await api('aprovar_peca', { peca_id: pRel?.id })
const dcvM = le('conversas').find(c => c.negocio_id === M.id && c.canal === 'dono')
const mM = le('msgs').filter(m => m.conversa_id === dcvM?.id && /^Relatório do mês/.test(m.texto || ''))
const linkRel = (/(https?:\/\/\S+\/maia\/relatorio\?t=\S+)/.exec(mM[0]?.texto || '') || [])[1]
confere('aprovado: vai pro WhatsApp do dono com o link da página do relatório', mM.length === 1 && !!linkRel && new globalThis.URL(linkRel).searchParams.get('id') === pRel?.id, mM[0]?.texto?.slice(-160))
const pag = await fetch(`${URL_}/maia/relatorio`).then(x => x.text())
confere('a página /maia/relatorio troca o link por cookie e tira o token da barra de endereço', /acao:'entrar'/.test(pag) && /history\.replaceState/.test(pag) && /acao=relatorio/.test(pag))
const ckRel = await entra(new globalThis.URL(linkRel).searchParams.get('t'))
pg = await fetch(`${URL_}/api/maia/painel?acao=relatorio&id=${pRel?.id}`, { headers: { cookie: ckRel } })
const htm = await pg.text()
confere('com o cookie do link, abre a página com os cards', pg.status === 200 && /text\/html/.test(pg.headers.get('content-type') || '') && htm.includes('Campanhas e anúncios') && htm.includes('R$ 600'))
pg = await fetch(`${URL_}/api/maia/painel?acao=relatorio&id=${pRel?.id}`, { headers: { cookie: ckA } })
confere('o dono de OUTRO negócio não abre esse relatório', pg.status === 404)
pd = await (await fetch(`${URL_}/api/maia/painel?acao=tudo`, { headers: { cookie: ckM } })).json().catch(() => ({}))
confere('o painel do dono lista o relatório do mês', pd.relatorios_mes?.length === 1 && pd.relatorios_mes[0].nome === 'outubro de 2026', JSON.stringify(pd.relatorios_mes))
r = await api('pedido_dono', { negocio_id: M.id, qual: 'relatorio_mes' })
confere('pelo WhatsApp ("o relatório do mês"): devolve o link da página', /\/maia\/relatorio\?t=.+&id=/.test(r.link || ''), JSON.stringify(r).slice(0, 200))

// a agenda do mês: dia 1 às 8h o aviso, dia 2 às 8h o relatório (de novembro)
r = await api('rodar_relatorios', { agora: new Date(Date.UTC(2026, 11, 1, 11)).toISOString() })
confere('dia 1/12 às 8h: o aviso de novembro', Object.values(r).some(x => x?.negocio === M.id && x.aviso) && le('eventos').some(e => e.tipo === 'relatorio_mes_aviso' && e.negocio_id === M.id && e.detalhe?.mes === '2026-11'), JSON.stringify(r).slice(0, 300))
r = await api('rodar_relatorios', { agora: new Date(Date.UTC(2026, 11, 2, 11)).toISOString() })
confere('dia 2/12 às 8h: o relatório de novembro', Object.values(r).some(x => x?.negocio === M.id && x.relatorio) && le('eventos').some(e => e.tipo === 'relatorio_mes' && e.negocio_id === M.id && e.detalhe?.mes === '2026-11'), JSON.stringify(r).slice(0, 300))
r = await api('rodar_relatorios', { agora: new Date(Date.UTC(2026, 11, 2, 11)).toISOString() })
confere('rodar de novo no mesmo dia não repete o relatório', !Object.values(r).some(x => x?.negocio === M.id && x.relatorio))

console.log(`\nExemplo do relatório: ${path.resolve(PASTA, 'exemplo-relatorio-do-mes.html')}`)
console.log(`Exemplo da análise: ${path.resolve(PASTA, 'exemplo-analise-2-dias.png')} (e .jpg, o da oficina)`)
console.log(`${ok} ok, ${falha} falha(s)`)
process.exit(falha ? 1 : 0)
