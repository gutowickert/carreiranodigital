// Maia: teste com a OFICINA DE VERDADE (03/11). O dono manda 2 fotos e 1 vídeo, pede os anúncios,
// a oficina (maia-oficina/oficina.js --uma-vez) faz as artes e edita o vídeo, e as peças chegam na revisão da equipe.
// Uso: node scripts/maia-teste-oficina.mjs [url] [senha]   (o sistema em modo local, com MAIA_OFICINA_CHAVE=oficina123)
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const URL_ = process.argv[2] || 'http://localhost:3100', SENHA = process.argv[3] || 'teste123'
const F = 'C:/maia-v1/.maia-fotos-teste'
const op = async (acao, c = {}) => { const r = await fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'teste', ...c }) }); const j = await r.json(); if (!r.ok) throw new Error(acao + ': ' + j.erro); return j }
const ver = async (acao, q = {}) => (await fetch(URL_ + '/api/maia/operacao?' + new URLSearchParams({ acao, ...q }), { headers: { 'x-senha': SENHA } })).json()
const arq = (n, mime) => ({ arquivo_b64: fs.readFileSync(`${F}/${n}`).toString('base64'), mime })

const neg = await op('criar_negocio', { nome: 'Ótica Tempo de Visão', nicho: 'ótica', cidade: 'Gravataí', dono_nome: 'Kate', dono_whatsapp: '5500077779001', plano: 'completa', verba_dia: 30, meta: { ad_account_id: '1', page_id: '2' }, marca: { cores: { primaria: '#70826a', secundaria: '#b98a2e', texto: '#ffffff' } }, contexto: { servicos: 'óculos de grau, de sol e lentes', condicao: 'exame de vista grátis na compra do óculos; parcela em até 24x no crediário', publico: 'famílias e pessoas 40+ com vista cansada' } })
console.log('negócio', neg.id)
await op('simular_dono', { negocio_id: neg.id, ...arq('otica2.jpg', 'image/jpeg') })
await op('simular_dono', { negocio_id: neg.id, ...arq('otica3.jpg', 'image/jpeg') })
await op('simular_dono', { negocio_id: neg.id, ...arq('otica-video.mp4', 'video/mp4'), legenda: 'vídeo que gravei agora' })
const r = await op('simular_dono', { negocio_id: neg.id, texto: 'Mandei 2 fotos e um vídeo. Cria 3 anúncios, um deles com o vídeo.' })
console.log('maia:', (r.respondeu?.mensagens || []).join(' / '), '[' + (r.respondeu?.ferramentas || []).join(', ') + ']')
let pecas = await ver('pecas', { negocio: neg.id })
if (!pecas.length) { await op('gerar_anuncios', { negocio_id: neg.id, quantidade: 3 }); pecas = await ver('pecas', { negocio: neg.id }) }
console.log('peças na oficina:', pecas.map(p => p.tipo).join(', '))
for (let i = 0; i < pecas.length + 1; i++) {
  execFileSync('node', ['oficina.js', '--uma-vez'], { cwd: 'C:/maia-v1/maia-oficina', stdio: 'inherit', env: { ...process.env, MAIA_URL: URL_, MAIA_OFICINA_CHAVE: 'oficina123', DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY } })
}
pecas = await ver('pecas', { negocio: neg.id })
for (const p of pecas) {
  console.log(`- ${p.status} · ${p.tipo} · "${p.gancho}" · ${p.arquivo_path || 'sem arquivo'}`)
  if (p.arquivo_path) fs.copyFileSync(`C:/maia-v1/.maia-teste/arquivos/${p.arquivo_path}`, `C:/maia-v1/maia-oficina/saida/integrado-${p.tipo}-${p.id.slice(0, 6)}${p.arquivo_path.slice(p.arquivo_path.lastIndexOf('.'))}`)
}
const ok = pecas.length && pecas.every(p => p.status === 'revisao_equipe' && p.arquivo_path)
console.log(ok ? '\nOK: todas as peças feitas pela oficina e na revisão da equipe' : '\nFALHOU: nem todas chegaram na revisão')
