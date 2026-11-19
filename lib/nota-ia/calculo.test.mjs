// Testes da conta do quiz /nota-ia. Rodar: node --test lib/nota-ia/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Q from '../../public/nota-ia/calculo.js'

const base = { ramo: 'comercio', tamanho: '2a5', origem: ['indicacao', 'instagram'], whats: 'eu_quando_da', some: 'as_vezes', organiza: 'caderno', conteudo: 'eu_sobra', ticket: '100a500', ia: 'as_vezes', objetivo: 'clientes', jeito: 'aprender', regiao: 'lajeado' }

test('referência é a nota do perfil típico e fica em "começando"', () => {
  assert.equal(Q.REFERENCIA, 39)
  assert.equal(Q.calcular(base).nota, 39)
})

test('nota mínima 0 e máxima 100', () => {
  const pior = { ...base, origem: [], whats: 'sem_resposta', some: 'quase_sempre', organiza: 'cabeca', conteudo: 'ninguem', ia: 'nao' }
  assert.equal(Q.calcular(pior).nota, 0)
  const melhor = { ...base, origem: ['indicacao', 'passa', 'instagram', 'google', 'anuncio'], verba: 'mais2000', whats: 'rapido', some: 'raro', organiza: 'sistema', conteudo: 'semana', ia: 'dia_a_dia' }
  assert.equal(Q.calcular(melhor).nota, 100)
  assert.equal(Q.calcular(melhor).faixa.id, 'na_frente')
})

test('faixas nos limites', () => {
  assert.equal(Q.faixa(39).id, 'comecando')
  assert.equal(Q.faixa(40).id, 'no_caminho')
  assert.equal(Q.faixa(69).id, 'no_caminho')
  assert.equal(Q.faixa(70).id, 'na_frente')
})

test('a verba só conta pra quem marcou anúncio', () => {
  assert.equal(Q.partes({ ...base, verba: 'mais2000' }).captacao, 7)
  assert.equal(Q.partes({ ...base, origem: ['anuncio'], verba: 'mais2000' }).captacao, 8)
  assert.deepEqual(Q.faltando({ ...base, origem: ['anuncio'] }), ['verba'])
  assert.deepEqual(Q.faltando(base), [])
})

test('faltando acusa resposta inválida', () => {
  assert.deepEqual(Q.faltando({ ...base, whats: 'xyz' }), ['whats'])
  assert.deepEqual(Q.faltando({ ...base, origem: [] }), ['origem'])
})

test('perda: conta do perfil base confere com as premissas', () => {
  const p = Q.perda(base)
  // WhatsApp 8*0.5=4 · conteúdo 3*0.6=1.8 · organização 2*1.5*0.7=2.1 → 7.9 → 8 h/semana
  assert.equal(p.horasSemana, 8)
  assert.equal(p.horasMes, 34)
  // 80 contatos · 24 somem · 2.4 voltam + 1.6 pela demora = 4 vendas × R$ 250
  assert.equal(p.somem, 24)
  assert.equal(p.vendasMes, 4)
  assert.equal(p.valorMes, 1000)
})

test('perda: quem responde rápido não ganha venda pela demora', () => {
  const p = Q.perda({ ...base, whats: 'rapido', some: 'raro', tamanho: 'so_eu' })
  // 40 contatos · 4 somem · 0.4 volta → 0.5 venda
  assert.equal(p.vendasMes, 0.5)
})

test('oportunidades: 3, em ordem, sem repetir', () => {
  const o = Q.oportunidades({ ...base, organiza: 'cabeca', objetivo: 'organizar', some: 'quase_sempre' })
  assert.equal(o.length, 3)
  assert.equal(o[0].id, 'organizacao')
  assert.equal(o[1].id, 'retomada')
  assert.equal(new Set(o.map(x => x.id)).size, 3)
})

test('caminho: aprender no RS vai pro Deu Venda', () => {
  assert.equal(Q.caminho(base).principal, 'deu_venda')
  assert.equal(Q.calcular(base).turma, 'deuvendalajeado')
  assert.equal(Q.calcular({ ...base, regiao: 'poa' }).turma, 'deuvendaportoalegre')
})

test('caminho: quer que façam vai pra Maia (sem turma)', () => {
  const c = Q.calcular({ ...base, jeito: 'fazer' })
  assert.equal(c.caminho.principal, 'maia')
  assert.equal(c.turma, null)
})

test('caminho: aprender fora do RS vai pra Maia', () => {
  assert.equal(Q.caminho({ ...base, regiao: 'fora' }).principal, 'maia')
})

test('caminho: empresa grande e desorganizada vai pro OS, com o outro junto', () => {
  const c = Q.caminho({ ...base, tamanho: '6mais', organiza: 'planilha', jeito: 'fazer' })
  assert.equal(c.principal, 'os')
  assert.equal(c.complemento, 'maia')
  assert.equal(Q.calcular({ ...base, tamanho: '6mais' }).turma, 'teunegociooscheckup')
})

test('caminho: time pequeno desorganizado ganha o OS como complemento', () => {
  const c = Q.caminho(base)
  assert.equal(c.principal, 'deu_venda')
  assert.equal(c.complemento, 'os')
  assert.equal(Q.caminho({ ...base, tamanho: 'so_eu' }).complemento, null)
  assert.equal(Q.caminho({ ...base, organiza: 'sistema', tamanho: '6mais' }).principal, 'deu_venda')
})

test('mensagem do WhatsApp leva nota, dor e caminho, sem preço', () => {
  const res = Q.calcular(base)
  const m = Q.mensagemWhats(base, res)
  assert.match(m, /deu 39 \(começando\)/)
  assert.match(m, /Deu Venda com teunegócio OS/)
  assert.ok(!/R\$/.test(m))
})

test('registro do CRM preenche os campos do card', () => {
  const res = Q.calcular(base)
  const reg = Q.registroCRM(base, res, { variante: 'a' })
  assert.equal(reg.campos.negocio, 'Loja ou comércio')
  assert.equal(reg.campos.investimento_marketing, 'Não anuncia')
  assert.equal(reg.qualificacao.nota, 39)
  assert.equal(reg.qualificacao.variante, 'a')
  assert.ok(reg.resumo.startsWith('Quiz Nota de IA: nota 39/100'))
  assert.match(reg.texto, /Respostas:/)
})

test('telefone', () => {
  assert.equal(Q.telefoneBR('(51) 99505-4548'), '5551995054548')
  assert.equal(Q.telefoneBR('5551995054548'), '5551995054548')
  assert.equal(Q.telefoneBR('123'), null)
})

test('nenhum texto do quiz fala preço', () => {
  const tudo = JSON.stringify(Q.PRODUTOS) + JSON.stringify(Q.oportunidades({ ...base, origem: ['anuncio'], verba: 'ate500' }))
  assert.ok(!/R\$|497|797/.test(tudo))
})
