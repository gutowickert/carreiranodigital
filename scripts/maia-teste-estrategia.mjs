// Maia: o teste do CICLO DE ESTRATÉGIA DE 15 DIAS e do CALENDÁRIO (22/11, lib/maia/estrategia.ts e lib/maia/sazonalidade.ts).
// Roda os módulos direto, sem servidor, em MODO LOCAL (arquivos em .maia-teste/estrategia), com a IA SIMULADA pela rede do
// ensaio (scripts/maia-ensaio-rede.mjs: nada sai pra internet). Todo telefone de teste começa com 55000 (nunca sai pra Meta).
// Confere: o ciclo dispara no dia certo (1 e 16, 9h), a proposta traz a data certa de cada ramo (e nada proibido),
// nada vai pro dono sem a equipe aprovar, o dono aprova pelo WhatsApp e pelo painel, e o histórico guarda (com o resultado).
// Uso: node scripts/maia-teste-estrategia.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
const PASTA = '.maia-teste/estrategia'
fs.rmSync(path.join(RAIZ, PASTA), { recursive: true, force: true })
Object.assign(process.env, { MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: PASTA, MAIA_SEM_AVISO: '1', MAIA_SEM_IA_MIDIA: '1', ANTHROPIC_API_KEY: 'ia-falsa', MAIA_PAINEL_SENHA: 'teste-estrategia' })
delete process.env.MAIA_ESTRATEGIA_LIGADA
delete process.env.MAIA_META_REAL
delete process.env.MAIA_CLIENTES_LIGADO
process.chdir(RAIZ)
await import('./maia-ensaio-rede.mjs')

const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const imp = (f) => jiti.import(path.join(RAIZ, f))
const { maiaDb: db } = await imp('lib/maia/db.ts')
const S = await imp('lib/maia/sazonalidade.ts')
const E = await imp('lib/maia/estrategia.ts')
const D_ = await imp('lib/maia/dono.ts')
const C = await imp('lib/maia/canal.ts')
const PD = await imp('lib/maia/painel-dono.ts')
const ROT = await imp('lib/maia/rotina.ts')
const F = await imp('lib/maia/funil.ts')

let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra ? '→ ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '') } }
const erroDe = async (fn) => { try { await fn(); return null } catch (e) { return String(e.message || e) } }
const etapa = (t) => console.log('\n' + t)
let seq = 0
const wid = () => 'teste-in-' + Date.now() + '-' + (++seq)
const as9 = (dia) => new Date(dia + 'T12:00:00Z')   // 9h em Brasília
const msgsDono = async (neg) => { const cv = await C.conversaDoDono(neg); return (await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })).map(m => m.texto) }
const ids = (l) => l.map(x => x.id)
const est = async (id) => db.um('estrategias', { id })

etapa('1) O calendário: as contas de data')
confere('Páscoa 2026 = 05/04 e 2027 = 28/03', S.pascoa(2026) === '2026-04-05' && S.pascoa(2027) === '2027-03-28')
const carnaval = S.DATAS.find(d => d.id === 'carnaval').dia(2026)
confere('Carnaval 2026 = 17/02 (47 dias antes da Páscoa)', carnaval === '2026-02-17', carnaval)
confere('Dia das Mães 2026 = 10/05 e Dia dos Pais = 09/08 (2º domingo)', S.DATAS.find(d => d.id === 'dia_maes').dia(2026) === '2026-05-10' && S.DATAS.find(d => d.id === 'dia_pais').dia(2026) === '2026-08-09')
confere('Black Friday 2026 = 27/11 (sexta depois da 4ª quinta)', S.DATAS.find(d => d.id === 'black_friday').dia(2026) === '2026-11-27')
confere('o dia escrito de 3 jeitos', JSON.stringify(S.leDia('25/12')) === JSON.stringify({ mes: 12, dia: 25, ano: null }) && S.leDia('12-25')?.dia === 25 && S.leDia('2027-03-15')?.ano === 2027 && S.leDia('31/02') === null && S.leDia('natal') === null)

