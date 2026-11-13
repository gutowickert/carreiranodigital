// Maia: teste do aprendizado com as correções e do acompanhamento dos negócios novos (13/11). Dados SIMULADOS, sem IA.
// Roda contra o sistema em MODO LOCAL (MAIA_LOCAL=1): nada sai do computador (sem banco, sem Meta, sem WhatsApp).
// O servidor sobe assim (pasta limpa; MAIA_APRENDE_SEM_IA=1 deixa o texto das regras e da análise sem IA, igual sempre):
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-maia-aprendizado MAIA_PAINEL_SENHA=teste123 MAIA_APRENDE_SEM_IA=1 MAIA_SEM_AVISO=1 npx next dev -p 3207
// Uso: node scripts/maia-teste-aprendizado.mjs [url] [senha]      (padrão http://localhost:3207 teste123)
//   PASTA=.teste-maia-aprendizado (a mesma MAIA_LOCAL_PASTA do servidor: o teste lê os eventos direto do arquivo)
// O que testa: correções → proposta de regra → aprovação → regra no prompt (criação e atendimento); primeira conversa real →
// aviso pra equipe com o link; conversa simulada e 2ª mensagem não avisam; limite de primeiras; análise da manhã; acerto de primeira.
import fs from 'node:fs'
import path from 'node:path'

