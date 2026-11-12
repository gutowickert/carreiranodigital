// Maia: teste dos limites de segurança (12/11, lib/maia/limites.ts). Roda SEM IA (os freios agem antes da IA) e no modo local.
//
// Servidor (pasta limpa):
//   rm -rf .teste-maia-limites
//   PORT=3196 MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-maia-limites MAIA_PAINEL_SENHA=teste123 MAIA_SEM_AVISO=1 npx next start -p 3196
// Teste:
//   node scripts/maia-teste-limites.mjs http://localhost:3196 teste123 .teste-maia-limites
//
// O que confere: (1) teto de verba na criação e na ativação da campanha, e o teto do negócio sobrevive ao "salvar" do painel;
// (2) disjuntor do custo de IA do dia (cliente vai pra equipe, aviso só 1 vez, dono recebe 1 recado);
// (3) freio de enxurrada de contatos novos (e contato velho não conta).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const [URL = 'http://localhost:3196', SENHA = 'teste123', PASTA = '.teste-maia-limites'] = process.argv.slice(2)
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra) } }

async function api(acao, corpo = {}) {
  const r = await fetch(`${URL}/api/maia/operacao`, { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) })
  const j = await r.json().catch(() => ({}))
  return { ...j, http: r.status }
}
const arq = tab => path.join(PASTA, tab + '.json')
const le = tab => { try { return JSON.parse(fs.readFileSync(arq(tab), 'utf8')) } catch { return [] } }
const grava = (tab, l) => { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(arq(tab), JSON.stringify(l, null, 1)) }
const poe = (tab, linhas) => { const l = le(tab); for (const x of linhas) l.push(x); grava(tab, l) }
const agora = () => new Date().toISOString()
const dado = r => r.dados ?? r.data ?? r   // o formato da resposta do painel

async function novoNegocio(nome, fone, meta = {}) {
  const r = await api('criar_negocio', { nome, dono_whatsapp: fone, cidade: 'Estrela', verba_dia: 30, meta, contexto: { whatsapp: fone } })   // 12/11: campanha só nasce com o WhatsApp do negócio (ramo maia-regras-whatsapp)
  const n = dado(r)
  if (!n?.id) throw new Error('não criou o negócio: ' + JSON.stringify(r).slice(0, 200))
  return n
}

console.log('1) Teto de verba')
const n1 = await novoNegocio('TESTE · Limites Verba', '5500099990001', { ad_account_id: '123', page_id: '456', limites: { verba_max_dia: 50 } })
const peca = { id: crypto.randomUUID(), negocio_id: n1.id, tipo: 'anuncio_imagem', status: 'aprovada', titulo: 'Teste', texto: 'Teste', gancho: 'Teste', cta: 'Chama', midia_ids: [], versao: 1, aprovado_dono_em: agora(), criado_em: agora(), atualizado_em: agora() }
peca.arquivo_path = `${n1.id}/pecas/teste.jpg`
fs.mkdirSync(path.join(PASTA, 'arquivos', n1.id, 'pecas'), { recursive: true })
fs.writeFileSync(path.join(PASTA, 'arquivos', peca.arquivo_path), Buffer.from('arte de mentira'))
poe('pecas', [peca])
let r = await api('criar_campanha', { negocio_id: n1.id, verba_dia: 80 })
confere('campanha de R$ 80/dia com teto de R$ 50 é recusada', r.http >= 400 && /teto/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 200))
confere('nenhuma campanha foi gravada', le('campanhas').filter(c => c.negocio_id === n1.id).length === 0)
r = await api('criar_campanha', { negocio_id: n1.id, verba_dia: 40 })
const camp = dado(r)
confere('campanha de R$ 40/dia é criada, pausada', r.http < 400 && camp?.status === 'criada_pausada', JSON.stringify(r).slice(0, 200))
// o "salvar" do painel sem o campo limites não pode apagar o teto
await api('atualizar_negocio', { id: n1.id, negocio_id: n1.id, meta: { ad_account_id: '123', page_id: '456' } })
const n1b = le('negocios').find(n => n.id === n1.id)
confere('o teto do negócio sobrevive ao salvar do painel', n1b?.meta?.limites?.verba_max_dia === 50, JSON.stringify(n1b?.meta))
// a equipe baixa o teto pra 30: ligar a campanha de 40 é recusado
await api('atualizar_negocio', { id: n1.id, negocio_id: n1.id, meta: { ad_account_id: '123', page_id: '456', limites: { verba_max_dia: 30 } } })
r = await api('ativar_campanha', { campanha_id: camp?.id, id: camp?.id })
confere('ligar campanha de R$ 40 com teto baixado pra R$ 30 é recusado', r.http >= 400 && /teto/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 200))
confere('a campanha continua pausada', le('campanhas').find(c => c.id === camp?.id)?.status === 'criada_pausada')