etapa('2) O ramo do negócio (o nicho é texto livre)')
const g = (n) => S.gruposDoNicho(n).join(',')
confere('lotérica', g('Lotérica') === 'loterica')
confere('advocacia', g('Advocacia trabalhista e previdenciária') === 'advocacia')
confere('estética automotiva é oficina, não beleza', g('estética automotiva') === 'oficina', g('estética automotiva'))
confere('clínica de estética é estética', g('Clínica de estética') === 'estetica', g('Clínica de estética'))
confere('oficina mecânica', g('oficina mecânica') === 'oficina')
confere('doceria é alimentação', g('doceria') === 'alimentacao')
confere('gravação a laser / presentes personalizados é varejo', g('gravação a laser, presentes personalizados') === 'varejo')
confere('psicologia e odontologia são saúde', g('psicologia') === 'saude' && g('odontologia') === 'saude')
confere('ramo desconhecido: datas gerais do comércio', g('metalúrgica') === 'geral' && g('') === 'geral')

etapa('3) As datas que pesam, por ramo, com a antecedência certa (hoje 22/11/2026)')
const HOJE = '2026-11-22'
const lot = S.datasDaVez({ nicho: 'lotérica' }, HOJE)
const megaV = lot.pesam.find(d => d.id === 'mega_virada')
confere('lotérica: a Mega da Virada pesa, com bolão desde meados de novembro (16/11)', !!megaV && megaV.inicio === '2026-11-16' && megaV.atrasada === true, lot.pesam)
confere('lotérica: sem Natal, sem Black Friday, sem Dia das Mães', !lot.pesam.concat(lot.radar).some(d => ['natal', 'black_friday', 'dia_maes'].includes(d.id)))
confere('lotérica: cuidados (nunca prometer prêmio, nunca vender pelo WhatsApp)', lot.cuidados.some(c => /prometer prêmio/.test(c)) && lot.cuidados.some(c => /vender nem cobrar pelo WhatsApp/.test(c)))
const var_ = S.datasDaVez({ nicho: 'gravação a laser, presentes' }, HOJE)
const natal = var_.pesam.find(d => d.id === 'natal')
confere('varejo: o Natal pesa e o anúncio começa 4 semanas antes (27/11)', !!natal && natal.inicio === '2026-11-27' && natal.antecedencia === 28 && !natal.atrasada, natal)
confere('varejo: a Black Friday (27/11) pesa e já devia ter começado', var_.pesam.some(d => d.id === 'black_friday' && d.atrasada))
confere('varejo: o 13º (30/11) pesa', var_.pesam.some(d => d.id === 'decimo_terceiro'))
confere('a frase diz a data, o porquê e a antecedência', /^Natal \(25\/12\): a maior data do comércio.*4 semanas antes, em 27\/11/.test(S.fraseDaData(natal, HOJE)), S.fraseDaData(natal, HOJE))
const adv = S.datasDaVez({ nicho: 'advocacia' }, HOJE)
confere('advocacia: nenhuma data comercial (Black Friday, Natal, 13º)', !adv.pesam.concat(adv.radar).some(d => ['black_friday', 'natal', 'decimo_terceiro', 'dia_consumidor'].includes(d.id)), adv.pesam.concat(adv.radar).map(d => d.id))
confere('advocacia: regras da OAB nos cuidados', adv.cuidados.some(c => /OAB/.test(c) && /promessa de resultado/.test(c)))
const adv2 = S.datasDaVez({ nicho: 'advocacia' }, '2026-12-28')
confere('advocacia em 28/12: começo de ano e demissões de janeiro pesam', adv2.pesam.some(d => d.id === 'comeco_ano') && adv2.pesam.some(d => d.id === 'trabalhista_janeiro'), adv2.pesam.map(d => d.id))
const adv3 = S.datasDaVez({ nicho: 'advocacia' }, '2027-03-20')
confere('advocacia em 20/03: o Imposto de Renda pesa (temporada aberta)', adv3.pesam.some(d => d.id === 'imposto_renda' && !d.atrasada))
const ofi = S.datasDaVez({ nicho: 'oficina mecânica' }, '2026-06-01')
confere('oficina em 01/06: o inverno e a chuva pesam (check-up de inverno)', ofi.pesam.some(d => d.id === 'inverno' && /bateria/.test(d.dica)), ofi.pesam.map(d => d.id))
const ofi2 = S.datasDaVez({ nicho: 'oficina mecânica' }, '2026-12-05')
confere('oficina em 05/12: revisão antes de viajar pras férias de verão', ofi2.pesam.some(d => d.id === 'ferias_verao' && /revisão antes de viajar/.test(d.dica)))
const doce = S.datasDaVez({ nicho: 'doceria' }, '2027-02-20')
const pas = doce.pesam.find(d => d.id === 'pascoa')
confere('doceria: a Páscoa 2027 (28/03) abre encomenda 5 semanas antes (21/02)', !!pas && pas.inicio === '2027-02-21' && pas.antecedencia === 35, pas || doce.pesam)
const psi = S.datasDaVez({ nicho: 'psicologia' }, '2026-09-01')
confere('saúde: Setembro Amarelo só como conteúdo, nunca pra vender', psi.pesam.some(d => d.id === 'setembro_amarelo' && /nunca usar pra vender/.test(d.dica)))
const est_ = S.datasDaVez({ nicho: 'clínica de estética' }, '2026-11-15')
confere('estética: formaturas e casamentos de dezembro pesam', est_.pesam.some(d => d.id === 'formaturas'))
confere('lotérica em 20/08: a Lotofácil da Independência pesa', S.datasDaVez({ nicho: 'lotérica' }, '2026-08-20').pesam.some(d => d.id === 'lotofacil_independencia'))
const prop = S.datasDaVez({ nicho: 'doceria', contexto: { calendario: { datas: [{ nome: 'Aniversário da loja', dia: '20/12', antecedencia_dias: 21 }, { nome: 'Data ruim', dia: 'qualquer' }] } } }, HOJE)
confere('data própria do negócio entra no calendário (e a inválida fica de fora)', prop.pesam.some(d => d.propria && d.nome === 'Aniversário da loja' && d.inicio === '2026-11-29') && !prop.pesam.concat(prop.radar).some(d => d.nome === 'Data ruim'))

