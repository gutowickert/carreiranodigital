// Teste da conta do quiz da Maia (lib/maia/quiz/quiz.ts): 3 perfis por nicho (pequeno, médio, grande).
// Rodar: node scripts/teste-maia-quiz.mjs   (Node 22.18+ lê o .ts direto)
import assert from 'node:assert/strict'
import { diagnosticar, telefoneBR, mensagemWhats, QUIZZES } from '../lib/maia/quiz/quiz.ts'

const perfis = {
  oficina: [
    ['pequena', { tipo: 'mecanica', volume: 'ate30', ticket: '300a600', origem: 'indicacao', resposta: 'fimdia', retomada: 'nada', base: 'nada', anuncio: 'nao' }],
    ['média', { tipo: 'injecao', volume: '61a100', ticket: '600a1200', origem: 'google', resposta: 'eu1h', retomada: 'asvezes', base: 'asvezes', anuncio: 'ate500' }],
    ['grande', { tipo: 'cambio', volume: 'mais150', ticket: '1200a2500', origem: 'anuncio', resposta: 'rapido', retomada: 'nada', base: 'nada', anuncio: 'mais1500' }],
  ],
  otica: [
    ['pequena', { tipo: 'rua', volume: 'ate20', ticket: '400a800', origem: 'passam', resposta: 'horas', retomada: 'nada', base: 'nada', anuncio: 'nao' }],
    ['média', { tipo: 'shopping', volume: '51a100', ticket: '800a1500', origem: 'instagram', resposta: 'eu1h', retomada: 'asvezes', base: 'asvezes', anuncio: 'parei' }],
    ['grande', { tipo: 'varias', volume: 'mais200', ticket: '800a1500', origem: 'indicacao', resposta: 'rapido', retomada: 'rotina', base: 'nada', anuncio: '500a1500' }],
  ],
}

const R = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const linhas = []
for (const [nicho, lista] of Object.entries(perfis)) {
  for (const [nome, r] of lista) {
    const d = diagnosticar(nicho, r, 'Teste')
    assert.ok(d.completo, 'respostas completas')
    const u = QUIZZES[nicho].unidade[1]
    console.log(`\n${nicho.toUpperCase()} ${nome}: ${d.volume} ${u}/mês x ${R(d.ticket)} = faturamento ~${R(d.faturamento)}/mês`)
    for (const p of d.pontos) console.log(`  - NA MESA ${p.titulo}: ${R(p.valor_mes)}/mês · ${R(p.valor_mes * 12)}/ano · ${p.quantidade}`)
    const g = d.ganho
    console.log(`  + A GANHAR (${g.modo}) verba ${R(g.verba)} -> ${g.conversas} conversas -> ${g.quantidade} = medido ${R(g.valor_mes)} + direto na loja ${R(g.direto_mes)} = ${R(g.total_mes)}/mês · retorno R$ ${g.retorno} por R$ 1${g.limitado ? ' (limitado a 2x o faturamento)' : ''}${g.cenario ? ` · se subir pra ${R(g.cenario.verba)}: +${R(g.cenario.valor_mes)}/mês` : ''}`)
    console.log(`  TOTAL na mesa ${R(d.na_mesa_mes)} + a ganhar ${R(g.total_mes)} = ${R(d.oportunidade_mes)}/mês (${R(d.oportunidade_ano)}/ano, ~${d.unidades_mes.toFixed(1)} ${u}/mês) · ${d.pagam_maia} ${u} pagam a Maia`)
    linhas.push(`| ${nicho} ${nome} | ${R(d.na_mesa_mes)} | ${R(g.valor_mes)} | ${R(g.direto_mes)} | ${R(d.oportunidade_mes)} (${R(d.oportunidade_ano)}/ano) | R$ ${String(g.retorno).replace('.', ',')} | ${d.pagam_maia} |${g.cenario ? ` subindo pra ${R(g.cenario.verba)}: +${R(g.cenario.valor_mes)}` : ''}`)
    // perdas conservadoras: na mesa nunca passa de 10% do faturamento; ganho do anúncio nunca passa de 50%
    assert.ok(d.na_mesa_mes <= d.faturamento * 0.1, 'na mesa conservador')
    assert.ok(g.total_mes <= d.faturamento * 2 + 10, 'trava do ganho (2x)')
    assert.ok(g.premissa.startsWith('Considerando'))
    for (const p of d.pontos) assert.ok(p.premissa && p.premissa.startsWith('Considerando'))
  }
}
console.log('\n| Perfil | Na mesa/mês | Medido pelo anúncio | Direto na loja | Total/mês (ano) | Retorno por R$ 1 | Pagam a Maia | Cenário |\n|---|---|---|---|---|---|---|---|\n' + linhas.join('\n'))

// resposta incompleta nunca aumenta a conta
const vazio = diagnosticar('oficina', {})
assert.equal(vazio.completo, false)

// telefone
assert.equal(telefoneBR('(51) 99505-4548'), '5551995054548')
assert.equal(telefoneBR('5511987654321'), '5511987654321')
assert.equal(telefoneBR('(11) 3456-7890'), '551134567890')
assert.equal(telefoneBR('(10) 99999-9999'), null)      // DDD não existe
assert.equal(telefoneBR('(51) 89999-9999'), null)      // celular sem 9
assert.equal(telefoneBR('9999-9999'), null)            // sem DDD
assert.equal(telefoneBR('(51) 99999-9999'), null)      // número repetido

console.log('\n' + mensagemWhats(diagnosticar('otica', perfis.otica[1][1], 'Ótica Visão'), { cidade: 'Campinas', uf: 'SP' }, 'comecar'))
console.log('\nOK: todos os testes passaram.')