const URL_ = process.argv[2] || 'http://localhost:3207'
const SENHA = process.argv[3] || 'teste123'
const PASTA = path.resolve(process.env.PASTA || '.teste-maia-aprendizado')
const log = (...a) => console.log(...a)
const rel = []
const anota = (ok, o) => { rel.push({ ok: !!ok, o }); log((ok ? '  ✔ ' : '  ✘ ') + o) }
const cab = { 'x-senha': SENHA, 'content-type': 'application/json' }
async function post(rota, acao, corpo = {}) {
  const r = await fetch(URL_ + rota, { method: 'POST', headers: cab, body: JSON.stringify({ acao, por: 'teste', ...corpo }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status))
  return j
}
const op = (acao, c) => post('/api/maia/operacao', acao, c)
const apr = (acao, c) => post('/api/maia/aprendizado', acao, c)
const ver = async (rota, q) => { const r = await fetch(URL_ + rota + '?' + new URLSearchParams(q), { headers: cab }); const j = await r.json(); if (!r.ok) throw new Error(j.erro || r.status); return j }
const eventos = (tipo) => { try { return JSON.parse(fs.readFileSync(path.join(PASTA, 'eventos.json'), 'utf8')).filter(e => !tipo || e.tipo === tipo) } catch { return [] } }

const resumo = await ver('/api/maia/operacao', { acao: 'resumo' })
if (resumo.modo !== 'local') throw new Error('o sistema não está em modo local: teste cancelado')
log('Maia · teste do aprendizado em ' + URL_)
const sufixo = String(Date.now()).slice(-6)

// ---------- o negócio ----------
const neg = await op('criar_negocio', { nome: 'Marcenaria Teste ' + sufixo, nicho: 'móveis sob medida', cidade: 'Lajeado', regiao: 'Lajeado e região', dono_nome: 'Seu Teste', dono_whatsapp: '5500077' + sufixo, contexto: { produtos: 'mesas e camas de madeira maciça', preco: 'mesa a partir de R$ 900' } })
anota(neg.id, 'negócio de teste criado')

// ---------- A1: correções de peças (descarte e ajuste) ----------
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFklEQVR42mP8z8DAwMDAxMDAwMDAAAAWBgEB4m1N2AAAAABJRU5ErkJggg=='
const pecas = []
for (const g of ['Mesa de madeira maciça pra tua família', 'Cama sob medida do jeito que tu quer', 'Móveis que duram a vida toda', 'Teu quarto do jeito certo']) {
  const t = await op('teste_tarefa_oficina', { negocio_id: neg.id, arquivo_b64: PNG, mime: 'image/png', gancho: g, texto: 'Feito na marcenaria, sob medida.', cta: 'Chama no WhatsApp' })
  pecas.push(t.peca_id)
}
anota(pecas.length === 4, '4 peças de teste criadas')
for (const id of pecas.slice(0, 3)) {
  await op('descartar_peca', { peca_id: id })
  await apr('corrigir', { peca_id: id, motivos: ['sem_regiao'], acao_original: 'descartar', por: 'Guto' })
}
// a 4ª: pedido de ajuste (o ajuste de verdade chama a IA pra refazer; aqui só o porquê)
await apr('corrigir', { peca_id: pecas[3], motivos: ['sem_regiao', 'gancho_generico'], livre: 'não fala de Lajeado', acao_original: 'ajustar', por: 'Mateus' })
let cs = eventos('correcao_time').filter(e => e.negocio_id === neg.id)
anota(cs.length === 4 && cs.every(c => c.detalhe.motivos.includes('sem_regiao') && c.detalhe.alvo === 'peca' && c.detalhe.original), '4 correções guardadas (evento correcao_time, com o motivo, quem e o texto da peça)')
anota(cs.some(c => c.detalhe.por === 'Mateus' && c.detalhe.livre === 'não fala de Lajeado'), 'o campo livre e quem corrigiu ficam guardados')
let erroSemMotivo = null
try { await apr('corrigir', { peca_id: pecas[0], motivos: [] }) } catch (e) { erroSemMotivo = e.message }
anota(/motivo/.test(erroSemMotivo || ''), 'correção sem motivo é recusada ("' + erroSemMotivo + '")')

// ---------- A3: proposta de regra → aprovação → prompt ----------
const p1 = await apr('propor', { negocio_id: neg.id })
const prop = p1.novas.find(p => p.motivo === 'sem_regiao')
anota(prop && prop.base === 4 && /Lajeado/.test(prop.texto), 'a Maia propôs: ' + (prop ? `"${prop.porque} → ${prop.texto}"` : 'nada'))
anota(!p1.novas.some(p => p.motivo === 'gancho_generico'), 'motivo com 1 correção só não vira proposta (mínimo 2)')
const p2 = await apr('propor', { negocio_id: neg.id })
anota(p2.novas.length === 0, 'juntar de novo não repete a proposta (as correções já foram usadas)')
const antes = await apr('teste_prompt', { negocio_id: neg.id })
anota(!antes.criacao, 'antes de aprovar, nada no prompt')
const dec = await apr('decidir', { id: prop.id, decisao: 'aprovar', texto: prop.texto + ' Ex.: "Mesa sob medida em Lajeado".', por: 'Nando' })
anota(dec.status === 'aprovada' && dec.regra?.escopo === 'negocio', 'a equipe aprovou (com edição no texto)')
const depois = await apr('teste_prompt', { negocio_id: neg.id })
anota(/REGRAS QUE A EQUIPE ENSINOU/.test(depois.criacao) && /Lajeado/.test(depois.criacao), 'a regra aparece no prompt de CRIAÇÃO: ' + depois.criacao.split('\n').slice(-1)[0])
anota(!depois.atendimento, 'regra só de criação não entra no atendimento')
// uma regra geral escrita direto pela equipe vale pra todos, nos dois prompts
const geral = await apr('regra_nova', { texto: 'Nunca fala "promoção imperdível".', area: 'tudo', escopo: 'geral' })
const outro = await op('criar_negocio', { nome: 'Doceria Teste ' + sufixo, nicho: 'doceria', cidade: 'Estrela', dono_whatsapp: '5500078' + sufixo })
await apr('teste_rotina', { relogio: new Date().toISOString().slice(0, 10) + 'T15:00:00Z' })   // a rotina de hora em hora copia as regras gerais pros negócios novos
const pOutro = await apr('teste_prompt', { negocio_id: outro.id })
anota(/promoção imperdível/.test(pOutro.atendimento) && /promoção imperdível/.test(pOutro.criacao) && !/Lajeado/.test(pOutro.criacao), 'a regra GERAL entra nos dois prompts de outro negócio (e a da marcenaria não)')
// o contexto salvo pelo painel com cópia velha: a rotina devolve as regras
await op('atualizar_negocio', { id: neg.id, contexto: { produtos: 'mesas e camas de madeira maciça' } })
await apr('teste_rotina', { relogio: new Date().toISOString().slice(0, 10) + 'T15:00:00Z' })
const volta = await apr('teste_prompt', { negocio_id: neg.id })
anota(volta.regras_aprendidas.length === 2, 'contexto salvo sem as regras: a rotina põe de volta (' + volta.regras_aprendidas.length + ' regras)')
await apr('regra_mudar', { id: geral.id, ativa: false })
anota(!/promoção imperdível/.test((await apr('teste_prompt', { negocio_id: outro.id })).atendimento), 'regra desligada sai do prompt')
// os ganchos nos prompts de verdade (o texto acima é o mesmo que eles incluem)
const src = (f) => fs.readFileSync(path.resolve(f), 'utf8')
anota(src('lib/maia/atendente.ts').includes("textoRegrasAprendidas(neg, 'atendimento')"), 'atendente.ts inclui as regras no prompt do atendimento')
anota(src('lib/maia/pecas.ts').includes("textoRegrasAprendidas(neg, 'criacao')"), 'pecas.ts inclui as regras no prompt de criação (regraGancho: gerar, refazer e acertar o dia)')

// ---------- B1: as primeiras conversas ----------
const avisos0 = eventos('aviso_equipe').length
const c1 = await apr('teste_cliente_real', { negocio_id: neg.id, telefone: '5599990' + sufixo, nome: 'Ana Cliente', texto: 'Oi, quanto custa uma mesa?' })
let av = eventos('aviso_equipe').slice(avisos0)
anota(av.length === 1 && /conversa 1 de 5/.test(av[0].detalhe.titulo) && av[0].detalhe.texto.includes('#conversa/' + c1.conversa_id), 'primeira conversa real: aviso pra equipe com o link → ' + (av[0] ? av[0].detalhe.titulo + ' · ' + av[0].detalhe.texto : 'nenhum'))
await apr('teste_cliente_real', { negocio_id: neg.id, telefone: '5599990' + sufixo, nome: 'Ana Cliente', texto: 'e entrega?' })
anota(eventos('aviso_equipe').length === avisos0 + 1, '2ª mensagem da mesma conversa não avisa de novo')
await op('simular_cliente', { negocio_id: outro.id, telefone: '5500011' + sufixo, texto: 'oi' }).catch(() => null)
await apr('teste_cliente_real', { negocio_id: neg.id, telefone: '5500012' + sufixo, nome: 'Simulado', texto: 'oi' })
anota(!eventos('acompanha_conversa').some(e => e.detalhe.conversa_id && eventos('aviso_equipe').length > avisos0 + 1), 'conversa simulada (55000...) não avisa')
await apr('acompanhar', { negocio_id: neg.id, primeiras: 2 })
await apr('teste_cliente_real', { negocio_id: neg.id, telefone: '5599991' + sufixo, nome: 'Bia', texto: 'oi' })
await apr('teste_cliente_real', { negocio_id: neg.id, telefone: '5599992' + sufixo, nome: 'Caio', texto: 'oi' })
av = eventos('aviso_equipe').slice(avisos0).filter(a => /conversa \d de/.test(a.detalhe.titulo))
anota(av.length === 2 && /conversa 2 de 2/.test(av[1].detalhe.titulo), 'limite configurável (2): avisou a 2ª conversa real e não a 3ª')

// ---------- A2: corrigir a resposta da Maia (na conversa) ----------
const H = 3600e3, br = new Date(Date.now() - 3 * H)
const hoje0 = Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3)
const ontem = (h, m = 0) => new Date(hoje0 - 24 * H + h * H + m * 60e3).toISOString()
const cv = c1.conversa_id
await apr('teste_msg', { conversa_id: cv, autor: 'cliente', texto: 'Quanto custa a mesa de 6 lugares?', quando: ontem(10), conversa_quando: ontem(9, 55) })
const mRuim = await apr('teste_msg', { conversa_id: cv, autor: 'maia', texto: 'A mesa de 6 lugares sai R$ 900. É de madeira maciça e dura a vida toda.', quando: ontem(10, 20) })
await apr('teste_msg', { conversa_id: cv, autor: 'cliente', texto: 'Vocês entregam em Estrela?', quando: ontem(10, 25) })
await apr('teste_msg', { conversa_id: cv, autor: 'maia', texto: 'Entregamos sim! Estrela fica pertinho. Quer que eu veja um horário?', quando: ontem(10, 26) })
await apr('teste_msg', { conversa_id: cv, autor: 'maia', texto: 'Oi! Conseguiu ver?', quando: ontem(15) })
// um 2º cliente que sumiu ontem: perguntou, a Maia respondeu e ele não voltou
const c4 = await apr('teste_cliente_real', { negocio_id: neg.id, telefone: '5599993' + sufixo, nome: 'Dani', texto: 'Tem cama de casal pronta?', quando: ontem(11) })
await apr('teste_msg', { conversa_id: c4.conversa_id, autor: 'maia', texto: 'Temos sim, de madeira maciça. Quer ver as fotos?', quando: ontem(11, 1) })
const conv = await ver('/api/maia/aprendizado', { acao: 'conversa', id: cv })
anota(conv.msgs.some(m => m.id === mRuim.id && m.autor === 'maia'), 'a conversa abre na página do aprendizado com as mensagens da Maia')
await apr('corrigir', { conversa_id: cv, msg_id: mRuim.id, motivos: ['preco_antes'], certo: 'É de madeira maciça e dura a vida toda: a de 6 lugares fica R$ 900.', por: 'Guto' })
const corr = eventos('correcao_time').filter(e => e.detalhe.msg_id === mRuim.id)
anota(corr.length === 1 && corr[0].detalhe.alvo === 'resposta' && /R\$ 900/.test(corr[0].detalhe.original) && corr[0].detalhe.certo, 'resposta errada guardada com motivo e "o certo seria"')
let erroMsg = null
try { await apr('corrigir', { conversa_id: cv, msg_id: conv.msgs.find(m => m.autor === 'cliente').id, motivos: ['tom_errado'] }) } catch (e) { erroMsg = e.message }
anota(/Maia/.test(erroMsg || ''), 'mensagem do cliente não dá pra marcar como errada')