etapa('4) O ciclo: quinzenas e dias de revisar')
confere('22/11 está na quinzena 16 a 30/11', JSON.stringify(E.cicloDoDia('2026-11-22')) === JSON.stringify({ de: '2026-11-16', ate: '2026-11-30' }))
confere('03/02 está na quinzena 01 a 15/02; fevereiro bissexto vai até 29', E.cicloDoDia('2026-02-03').ate === '2026-02-15' && E.cicloDoDia('2028-02-20').ate === '2028-02-29')
confere('a quinzena anterior à de 01/12 é 16 a 30/11', E.cicloAnterior({ de: '2026-12-01' }).de === '2026-11-16')
confere('revisa nos dias 1 e 16, não nos outros', E.diaDeRevisar('2026-12-01') && E.diaDeRevisar('2026-12-16') && !E.diaDeRevisar('2026-12-02') && !E.diaDeRevisar('2026-12-15'))

etapa('5) A chave: sem MAIA_ESTRATEGIA_LIGADA nada roda')
const lotNeg = await db.insere('negocios', { nome: 'Lotérica Trevo', nicho: 'lotérica', cidade: 'Lajeado', dono_nome: 'José Almeida', dono_whatsapp: '5500077770011', plano: 'completa', status: 'ativo', verba_dia: 30, contexto: { produto: 'jogos e bolões da Caixa' } })
confere('rotina desligada: nenhuma estratégia', (await E.rotinaEstrategia({ agora: as9('2026-11-22') })).length === 0 && (await db.lista('estrategias')).length === 0)
const rotDesl = await ROT.roda({ relogio: as9('2026-12-01') })
confere('a rotina geral nem chama a estratégia', rotDesl.estrategia === undefined && !rotDesl.estrategia_erro)
const pdDesl = await PD.dadosDoPainel(lotNeg)
confere('o painel do dono não mostra a estratégia desligada', pdDesl.estrategia?.ligada === false)
process.env.MAIA_ESTRATEGIA_LIGADA = '1'