console.log('2) Disjuntor do custo de IA do dia')
const n2 = await novoNegocio('TESTE · Limites IA', '5500099990002')
// R$ ~33 de IA hoje (2 milhões de tokens de entrada no sonnet = US$ 6 × 5,5)
poe('eventos', [{ id: 900001, tipo: 'uso_ia', negocio_id: n2.id, detalhe: { tipo: 'cliente', modelo: 'claude-sonnet-5-5', entrada: 2000000, saida: 0 }, criado_em: agora() }])
r = await api('simular_cliente', { negocio_id: n2.id, telefone: '5500011110001', nome: 'Ana', texto: 'Oi, quanto custa?' })
let resp = dado(r)?.respondeu
confere('o cliente não é respondido pela IA (freio_ia_do_dia)', resp?.ferramentas?.includes('freio_ia_do_dia'), JSON.stringify(r).slice(0, 300))
confere('a resposta é a frase fixa e honesta', /uma pessoa da equipe responde/.test((resp?.mensagens || [])[0] || ''), JSON.stringify(resp?.mensagens))
const cvAna = le('conversas').find(c => c.negocio_id === n2.id && c.telefone === '5500011110001')
confere('a conversa foi pro modo humano', cvAna?.modo === 'humano', cvAna?.modo)
r = await api('simular_cliente', { negocio_id: n2.id, telefone: '5500011110002', nome: 'Bia', texto: 'Oi!' })
confere('o 2º cliente também fica com a equipe', dado(r)?.respondeu?.ferramentas?.includes('freio_ia_do_dia'))
const lim2 = le('eventos').filter(e => e.tipo === 'limite_atingido' && e.negocio_id === n2.id)
confere('a equipe é avisada UMA vez no dia (não uma por cliente)', lim2.length === 1, String(lim2.length))
const cvDono2 = le('conversas').find(c => c.negocio_id === n2.id && c.canal === 'dono')
const recados = le('msgs').filter(m => m.conversa_id === cvDono2?.id && /^Aviso:/.test(m.texto || ''))
confere('o dono recebe UM recado só', recados.length === 1, String(recados.length))
const humano2 = le('eventos').filter(e => e.tipo === 'modo_humano' && e.negocio_id === n2.id)
confere('cada conversa registra a passagem (modo_humano) com o motivo', humano2.length === 2 && humano2.every(e => e.detalhe?.motivo === 'ia_do_dia'), String(humano2.length))

console.log('3) Freio de enxurrada de contatos novos')
const n3 = await novoNegocio('TESTE · Limites Enxurrada', '5500099990003')
// 31 contatos de verdade (não simulados) que escreveram na última hora
poe('conversas', Array.from({ length: 31 }, (_, i) => ({ id: crypto.randomUUID(), negocio_id: n3.id, canal: 'cliente', telefone: '5551900' + String(i).padStart(6, '0'), modo: 'ia', nao_lidas: 0, ia_respostas: 0, simulada: false, criado_em: agora() })))
r = await api('simular_cliente', { negocio_id: n3.id, telefone: '5500011110003', nome: 'Caio', texto: 'Oi, vi o anúncio' })
resp = dado(r)?.respondeu
confere('o contato novo na enxurrada vai pra equipe (freio_enxurrada)', resp?.ferramentas?.includes('freio_enxurrada'), JSON.stringify(r).slice(0, 300))
confere('a 1ª resposta leva o aviso de privacidade', (resp?.mensagens || []).length === 2, JSON.stringify(resp?.mensagens))
confere('aviso da enxurrada registrado', le('eventos').some(e => e.tipo === 'limite_atingido' && e.negocio_id === n3.id && e.detalhe?.motivo === 'enxurrada'))
// contatos de 2 h atrás não contam: em outro negócio, 31 velhos + nada novo = sem freio (a conferência é pela função, sem IA)
const n4 = await novoNegocio('TESTE · Limites Velhos', '5500099990004')
const duasHoras = new Date(Date.now() - 2 * 3600e3).toISOString()
poe('conversas', Array.from({ length: 31 }, (_, i) => ({ id: crypto.randomUUID(), negocio_id: n4.id, canal: 'cliente', telefone: '5551800' + String(i).padStart(6, '0'), modo: 'ia', nao_lidas: 0, ia_respostas: 0, simulada: false, criado_em: duasHoras })))
r = await api('limites', { negocio_id: n4.id })
const lim4 = dado(r)
confere('contatos de 2 h atrás não contam na enxurrada', lim4?.novas?.novas === 0 && lim4?.novas?.passou === false, JSON.stringify(r).slice(0, 200))
confere('o retrato dos limites mostra o teto de verba padrão (R$ 60)', lim4?.verba_max_dia === 60, JSON.stringify(lim4))

console.log(`\n${ok} certas, ${falha} erradas`)
process.exit(falha ? 1 : 0)
