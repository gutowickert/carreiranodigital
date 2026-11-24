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
for (const [nicho, lista] of Object.entries(perfis)) {
  for (const [nome, r] of lista) {
    const d = diagnosticar(nicho, r, 'Teste')
    assert.ok(d.completo, 'respostas completas')
    const fat = d.volume * d.ticket
    console.log(`\n${nicho.toUpperCase()} ${nome}: ${d.volume} ${QUIZZES[nicho].unidade[1]}/mês x ${R(d.ticket)} = faturamento ~${R(fat)}/mês`)
    for (const p of d.pontos) console.log(`  - ${p.titulo}: ${p.valor_mes ? R(p.valor_mes) + '/mês · ' + p.quantidade : '(fora da conta)'}`)
    console.log(`  TOTAL ${R(d.total_mes)}/mês (${(d.total_mes / fat * 100).toFixed(1)}% do faturamento) · principal: ${d.principal.titulo}`)
    if (d.bem.length) console.log(`  já faz bem: ${d.bem.length}`)
    // conservador: a conta nunca passa de 10% do faturamento estimado
    assert.ok(d.total_mes <= fat * 0.1, 'conta conservadora (<= 10% do faturamento)')
    assert.ok(d.pontos.length >= 2 && d.pontos.length <= 4)
    for (const p of d.pontos) if (p.valor_mes > 0) assert.ok(p.premissa && p.premissa.startsWith('Considerando'))
  }
}

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
