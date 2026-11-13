// Maia: o teste do MATERIAL DO CLIENTE (13/11, lib/maia/material.ts). Roda os módulos direto, sem servidor, em MODO LOCAL
// (arquivos em .maia-teste/material), sem IA (MAIA_SEM_IA_MIDIA=1: a descrição vem do nome do arquivo) e sem WhatsApp de
// verdade (dono com telefone 55000..., que nunca sai pra Meta). Nada sai pra internet.
// Uso: node scripts/maia-teste-material.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
const PASTA = '.maia-teste/material'
fs.rmSync(path.join(RAIZ, PASTA), { recursive: true, force: true })
Object.assign(process.env, { MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: PASTA, MAIA_SEM_AVISO: '1', MAIA_SEM_IA_MIDIA: '1', ANTHROPIC_API_KEY: 'teste' })
globalThis.fetch = async (u) => { throw new Error('o teste não deixa sair pra ' + String(u).slice(0, 60)) }

const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const { maiaDb: db } = await jiti.import(path.join(RAIZ, 'lib/maia/db.ts'))
const M = await jiti.import(path.join(RAIZ, 'lib/maia/material.ts'))
const P = await jiti.import(path.join(RAIZ, 'lib/maia/pendencias.ts'))

let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra) } }
const erroDe = async (fn) => { try { await fn(); return null } catch (e) { return String(e.message || e) } }
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), MP4 = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])
const hora = (data, h) => new Date(`${data}T${String(h + 3).padStart(2, '0')}:00:00Z`)   // h no horário de Brasília
const avisosMaterial = async (id) => (await db.lista('eventos', { tipo: 'aviso_equipe', negocio_id: id })).filter(e => /material do lote/.test(e.detalhe?.titulo || ''))
const msgsDono = async (id) => db.lista('msgs', { negocio_id: id })

console.log('1) O banco de mídias')
let neg = await db.insere('negocios', { nome: 'Copos Teste', nicho: 'gravação a laser', cidade: 'Lajeado', dono_nome: 'Ana Souza', dono_whatsapp: '5500011112222', plano: 'completa', status: 'ativo', contexto: { mais_vendido: 'copo térmico' } })
const f1 = await M.sobeMidia(neg, { buf: JPG, mime: 'image/jpeg', nome: 'copo térmico gravado no prato preto', por: 'equipe' })
await M.sobeMidia(neg, { buf: JPG, mime: 'image/png', nome: 'vitrine da loja', por: 'equipe' })
const ruim = await M.sobeMidia(neg, { buf: JPG, mime: 'image/jpg', nome: 'foto escura e tremida', por: 'equipe' })
await M.sobeMidia(neg, { buf: MP4, mime: 'video/mp4', nome: 'gravação a laser', por: 'equipe' })
let banco = await M.bancoDoNegocio(neg)
confere('3 fotos e 1 vídeo no banco, cada um com descrição', banco.length === 4 && banco.filter(m => m.tipo === 'foto').length === 3 && banco.every(m => m.descricao), JSON.stringify(banco.map(m => m.descricao)))
confere('a foto escura e tremida fica marcada como "não serve"', banco.find(m => m.id === ruim.id)?.serve === false && banco.filter(m => m.serve).length === 3)
confere('arquivo que não é foto nem vídeo é recusado', /manda foto/.test(await erroDe(() => M.sobeMidia(neg, { buf: JPG, mime: 'application/pdf', por: 'equipe' })) || ''))
await M.marcaNaoUsar(f1.id, true, 'equipe')
banco = await M.bancoDoNegocio(neg)
confere('"não usar": sai das que servem e a descrição continua limpa no painel', banco.find(m => m.id === f1.id)?.nao_usar === true && !banco.find(m => m.id === f1.id).serve && !banco.find(m => m.id === f1.id).descricao.startsWith('[não usar]'))
confere('a criação reconhece o "não usar" (naoUsar)', M.naoUsar(await db.um('midias', { id: f1.id })) === true)
await M.marcaNaoUsar(f1.id, false, 'equipe')
confere('"voltar a usar" desfaz', M.serve(await db.um('midias', { id: f1.id })) === true)