etapa('6) A rotina dispara no dia e na hora certos')
confere('8h: ainda não', (await E.rotinaEstrategia({ agora: new Date('2026-11-22T11:00:00Z') })).length === 0)
let rr = await E.rotinaEstrategia({ agora: as9('2026-11-22') })
confere('negócio sem nenhuma estratégia: a INICIAL sai na 1ª rodada das 9h, mesmo fora do dia 1/16', rr.length === 1 && rr[0].negocio === lotNeg.id, rr)
const ini = (await db.lista('estrategias', { negocio_id: lotNeg.id }))[0]
confere('a inicial é da quinzena 16 a 30/11, esperando a equipe', ini.motivo === 'inicial' && ini.ciclo_de === '2026-11-16' && ini.ciclo_ate === '2026-11-30' && ini.status === 'aprovar_equipe', ini)
confere('9h de novo no mesmo dia: não duplica', (await E.rotinaEstrategia({ agora: as9('2026-11-22') })).length === 0)
confere('23/11 (não é dia 1 nem 16): não propõe', (await E.rotinaEstrategia({ agora: as9('2026-11-23') })).length === 0)
confere('a equipe foi avisada', (await db.lista('eventos', { tipo: 'aviso_equipe', negocio_id: lotNeg.id })).some(e => /estratégia da quinzena pra aprovar/.test(e.detalhe?.titulo || '')))

etapa('7) A proposta da lotérica traz a data certa e os cuidados')
confere('diz qual data pesou e por quê: Mega da Virada', /Datas que pesam agora:\n- Mega da Virada \(31\/12\): o maior prêmio do ano.*16\/11/.test(ini.texto), ini.texto)
confere('a ação da data: bolão da Mega da Virada', ini.proposta.acoes.some(a => a.tipo === 'sazonal' && a.data === 'mega_virada'))
confere('cuidados do ramo no texto (sem prometer prêmio, sem vender pelo WhatsApp, conferir na Caixa)', /Cuidados do teu ramo: nunca prometer prêmio/.test(ini.texto) && /vender nem cobrar pelo WhatsApp/.test(ini.texto) && /site da Caixa/.test(ini.texto))
confere('nada de Natal nem Black Friday pra lotérica', !/Natal|Black Friday/.test(ini.texto))
confere('o calendário que pesou fica guardado', ini.sazonal.hoje === '2026-11-22' && ini.sazonal.pesam.some(d => d.id === 'mega_virada'))
confere('a inicial começa pelo produto que entra primeiro', ini.proposta.acoes[0].tipo === 'comecar' && /jogos e bolões da Caixa/.test(ini.proposta.acoes[0].texto))

