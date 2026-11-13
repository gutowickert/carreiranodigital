// Maia: o teste da parte administrativa (13/11, lib/maia/cobranca.ts). Roda os módulos direto, sem servidor, em MODO LOCAL
// (arquivos em .maia-teste/cobranca) e SEM a chave do Asaas: as cobranças são simuladas (tabela local asaas_sim).
// Nada sai pro Asaas nem pro banco da escola de verdade.
// Uso: node scripts/maia-teste-cobranca.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
const PASTA = '.maia-teste/cobranca'
fs.rmSync(path.join(RAIZ, PASTA), { recursive: true, force: true })
Object.assign(process.env, { MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: PASTA, MAIA_SEM_AVISO: '1', ANTHROPIC_API_KEY: 'teste' })
delete process.env.ASAAS_API_KEY; delete process.env.VERCEL; delete process.env.MAIA_CONTA_ASAAS
// nada pode sair pra internet
globalThis.fetch = async (u) => { throw new Error('o teste não deixa sair pra ' + String(u).slice(0, 60)) }

const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const { maiaDb: db } = await jiti.import(path.join(RAIZ, 'lib/maia/db.ts'))
const C = await jiti.import(path.join(RAIZ, 'lib/maia/cobranca.ts'))
const { escola } = await jiti.import(path.join(RAIZ, 'lib/maia/escola.ts'))

let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra) } }
const erroDe = async (fn) => { try { await fn(); return null } catch (e) { return String(e.message || e) } }
const D = 86400e3
const dia = (iso) => new Date(iso + 'T15:00:00Z')            // meio-dia de Brasília
const mais = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * D).toISOString().slice(0, 10)
const hoje = C.hojeBR()
const neg0 = async (nome, fone) => db.insere('negocios', { nome, nicho: 'teste', cidade: 'Lajeado', dono_nome: 'Ana', dono_whatsapp: fone, plano: 'completa' })
const lancs = async (projeto) => (await escola.lista('lancamentos_empresa', { grupo_recorrencia: projeto }))
const avisos = async (negId) => (await db.lista('eventos', { tipo: 'aviso_equipe', negocio_id: negId })).filter(e => /cobrança atrasada/.test(e.detalhe?.titulo || ''))

console.log('1) O cliente no CRM da escola')
let neg = await neg0('Ótica Teste', '5551999990001')
confere('CPF inválido não liga', /CPF ou CNPJ/.test(await erroDe(() => C.ligaCliente(neg.id, { documento: '123', email: 'a@b.com' })) || ''))
confere('e-mail inválido não liga', /e-mail/.test(await erroDe(() => C.ligaCliente(neg.id, { documento: '52998224725', email: 'sem-arroba' })) || ''))
const r1 = await C.ligaCliente(neg.id, { documento: '529.982.247-25', email: 'Dono@Otica.com' })
const proj = await escola.um('projetos', { id: r1.projeto_id })
confere('cria o contrato no CRM com produto Maia, R$ 997 e sem cobrar ainda', proj?.produto === 'maia' && proj.mensalidade_valor === 997 && proj.cobranca_desde == null && proj.status === 'manutencao', JSON.stringify(proj))
confere('e o cadastro em Clientes do CRM (instalacoes, tipo cliente)', (await escola.lista('instalacoes', { projeto_id: r1.projeto_id })).some(i => i.tipo === 'cliente' && i.nome === 'Ótica Teste'))
neg = await db.um('negocios', { id: neg.id })
confere('o negócio guarda o projeto em meta.financeiro (sem coluna nova)', neg.meta?.financeiro?.projeto_id === r1.projeto_id && neg.meta.financeiro.documento === '52998224725' && neg.meta.financeiro.email === 'dono@otica.com')
await C.ligaCliente(neg.id, { documento: '52998224725', email: 'dono@otica.com' })
confere('ligar de novo não cria outro contrato', (await escola.lista('projetos')).length === 1)
const outro = await neg0('ótica teste', '5551999990002')
const r2 = await C.ligaCliente(outro.id, { documento: '52998224725', email: 'x@y.com' })
confere('mesmo nome em Clientes do CRM: liga no que já existe', r2.projeto_id === r1.projeto_id && (await escola.lista('projetos')).length === 1)