console.log('\n2) O envio grande (vídeo direto pro armazenamento)')
const lk = await M.linkDeEnvio(neg, 'video/quicktime')
confere('o link de envio vai pra pasta de mídias do negócio', lk.caminho.startsWith(neg.id + '/midias/') && lk.caminho.endsWith('.mov') && /envio=/.test(lk.url || ''))
confere('registrar sem o arquivo ter chegado dá erro claro', /não chegou/.test(await erroDe(() => M.registraMidia(neg, { caminho: lk.caminho, mime: 'video/quicktime', por: 'equipe' })) || ''))
await db.sobe(lk.caminho, MP4, 'video/quicktime')
const reg = await M.registraMidia(neg, { caminho: lk.caminho, mime: 'video/quicktime', nome: 'dia a dia da oficina', por: 'implantacao' })
confere('chegou: vira vídeo do banco com descrição', reg.tipo === 'video' && /dia a dia/.test(reg.descricao || ''))
confere('o mesmo arquivo não entra duas vezes', /já está no banco/.test(await erroDe(() => M.registraMidia(neg, { caminho: lk.caminho, mime: 'video/quicktime', por: 'equipe' })) || ''))
confere('caminho de outro negócio é recusado', /caminho inválido/.test(await erroDe(() => M.registraMidia(neg, { caminho: 'outro/midias/x.mp4', mime: 'video/mp4', por: 'equipe' })) || ''))

console.log('\n3) A pauta de captação (dia 12, pro lote do dia 15)')
const falta = M.avaliaBanco(await db.lista('midias', { negocio_id: neg.id }), 'meio', 'copo térmico')
confere('avalia o banco: com 3 fotos boas e 2 vídeos, pro lote do dia 15 (2 + 2) só falta gente usando', falta.fotos === 0 && falta.videos === 0 && !falta.produto && falta.pessoa, JSON.stringify(falta))
const antes = (await msgsDono(neg.id)).length
let r = await M.rotinaMaterial(hora('2026-11-12', 10))
let pts = await M.pautas(neg.id)
confere('dia 12 às 10h: a Maia pede UMA pauta pro lote do dia 15', pts.length === 1 && pts[0].detalhe.status === 'aberta' && pts[0].detalhe.data_lote === '2026-11-15', JSON.stringify(r))
const msg = (await msgsDono(neg.id)).slice(antes).map(m => m.texto).join('\n')
confere('a mensagem pro dono é curta, concreta e com o como', /Ana, pros anúncios do dia 15 eu preciso de:/.test(msg) && /alguém segurando ou usando copo térmico/.test(msg) && /Manda aqui mesmo, até o dia 14/.test(msg), msg)
await M.rotinaMaterial(hora('2026-11-12', 15))
confere('rodando de novo no mesmo dia: não repete', (await M.pautas(neg.id)).length === 1 && (await msgsDono(neg.id)).length === antes + 1)
const pend = await P.pendenciasDoDono(neg)
confere('a pauta entra nas pendências do dono (vai junto nos próximos avisos)', pend.some(p => p.tipo === 'material' && /fotos e vídeos que eu pedi pros anúncios do dia 15/.test(p.texto)))
// o dono manda pelo painel dele: primeiro uma foto que não é o que foi pedido (a pauta segue aberta); depois a certa e fecha
await new Promise(r => setTimeout(r, 20))
await M.sobeMidia(neg, { buf: JPG, mime: 'image/jpeg', nome: 'balcão da loja', por: 'dono_painel' })
pts = await M.pautas(neg.id)
confere('chegou uma foto, mas não a de alguém usando: a pauta continua aberta e anota a chegada', pts[0].detalhe.status === 'aberta' && pts[0].detalhe.recebidas.length === 1, JSON.stringify(pts[0].detalhe.recebidas))
await M.sobeMidia(neg, { buf: JPG, mime: 'image/jpeg', nome: 'cliente sorrindo segurando o copo térmico', por: 'dono_painel' })
pts = await M.pautas(neg.id)
confere('chegou o que faltava: a pauta fecha sozinha e anota o que chegou', pts[0].detalhe.status === 'atendida' && pts[0].detalhe.recebidas.length === 2, JSON.stringify(pts[0].detalhe))
await M.rotinaMaterial(hora('2026-11-15', 10))
confere('dia do lote com a pauta atendida: a equipe não é avisada', (await avisosMaterial(neg.id)).length === 0)