// ---------- A4: acerto de primeira ----------
const painel = await ver('/api/maia/aprendizado', { acao: 'painel' })
const n1 = painel.negocios.find(n => n.id === neg.id)
anota(n1.acerto.pecas.total === 3 && n1.acerto.pecas.de_primeira === 0, `peças: ${n1.acerto.pecas.de_primeira} de ${n1.acerto.pecas.total} de primeira (as 3 descartadas)`)
anota(n1.acerto.respostas.total === 4 && n1.acerto.respostas.corrigidas === 1 && n1.acerto.respostas.pct === 75, `respostas: ${n1.acerto.respostas.pct}% sem correção (${n1.acerto.respostas.total - n1.acerto.respostas.corrigidas} de ${n1.acerto.respostas.total})`)
anota(n1.motivos[0]?.motivo === 'sem_regiao', 'motivo mais comum: ' + n1.motivos.map(m => m.rotulo + ' ' + m.n).join(', '))

// ---------- B2: a análise da manhã (rotina às 7h) ----------
const sete = new Date(hoje0 + 7 * H + 10 * 60e3).toISOString()   // hoje, 7h10 em Brasília
const avAntes = eventos('aviso_equipe').length
const rot = await apr('teste_rotina', { relogio: sete })
const a = (rot.analises || []).find(x => x.negocio === neg.id)
anota(a && a.feita, 'a rotina das 7h fez a análise de ontem (' + (a ? a.dia : '?') + ')')
anota(!(rot.analises || []).some(x => x.negocio === outro.id), 'negócio sem conversa real não entra no acompanhamento')
const an = eventos('analise_manha').filter(e => e.negocio_id === neg.id).slice(-1)[0]?.detalhe
if (an) {
  const n = an.numeros
  log('     números: ' + JSON.stringify(n))
  anota(n.conversas === 2 && n.respostas_maia === 4, '2 conversas reais ontem, 4 respostas da Maia')
  anota(n.preco_antes_do_valor === 1 && an.trechos.some(t => t.tipo === 'preço antes do valor'), 'achou o preço antes do valor (com o trecho)')
  anota(n.demoradas === 1 && an.trechos.some(t => /demorou 20 min/.test(t.tipo)), 'achou a demora de 20 min')
  anota(n.sumiram === 1 && an.trechos.some(t => /sumiu/.test(t.tipo)), 'achou o cliente que sumiu e em que ponto: ' + (an.trechos.find(t => /sumiu/.test(t.tipo))?.texto || ''))
  anota(an.sugestoes.length >= 2 && an.conclusoes, 'conclusões e sugestões: ' + an.conclusoes)
}
const avDia = eventos('aviso_equipe').slice(avAntes).find(e => /análise de ontem/.test(e.detalhe.titulo))
anota(avDia && /aprendizado\.html#acompanhar\//.test(avDia.detalhe.texto), 'aviso curto pra equipe: ' + (avDia ? avDia.detalhe.texto : 'nenhum'))
const rot2 = await apr('teste_rotina', { relogio: sete })
anota((rot2.analises || []).find(x => x.negocio === neg.id)?.pulou === 'já feita', 'rodar de novo no mesmo dia não repete a análise')
const as = await ver('/api/maia/aprendizado', { acao: 'analises', negocio: neg.id })
anota(as.length >= 1 && as[0].numeros, 'a análise aparece na página (GET analises)')
const fora = await apr('teste_rotina', { relogio: new Date(hoje0 + 9 * H).toISOString() })
anota(!fora.analises, 'fora das 7h a análise não roda')

// ---------- semanal: segunda 8h ----------
for (const id of pecas.slice(0, 2)) await apr('corrigir', { peca_id: id, motivos: ['cara_de_ia'], por: 'Nando' })
const seg = new Date(hoje0 + 8 * H); while (new Date(seg.getTime() - 3 * H).getUTCDay() !== 1) seg.setTime(seg.getTime() + 24 * H)
const rs = await apr('teste_rotina', { relogio: seg.toISOString() })
anota(rs.propostas >= 1 && eventos('aviso_equipe').some(e => /regras novas pra aprovar/.test(e.detalhe.titulo)), 'segunda 8h: a Maia propôs a regra nova da semana e avisou a equipe')
const pend = (await ver('/api/maia/aprendizado', { acao: 'painel' })).propostas.find(p => p.status === 'pendente' && p.motivo === 'cara_de_ia' && p.negocio_id === neg.id)
await apr('decidir', { id: pend.id, decisao: 'recusar' })
anota((await ver('/api/maia/aprendizado', { acao: 'painel' })).propostas.find(p => p.id === pend.id).status === 'recusada', 'a equipe recusou a proposta')

// ---------- as telas ----------
const tela = await fetch(URL_ + '/maia/operacao/aprendizado.html')
const gancho = await fetch(URL_ + '/maia/operacao/aprendizado-gancho.js')
anota(tela.ok && gancho.ok, 'a página do aprendizado e o gancho do painel abrem')
anota((await fetch(URL_ + '/api/maia/aprendizado?acao=painel')).status === 401, 'sem senha: 401')

const falhas = rel.filter(r => !r.ok)
log(`\n${rel.length - falhas.length} de ${rel.length} ok` + (falhas.length ? '\nFALHOU:\n' + falhas.map(f => ' - ' + f.o).join('\n') : ''))
process.exit(falhas.length ? 1 : 0)