etapa('8) Nada vai pro dono sem a equipe aprovar')
confere('o dono ainda não recebeu a estratégia', !(await msgsDono(lotNeg)).some(t => /Estratégia/.test(t || '')))
confere('o dono não aprova antes da equipe (painel)', /não está esperando a tua aprovação/.test(await erroDe(() => E.donoAprovaEstrategia(lotNeg.id, ini.id, 'painel')) || ''))
confere('o 👍 solto do dono não aprova o que a equipe não viu', (await E.donoAprovaEstrategia(lotNeg.id, null, 'whatsapp')).length === 0 && (await est(ini.id)).status === 'aprovar_equipe')
await D_.recebeDoDono(lotNeg, { id: wid(), type: 'text', text: { body: '👍' } }, 'José')
await D_.respondeDono((await C.conversaDoDono(lotNeg)).id).catch(() => null)
confere('nem o "👍" escrito no WhatsApp', (await est(ini.id)).status === 'aprovar_equipe')
const pd0 = await E.painelDoDono(lotNeg)
confere('o painel do dono não mostra a proposta que a equipe ainda revisa', pd0.ligada && pd0.pendente === null && pd0.historico.length === 0)
confere('a equipe edita o texto antes de mandar', (await E.equipeEditaEstrategia(ini.id, ini.texto + '\nObs. da equipe: bolão com 10 cotas.', 'equipe')).texto.endsWith('10 cotas.'))
confere('texto curto demais não passa', /curto demais/.test(await erroDe(() => E.equipeEditaEstrategia(ini.id, 'oi', 'equipe')) || ''))
await E.equipeAprovaEstrategia(ini.id, 'equipe')
let e1 = await est(ini.id)
const ultDono = (await msgsDono(lotNeg)).slice(-1)[0] || ''
confere('aprovada pela equipe: vai pro WhatsApp do dono e espera o 👍', e1.status === 'aprovar_dono' && !!e1.wamid_dono && /Estratégia inicial do Lotérica Trevo/.test(ultDono) && /Topa seguir assim\?/.test(ultDono), ultDono)
confere('a equipe não aprova duas vezes', /não está esperando a equipe/.test(await erroDe(() => E.equipeAprovaEstrategia(ini.id, 'equipe')) || ''))
const pend = (await PD.dadosDoPainel(lotNeg)).esperando
confere('entra no "A Maia espera de ti" do painel', pend.some(x => x.tipo === 'estrategia' && x.estrategia_id === ini.id))

etapa('9) O dono pede ajuste (volta pra equipe) e depois aprova com 👍 em cima da mensagem')
const aj = await E.donoAjustaEstrategia(lotNeg.id, null, 'quero focar no bolão da Mega e não em anúncio novo', 'whatsapp')
e1 = await est(ini.id)
confere('o ajuste volta pra equipe, com o pedido do dono', aj.ok && e1.status === 'aprovar_equipe' && /o dono pediu: quero focar/.test(e1.nota))
confere('e o dono não consegue aprovar enquanto a equipe não aprovar de novo', /não está esperando/.test(await erroDe(() => E.donoAprovaEstrategia(lotNeg.id, ini.id, 'painel')) || ''))
await E.equipeAprovaEstrategia(ini.id, 'equipe')
e1 = await est(ini.id)
await D_.recebeDoDono(lotNeg, { id: wid(), type: 'reaction', reaction: { emoji: '👍', message_id: e1.wamid_dono } }, 'José')
e1 = await est(ini.id)
confere('o 👍 em cima da mensagem aprova (pelo WhatsApp)', e1.status === 'aprovada' && e1.aprovado_via === 'whatsapp' && !!e1.aprovado_dono_em)
confere('a Maia confirma pro dono', /Aprovado ✅ Passei a estratégia/.test((await msgsDono(lotNeg)).slice(-1)[0] || ''))
confere('a equipe recebe o que aplicar', (await db.lista('eventos', { tipo: 'aviso_equipe', negocio_id: lotNeg.id })).some(e => /dono aprovou a estratégia/.test(e.detalhe?.titulo || '') && /Aplicar: 1\./.test(e.detalhe?.texto || '')))
const atual = await E.estrategiaAtual(lotNeg)
confere('a ferramenta do WhatsApp mostra a estratégia que vale agora', atual.vigente?.quinzena === '16/11 a 30/11' && atual.esperando_o_dono === null)