console.log('\n4) O dono não mandou: a equipe é avisada no dia do lote, uma vez')
const neg2 = await db.insere('negocios', { nome: 'Doces Teste', nicho: 'doceria', cidade: 'Estrela', dono_nome: 'Bia', dono_whatsapp: '5500011113333', plano: 'completa', status: 'ativo', contexto: { produto: 'bolo de pote' } })
await M.rotinaMaterial(hora('2026-12-01', 9))
let p2 = await M.pautas(neg2.id)
confere('dia 1: banco vazio → pauta do lote do dia 4 com 4 vídeos, a foto do produto e a pessoa', p2.length === 1 && p2[0].detalhe.data_lote === '2026-12-04' && p2[0].detalhe.falta.videos === 4 && p2[0].detalhe.falta.produto === 'bolo de pote' && p2[0].detalhe.falta.pessoa === true, JSON.stringify(p2[0]?.detalhe))
await M.rotinaMaterial(hora('2026-12-02', 10))
confere('dia 2 (nem pedido nem lote): nada acontece', (await M.pautas(neg2.id)).length === 1 && (await avisosMaterial(neg2.id)).length === 0)
await M.rotinaMaterial(hora('2026-12-04', 8))
confere('dia do lote, antes das 9h: ainda não avisa', (await avisosMaterial(neg2.id)).length === 0)
await M.rotinaMaterial(hora('2026-12-04', 10))
await M.rotinaMaterial(hora('2026-12-04', 11))
p2 = await M.pautas(neg2.id)
confere('dia do lote sem o material: avisa a equipe UMA vez e marca vencida', (await avisosMaterial(neg2.id)).length === 1 && p2[0].detalhe.status === 'vencida', JSON.stringify(p2[0]?.detalhe))
confere('a pauta vencida sai das pendências do dono', !(await P.pendenciasDoDono(neg2)).some(p => p.tipo === 'material'))

console.log('\n5) Implantação, demonstração e Gestora')
const neg3 = await db.insere('negocios', { nome: 'Oficina Teste', nicho: 'oficina', cidade: 'Lajeado', dono_nome: 'Caio', dono_whatsapp: '5500011114444', plano: 'completa', status: 'implantacao', contexto: { mais_vendido: 'troca de óleo' } })
const pi = await M.pedePauta(neg3, { lote: 'implantacao', por: 'equipe' })
confere('na implantação a equipe pede pelo painel: sai "pros primeiros anúncios", sem prazo de lote', /Caio, pros primeiros anúncios eu preciso de:/.test(pi.texto || '') && !/até o dia/.test(pi.texto || ''), pi.texto)
const pi2 = await M.pedePauta(neg3, { lote: 'implantacao', por: 'equipe' })
confere('pedir de novo no mesmo dia devolve a mesma pauta', pi2.ja === true)
await M.rotinaMaterial(hora('2026-12-12', 10))
confere('negócio ainda em implantação não recebe a pauta automática do dia 12', !(await M.pautas(neg3.id)).some(e => e.detalhe?.lote === 'meio'))
const demo = await db.insere('negocios', { nome: 'Demo', dono_whatsapp: '5500011115555', plano: 'completa', status: 'ativo', contexto: { demo: { status: 'fila' } } })
const gest = await db.insere('negocios', { nome: 'Gestora', dono_whatsapp: '5500011116666', plano: 'gestao', status: 'ativo' })
await M.rotinaMaterial(hora('2027-01-01', 10))
confere('demonstração e plano Gestora ficam de fora da pauta', (await M.pautas(demo.id)).length === 0 && (await M.pautas(gest.id)).length === 0)
await M.rotinaMaterial(hora('2027-01-12', 10))
const cheio = (await M.pautas(neg.id)).find(e => e.detalhe?.chave === '2027-01-meio')
confere('banco completo pro lote: anota "não faltava nada" e não manda mensagem', cheio?.detalhe?.status === 'sem_falta', JSON.stringify(cheio?.detalhe))

console.log(`\n${ok} de ${ok + falha} conferências passaram.`)
process.exit(falha ? 1 : 0)