console.log('2) A implantação (avulsa)')
const semCrm = await neg0('Sem CRM', '5551999990003')
confere('não cobra antes de ligar no CRM', /liga o cliente/.test(await erroDe(() => C.cobraImplantacao(semCrm.id, { vence: hoje })) || ''))
confere('vencimento antes de hoje não vale', /antes de hoje/.test(await erroDe(() => C.cobraImplantacao(neg.id, { vence: mais(hoje, -1) })) || ''))
const imp = await C.cobraImplantacao(neg.id, { vence: hoje })
confere('gera a cobrança de R$ 497 com o link da fatura (simulada)', imp.valor === 497 && /^https:\/\//.test(imp.link || '') && imp.simulado === true, JSON.stringify(imp))
const proj2 = await escola.um('projetos', { id: r1.projeto_id })
confere('o contrato ganha o valor e o vencimento da implantação (o motor da escola cria o previsto)', proj2.valor_implantacao === 497 && proj2.implantacao_vence_em === hoje)
const imp2 = await C.cobraImplantacao(neg.id, { vence: hoje })
confere('pedir de novo devolve a mesma cobrança, não cria outra', imp2.ja === true && (await db.lista('asaas_sim')).length === 1)
neg = await db.um('negocios', { id: neg.id })
let r = await C.confereNegocio(neg, dia(hoje))
confere('antes de pagar: implantação "a pagar", nada no financeiro', r.situacao.implantacao.status === 'pendente' && (await lancs(r1.projeto_id)).length === 0)
await C.simulaPagamento(neg, 'implantacao', dia(hoje))
r = await C.confereNegocio(await db.um('negocios', { id: neg.id }), dia(hoje))
let ls = await lancs(r1.projeto_id)
confere('pagou: baixa no financeiro (realizado, R$ 497, não recorrente)', ls.length === 1 && ls[0].status === 'realizado' && ls[0].valor === 497 && ls[0].recorrente === false && r.situacao.implantacao.status === 'paga', JSON.stringify(ls))
await C.confereNegocio(await db.um('negocios', { id: neg.id }), dia(hoje))
confere('conferir de novo não lança duas vezes', (await lancs(r1.projeto_id)).length === 1)

console.log('3) A mensalidade (assinatura com a data do 1º encontro)')
const primeira = mais(hoje, 5)
confere('1ª mensalidade antes de hoje não vale', /antes de hoje/.test(await erroDe(() => C.abreAssinatura(neg.id, { primeira: mais(hoje, -3) })) || ''))
const ass = await C.abreAssinatura(neg.id, { primeira })
const proj3 = await escola.um('projetos', { id: r1.projeto_id })
confere('abre a assinatura e o contrato passa a cobrar: dia, desde e valor', ass.dia === Number(primeira.slice(8, 10)) && proj3.mensalidade_dia === ass.dia && proj3.cobranca_desde === primeira && proj3.mensalidade_valor === 997 && proj3.status === 'ativo', JSON.stringify(proj3))
confere('não abre duas assinaturas', /já está aberta/.test(await erroDe(() => C.abreAssinatura(neg.id, { primeira })) || ''))
// o motor da escola (lib/mensalidades.ts) já teria criado o previsto deste mês: a baixa tem que ATUALIZAR, não criar outro
await escola.insere('lancamentos_empresa', { org_id: '00000000-0000-0000-0000-0000000000cd', tipo: 'receita', categoria: 'mensalidade_cliente', unidade: 'geral', descricao: 'Mensalidade Ótica Teste', valor: 997, mes_referencia: primeira.slice(0, 8) + '01', data_vencimento: primeira, status: 'previsto', recorrente: true, grupo_recorrencia: r1.projeto_id })
r = await C.confereNegocio(await db.um('negocios', { id: neg.id }), dia(primeira))
confere('no dia do vencimento, sem pagar: ainda não avisa', (await avisos(neg.id)).length === 0 && r.situacao.mensalidade.status === 'em_dia', JSON.stringify(r.situacao.mensalidade))
const depois = mais(primeira, 1)
r = await C.confereNegocio(await db.um('negocios', { id: neg.id }), dia(depois))
confere('no dia seguinte ao vencimento: avisa a equipe (urgente), com o link', (await avisos(neg.id)).length === 1 && /venceu em/.test((await avisos(neg.id))[0].detalhe.texto) && /https:\/\//.test((await avisos(neg.id))[0].detalhe.texto) && r.situacao.mensalidade.status === 'atrasada')
await C.confereNegocio(await db.um('negocios', { id: neg.id }), new Date(dia(depois).getTime() + 3600e3))
await C.confereNegocio(await db.um('negocios', { id: neg.id }), dia(mais(primeira, 3)))
confere('a rotina de hora em hora não repete o aviso da mesma cobrança', (await avisos(neg.id)).length === 1)
confere('a Maia não é desligada: o negócio segue como estava', (await db.um('negocios', { id: neg.id })).status === neg.status)
await C.simulaPagamento(await db.um('negocios', { id: neg.id }), 'mensalidade', dia(mais(primeira, 3)))
r = await C.confereNegocio(await db.um('negocios', { id: neg.id }), dia(mais(primeira, 3)))
ls = (await lancs(r1.projeto_id)).filter(l => l.recorrente === true)
confere('pagou atrasado: o previsto do motor vira realizado (um lançamento só no mês)', ls.length === 1 && ls[0].status === 'realizado' && ls[0].data_pagamento === mais(primeira, 3), JSON.stringify(ls))
confere('e a mensalidade volta a "em dia", com a próxima', r.situacao.mensalidade.status === 'em_dia' && r.situacao.mensalidade.proxima > primeira, JSON.stringify(r.situacao.mensalidade))
await C.confereNegocio(await db.um('negocios', { id: neg.id }), dia(mais(primeira, 4)))
confere('depois de pago, não avisa mais', (await avisos(neg.id)).length === 1)
// o mês seguinte venceu sem pagar: novo aviso (uma cobrança nova)
const prox = r.situacao.mensalidade.proxima
await C.confereNegocio(await db.um('negocios', { id: neg.id }), dia(mais(prox, 1)))
confere('o mês seguinte, vencido: um aviso novo (só dessa cobrança)', (await avisos(neg.id)).length === 2)

console.log('4) A rotina e o painel')
const tudo = await C.confereCobrancas(dia(mais(prox, 2)))
confere('a rotina confere todos os negócios ligados, sem erro', tudo.negocios >= 1 && !tudo.feitos.some(f => f.erro), JSON.stringify(tudo))
const sit = C.situacaoDo(await db.um('negocios', { id: neg.id }))
confere('o painel recebe a situação (ligado, implantação, assinatura, simulado) sem ir no Asaas', sit.ligado && sit.implantacao?.valor === 497 && sit.assinatura?.dia === ass.dia && sit.situacao?.mensalidade?.status === 'atrasada' && sit.simulado === true, JSON.stringify(sit))
const semNada = await neg0('Sem cobrança', '5551999990009')
confere('negócio sem cobrança não entra na conferência', (await C.confereNegocio(semNada, new Date())) === null)

console.log(`\n${ok} de ${ok + falha} conferências passaram.`)
process.exit(falha ? 1 : 0)