etapa('10) Dia 1: a quinzena nova, e o histórico guarda o resultado da anterior')
rr = await E.rotinaEstrategia({ agora: as9('2026-12-01') })
const todas = await db.lista('estrategias', { negocio_id: lotNeg.id }, { ordem: 'criado_em' })
const nova = todas[todas.length - 1]
confere('dia 1 às 9h: sai a estratégia da quinzena 01 a 15/12', rr.length === 1 && nova.motivo === 'quinzena' && nova.ciclo_de === '2026-12-01' && nova.ciclo_ate === '2026-12-15' && nova.status === 'aprovar_equipe', rr)
confere('a anterior continua aprovada, agora com o resultado da quinzena dela', (await est(ini.id)).status === 'aprovada' && (await est(ini.id)).resultado?.de === '2026-11-16')
confere('a nova traz os números da quinzena que passou', /Como foram os últimos 15 dias:/.test(nova.texto) && nova.numeros?.de === '2026-11-16')
confere('no dia 1 a Mega da Virada ainda pesa', /Mega da Virada/.test(nova.texto))
confere('dia 2: não propõe', (await E.rotinaEstrategia({ agora: as9('2026-12-02') })).length === 0)
const rot16 = await ROT.roda({ relogio: as9('2026-12-16') })
const n16 = (await db.lista('estrategias', { negocio_id: lotNeg.id, ciclo_de: '2026-12-16' }))[0]
confere('dia 16 pela rotina geral: a da quinzena 16 a 31/12', Array.isArray(rot16.estrategia) && rot16.estrategia.length === 1 && n16?.ciclo_ate === '2026-12-31', rot16.estrategia || rot16.estrategia_erro)
confere('a de 01/12 que ninguém aprovou vira "substituída"', (await est(nova.id)).status === 'substituida')
const pe = await E.painelEquipe(lotNeg, as9('2026-12-16'))
confere('o painel da equipe mostra o histórico inteiro e o calendário', pe.disponivel && pe.estrategias.length === 3 && pe.calendario.pesam.some(d => d.id === 'mega_virada') && pe.calendario.cuidados.length >= 3)

etapa('11) Advocacia: regra da OAB e nada de data comercial')
const advNeg = await db.insere('negocios', { nome: 'Fachini Advocacia', nicho: 'advocacia trabalhista', cidade: 'Lajeado', dono_nome: 'Natália Fachini', dono_whatsapp: '5500077770022', plano: 'completa', status: 'ativo' })
const pa = await E.propoeEstrategia(advNeg, { agora: as9('2026-12-28') })
confere('em 28/12 pesam o começo de ano e as demissões de janeiro', /Começo de ano/.test(pa.texto) && /Demissões de janeiro/.test(pa.texto), pa.texto)
confere('cuidados da OAB e nenhuma data comercial nem recado de venda', /regras da OAB/.test(pa.texto) && !pa.datas.pesam.concat(pa.datas.radar).some(d => ['black_friday', 'natal', 'decimo_terceiro', 'decimo_terceiro_2', 'dia_consumidor'].includes(d.id)) && !pa.acoes.some(a => a.tipo === 'recado_base'), pa.texto)

etapa('12) Loja com vendas: estimula, já testa outra oferta, Natal e verba dentro do teto')
const loja = await db.insere('negocios', { nome: 'Wood Presentes', nicho: 'gravação a laser, presentes personalizados', cidade: 'Lajeado', dono_nome: 'Ana Segatto', dono_whatsapp: '5500077770033', plano: 'completa', status: 'ativo', verba_dia: 30, contexto: { mais_vendido: 'copo térmico personalizado', calendario: { datas: [] } } })
// vendas e gasto na quinzena que passou (01 a 15/11)
await db.insere('metricas_dia', { negocio_id: loja.id, dia: '2026-11-10', gasto: 120, conversas_iniciadas: 30 })
for (const [nome, valor] of [['Bia', 90], ['Caio', 180]]) {
  const l = await F.novoLead(loja.id, { nome, telefone: '55000888' + (++seq), produto: 'copo', origem: 'anuncio' }, 'teste')
  await F.ganhou(l, valor, 'copo', 'teste')
  await db.atualiza('leads', { id: l.id }, { criado_em: '2026-11-10T15:00:00.000Z', atualizado_em: '2026-11-10T15:00:00.000Z', ganho_em: '2026-11-10T16:00:00.000Z' })
  for (const ev of await db.lista('lead_eventos', { lead_id: l.id })) await db.atualiza('lead_eventos', { id: ev.id }, { criado_em: '2026-11-10T16:00:00.000Z' })
}
const pl = await E.propoeEstrategia(loja, { agora: as9('2026-11-16') })
confere('Natal pesa na loja (anúncio a partir de 27/11)', /Natal \(25\/12\)/.test(pl.texto) && pl.acoes.some(a => a.tipo === 'sazonal' && a.data === 'natal' || a.tipo === 'sazonal' && a.data === 'black_friday'), pl.texto)
confere('a oferta vende: mantém e já testa outra oferta', pl.acoes.some(a => a.tipo === 'testar_oferta'), pl.acoes)
const verba = pl.acoes.find(a => a.tipo === 'verba')
confere('verba sobe 30% durante a data, sem passar do teto', !!verba && /de R\$ 30 pra R\$ 39 por dia/.test(verba.texto), pl.acoes)
// data própria pelo dono (WhatsApp e painel chamam a mesma função)
const dp1 = await E.adicionaData(loja, { nome: 'Aniversário da loja', dia: '10/12', antecedencia_dias: 14 }, 'dono')
const dp2 = await E.adicionaData(loja, { nome: 'sem dia', dia: 'amanhã' }, 'dono')
confere('o dono põe uma data própria; dia inválido volta com a explicação', dp1.ok && dp1.total === 1 && !dp2.ok && /25\/12/.test(dp2.erro))
const pl2 = await E.propoeEstrategia(loja, { agora: as9('2026-11-16'), forcar: true, motivo: 'pedido' })
confere('a data própria entra na proposta seguinte', /Aniversário da loja/.test(pl2.texto), pl2.texto)
confere('a proposta anterior (ainda com a equipe) vira substituída', (await est(pl.estrategia.id)).status === 'substituida')
confere('a equipe tira a data', (await E.tiraData(loja, 0, 'equipe')).total === 0)

etapa('13) A análise de 2 dias: quando sugere mudar, diz a data que pesa')
const lin = E.linhaSazonalDaAnalise(loja, '2026-11-22')
confere('a linha da análise cita a data e quando começa', !!lin && /^Data que pesa agora: (Black Friday|Natal|13º)/.test(lin.texto), lin)
confere('ramo sem data na quinzena: sem linha', E.linhaSazonalDaAnalise({ nicho: 'advocacia' }, '2026-07-01') === null)

etapa('14) O painel do dono (aprovar e o histórico)')
await E.equipeAprovaEstrategia(n16.id, 'equipe')
const pd1 = await E.painelDoDono(lotNeg, as9('2026-12-16'))
confere('o painel do dono mostra a que espera ele (com o texto) e a vigente', pd1.pendente?.id === n16.id && /Mega da Virada/.test(pd1.pendente.texto) && pd1.historico[0]?.id === ini.id)
await E.donoAprovaEstrategia(lotNeg.id, n16.id, 'painel')
const pd2 = await E.painelDoDono(lotNeg, as9('2026-12-16'))
confere('aprovada pelo painel entra no histórico', (await est(n16.id)).aprovado_via === 'painel' && pd2.pendente === null && pd2.historico[0].id === n16.id && pd2.historico.length === 2)
confere('o dono não vê a nota interna da equipe', pd2.historico.every(h => h.nota === undefined))

console.log(`\n${ok} ok, ${falha} falha(s)`)
process.exit(falha ? 1 : 0)
