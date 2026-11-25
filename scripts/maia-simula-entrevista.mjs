// Maia: SIMULAÇÃO de ponta a ponta da entrevista de implantação COM A IA DE VERDADE (24/11, pedido do Guto).
// A Maia (lib/maia/entrevista.ts, Claude de verdade) entrevista um dono FICTÍCIO, que também é uma IA (modelo barato) fazendo papel
// de dono real: respostas curtas, um áudio (passa pela transcrição), pula 2 perguntas e manda uma resposta confusa.
// Banco local (MAIA_LOCAL), internet falsa (dados realistas), nada sai pro WhatsApp. No fim: a cobertura por setor da Maia e o custo.
// Uso: node scripts/maia-simula-entrevista.mjs oficina|otica   (precisa de ANTHROPIC_API_KEY no ambiente ou no .env.local)
import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
const QUAL = process.argv[2] === 'otica' ? 'otica' : 'oficina'
if (!process.env.ANTHROPIC_API_KEY) {
  for (const arq of [path.join(RAIZ, '.env.local'), 'C:/carreiranodigital/.env.local']) {
    try { const m = fs.readFileSync(arq, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m); if (m) { process.env.ANTHROPIC_API_KEY = m[1].trim().replace(/^["']|["']$/g, ''); break } } catch {}
  }
}
if (!process.env.ANTHROPIC_API_KEY) { console.log('sem ANTHROPIC_API_KEY'); process.exit(1) }
const PASTA = `.maia-teste/simula-${QUAL}`
Object.assign(process.env, { MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: PASTA, MAIA_SEM_AVISO: '1', DEEPGRAM_API_KEY: 'sim', MAIA_ENTREVISTA_LIGADA: '1' })
fs.rmSync(path.join(RAIZ, PASTA), { recursive: true, force: true })
process.chdir(RAIZ)

const PERSONA = {
  oficina: {
    neg: { nome: 'Auto Mecânica Ferreira', nicho: 'oficina mecânica', cidade: 'Ribeirão Preto', dono_nome: 'Marcos', dono_whatsapp: '5500016991230001' },
    ig: '@automecanicaferreira',
    internet: { instagram: { ok: true, usuario: 'automecanicaferreira', nome: 'Auto Mecânica Ferreira', bio: 'Mecânica geral, injeção eletrônica e suspensão. Seg a sex 7h30 às 18h, sáb 8h às 12h. Av. Independência, 2150 - Ribeirão Preto', seguidores: 1840, legendas: ['Revisão completa com check-up de 30 itens. Agende!', 'Troca de pastilha e disco, carro saindo seguro', 'Injeção falhando? A gente resolve.'] }, google: { ok: true, nome: 'Auto Mecânica Ferreira', nota: 4.7, avaliacoes: 213, endereco: 'Av. Independência, 2150 - Jardim Sumaré, Ribeirão Preto - SP', horario: ['segunda a sexta: 07:30–18:00', 'sábado: 08:00–12:00'] } },
    quem: `Você é o Marcos, 46 anos, dono da Auto Mecânica Ferreira em Ribeirão Preto/SP há 18 anos. 3 mecânicos. Faz mecânica geral, injeção eletrônica, suspensão, freio, troca de óleo e revisão; não mexe com câmbio automático nem funilaria. Atende mais carro popular e SUV médio (VW, Fiat, Chevrolet, Hyundai, Toyota). Troca de óleo com filtro: R$ 220 (óleo sintético). Revisão básica: R$ 390. O resto é depois de olhar o carro: diagnóstico com scanner custa R$ 120 e é abatido se fizer o serviço. Garantia de 90 dias no serviço; peça, a do fabricante. Não tem guincho, indica um parceiro; carro fica na oficina e entrega no fim do dia. Pagamento: Pix, débito, crédito em até 4x sem juros. Ticket médio uns R$ 850, sobra uns 35% depois da peça. Cliente decide em 1 a 3 dias. Atende uns 90 carros por mês e cabe mais uns 30. Cliente: gente de 30 a 60 anos que quer confiança, muitos indicados. Diferencial: mostra a peça velha pro cliente e manda foto/vídeo do serviço no WhatsApp. Época forte: antes das férias de julho e de dezembro. Desconto: no máximo 5% à vista em serviço acima de R$ 1.500. Nunca prometer prazo de peça que vem de fora nem preço sem ver o carro. Passar pra ele: reclamação, orçamento acima de R$ 3 mil, cliente de frota. Quem fecha é a esposa, Lu, no WhatsApp 16 99123-4567. Prefere "você". Não gosta de aparecer em vídeo. Pode anunciar revisão primeiro. Verba: uns R$ 25 por dia. Clientes vêm de Ribeirão e Sertãozinho, uns 15 km. Tem uma planilha com uns 600 clientes. Tem portfólio da Meta? Acha que sim, com o nome "Ferreira Auto", mas não lembra a senha.`,
  },
  otica: {
    neg: { nome: 'Ótica Bela Vista', nicho: 'ótica', cidade: 'Uberlândia', dono_nome: 'Patrícia', dono_whatsapp: '5500034991230002' },
    ig: '@oticabelavistaudi',
    internet: { instagram: { ok: true, usuario: 'oticabelavistaudi', nome: 'Ótica Bela Vista', bio: 'Óculos de grau e de sol · Lentes multifocais · Seg a sex 9h às 18h, sáb 9h às 13h · Shopping Bela Vista, loja 12', seguidores: 3120, legendas: ['Multifocal com adaptação garantida 💙', 'Óculos de sol com grau pro verão!', 'Traga sua receita e faça seu orçamento sem compromisso'] }, google: { ok: true, nome: 'Ótica Bela Vista', nota: 4.9, avaliacoes: 88, endereco: 'Av. Rondon Pacheco, 1200, loja 12 - Uberlândia - MG' } },
    quem: `Você é a Patrícia, 39 anos, dona da Ótica Bela Vista em Uberlândia/MG (loja no shopping) há 7 anos, com 2 vendedoras. Trabalha com lentes Zeiss, Hoya e uma linha própria mais barata; visão simples, multifocal, antirreflexo, filtro de luz azul e fotossensível. Aceita receita de fora com até 12 meses. Exame de vista: com um optometrista parceiro na loja às terças e quintas, R$ 80, abatido se comprar. Pronta entrega em visão simples em 1 hora; multifocal em 7 a 10 dias. Armações de R$ 150 a R$ 1.200 (Ray-Ban, Vogue, marcas nacionais); óculos de sol a partir de R$ 199. Crediário próprio em até 10x no boleto pra quem tem nome limpo; cartão em 10x. Preço do multifocal só depois de ver a receita (depende do grau): de R$ 690 a R$ 2.400. Ticket médio R$ 780, sobra uns 50%. Cliente decide em até 5 dias. Atende uns 70 por mês. Cliente: mulheres de 35 a 60, muita gente com primeira multifocal. Diferencial: adaptação garantida de multifocal (troca a lente se não adaptar em 30 dias). Época forte: volta às aulas, Dia das Mães, Black Friday. Desconto: até 10% à vista. Nunca dizer grau, nunca prometer que a lente "cura". Passar pra ela: reclamação, ajuste de óculos com problema, convênio de empresa. Quem fecha: as vendedoras, WhatsApp da loja 34 99876-5432. Prefere "você", estilo carinhoso. Ela aparece nos vídeos tranquila. Anunciar primeiro: multifocal. Verba R$ 30 por dia. Clientes de Uberlândia toda (uns 12 km). Tem uns 1.500 clientes no sistema da ótica. Portfólio da Meta: tem um, "Bela Vista Ótica", e conseguiu mandar o convite quando a Maia explicou.`,
  },
}[QUAL]

// ---------- a rede: só a IA de verdade; a internet e a transcrição são falsas ----------
const fetchReal = globalThis.fetch
let audioTexto = ''
globalThis.__maiaEntrevistaFake = { async internet() { return PERSONA.internet } }
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url))
  if (u.host === 'api.deepgram.com') return new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: audioTexto }] }] } }), { status: 200 })
  if (u.host !== 'api.anthropic.com') throw new Error('fora do roteiro: ' + u.host)
  return fetchReal(url, opts)
}

const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const { maiaDb: db } = await jiti.import(path.join(RAIZ, 'lib/maia/db.ts'))
const E = await jiti.import(path.join(RAIZ, 'lib/maia/entrevista.ts'))
const D = await jiti.import(path.join(RAIZ, 'lib/maia/dono.ts'))
const C = await jiti.import(path.join(RAIZ, 'lib/maia/canal.ts'))
const { usd } = await jiti.import(path.join(RAIZ, 'lib/maia/custo.ts'))

// ---------- o dono fictício (modelo barato) ----------
const MODELO_DONO = 'claude-haiku-5-5'
let usdDono = 0
async function falaDono(conversa, instrucao) {
  const r = await fetchReal('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO_DONO, max_tokens: 1500, system: `${PERSONA.quem}\n\nVocê está respondendo no WhatsApp a Maia, a IA de marketing que você contratou, que está fazendo a entrevista da implantação. Responda como um dono real e ocupado: curto (1 a 2 frases), informal, às vezes sem pontuação, só o que ela perguntou. Não invente nada fora do seu perfil; se não souber, diga que não sabe. Responda SÓ o texto da mensagem.`, messages: [{ role: 'user', content: `CONVERSA ATÉ AGORA:\n${conversa}\n\n${instrucao || 'Responda a última mensagem da Maia.'}` }] }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('dono IA ' + r.status + ' ' + JSON.stringify(j).slice(0, 200))
  usdDono += usd({ modelo: MODELO_DONO, entrada: j.usage?.input_tokens, saida: j.usage?.output_tokens })
  const t = (j.content || []).map(c => c.text || '').join('').trim()
  if (!t && !instrucao?.startsWith('#')) return falaDono(conversa, '#' + (instrucao || 'Responda a última mensagem da Maia.'))   // veio vazio: tenta de novo uma vez
  return t.replace(/^#/, '') || 'ok'
}

const neg = await db.insere('negocios', { ...PERSONA.neg, status: 'implantacao', plano: 'completa', meta: { implantacao: 'online' } })
const cvDe = async () => C.conversaDoDono(await db.um('negocios', { id: neg.id }))
const t0 = Date.now()
let r = await E.comecaEntrevista(neg.id, { instagram: PERSONA.ig, por: 'simulacao' })
if (!r.ok) { console.log('não começou', r); process.exit(1) }
const conversaTexto = async () => (await db.lista('msgs', { conversa_id: (await cvDe()).id }, { ordem: 'criado_em' })).map(m => `${m.autor === 'dono' ? 'VOCÊ' : 'MAIA'}: ${m.texto}`).join('\n')
// o roteiro do que o dono faz de diferente: turno → instrução
const ROTEIRO = { 2: 'AUDIO', 4: 'PULAR', 7: 'CONFUSA', 10: 'PULAR2' }
let turno = 0, palavrasDono = 0, audios = 0
while (turno < 60) {
  const e = (await db.um('negocios', { id: neg.id })).meta.entrevista
  if (e.status === 'feita') break
  turno++
  const conv = await conversaTexto()
  const cv = await cvDe()
  await db.atualiza('conversas', { id: cv.id }, { janela_ate: new Date(Date.now() + 86400e3).toISOString() })
  const papel = e.status === 'andando' ? ROTEIRO[turno] : null
  let texto
  if (papel === 'PULAR') texto = 'pular'
  else if (papel === 'PULAR2') texto = 'isso não sei agora, depois vejo'
  else if (papel === 'CONFUSA') texto = await falaDono(conv, 'Responda de um jeito CONFUSO: misture o que ela perguntou com outra coisa do seu negócio, sem responder direito, numa frase só e sem pontuação.')
  else if (e.status === 'resumo') texto = await falaDono(conv, 'Ela mandou o resumo. Se estiver tudo certo, responda só "sim, tá certo". Se tiver algo errado sobre o seu negócio, corrija em uma frase.')
  else if (e.status === 'reuniao') texto = await falaDono(conv, 'Diga o melhor dia e período pra reunião (ex.: quinta à tarde).')
  else texto = await falaDono(conv)
  palavrasDono += texto.split(/\s+/).length
  if (papel === 'AUDIO') {
    audioTexto = await falaDono(conv, 'Responda como se fosse um ÁUDIO transcrito: 3 ou 4 frases faladas, completando bem a resposta.')
    palavrasDono += audioTexto.split(/\s+/).length; audios++
    const rec = await D.recebeDoDono(await db.um('negocios', { id: neg.id }), { id: 'wamid.a' + turno, type: 'audio', audio: { id: 'x' } }, null, { buf: Buffer.from('ogg'), mime: 'audio/ogg' })
    r = await D.respondeDono(rec.cv.id)
  } else {
    await db.insere('msgs', { conversa_id: cv.id, negocio_id: neg.id, autor: 'dono', tipo: 'texto', texto, status: 'recebido' })
    r = await D.respondeDono(cv.id)
  }
  if (r && r.ok === false) { console.log('erro no turno', turno, r); break }
}
const fim = await db.um('negocios', { id: neg.id })
const e = fim.meta.entrevista
const msgs = await db.lista('msgs', { conversa_id: (await cvDe()).id }, { ordem: 'criado_em' })
const usos = (await db.lista('eventos', {})).filter(x => x.tipo === 'uso_ia')
const usdMaia = usos.reduce((s, x) => s + usd(x.detalhe), 0)

// ---------- a cobertura por setor da Maia ----------
const R = e.respostas, c = e.cadastro || E.montaCadastro(fim, e)
const tem = k => { const v = R[k]; return v != null && !(typeof v === 'string' && !v.trim()) && !(Array.isArray(v) && !v.length) }
const nichoK = QUAL === 'oficina' ? ['oficina.servicos', 'oficina.preco_fixo', 'oficina.garantia', 'oficina.leva_traz'] : ['otica.lentes', 'otica.receita', 'otica.exame', 'otica.prazo', 'otica.crediario']
const SETORES = [
  ['Estratégia', ['trafego.servico_foco', 'ficha.mais_vendido', 'ficha.diferencial', 'ficha.publico', 'calendario.datas']],
  ['Criação dos anúncios', ['ficha.diferencial', 'ficha.publico', 'ficha.preco', 'material.aparece', 'material.fotos']],
  ['Tráfego (cidade, raio, verba, foco)', ['negocio.cidade', 'trafego.raio', 'negocio.verba_dia', 'trafego.servico_foco', 'trafego.ticket_medio', 'trafego.margem_por_venda']],
  ['Atendimento 24 h', ['ficha.preco', 'ficha.horario', 'ficha.endereco', 'ficha.pagamento', 'ficha.prazo', 'limites.desconto_maximo', 'limites.nunca_prometer', 'limites.passar_pro_dono', 'atendimento.tom.pessoa', ...nichoK]],
  ['Retomada', ['trafego.ciclo_venda_dias', 'retomada.regras']],
  ['Conteúdo do Instagram', ['conteudo.temas', 'atendimento.tom.estilo', 'material.aparece']],
  ['Recado pra base', ['recado_base.ligado']],
  ['Medição e funil de venda', ['funil.sim', 'funil.etapas', 'trafego.ticket_medio']],
  ['Relatório e dono', ['dono.aprovacao', 'negocio.equipe_whatsapp']],
  ['Acessos', ['contas.portfolio', 'contas.acesso_enviado']],
]
const cobertura = SETORES.map(([setor, ks]) => ({ setor, trouxe: ks.filter(tem), faltou: ks.filter(k => !tem(k)), pulado: ks.filter(k => e.pulados?.some(p => p.campos.includes(k)) || (e.faltando || []).includes(k)) }))
const out = {
  qual: QUAL, negocio: PERSONA.neg.nome, status: e.status, turnos_dono: turno, mensagens_maia: msgs.filter(m => m.autor === 'maia').length, mensagens_dono: msgs.filter(m => m.autor === 'dono').length,
  palavras_dono: palavrasDono, audios, pulados: e.pulados, faltando: e.faltando, acesso: e.acesso, reuniao: e.reuniao_preferencia,
  custo: { maia_usd: +usdMaia.toFixed(4), maia_brl: +(usdMaia * 5.5).toFixed(2), chamadas_maia: usos.length, dono_simulado_usd: +usdDono.toFixed(4), por_tipo: usos.reduce((a, x) => { a[x.detalhe.tipo] = (a[x.detalhe.tipo] || 0) + 1; return a }, {}) },
  segundos: Math.round((Date.now() - t0) / 1000), cobertura, cadastro: c,
  conversa: msgs.map(m => `${m.autor === 'dono' ? 'DONO' : 'MAIA'}: ${m.texto}`),
}
const dest = path.join(RAIZ, PASTA, 'resultado.json')
fs.writeFileSync(dest, JSON.stringify(out, null, 1))
console.log(`\n${QUAL}: ${e.status} · ${turno} respostas do dono · ${out.mensagens_maia} msgs da Maia · custo Maia US$ ${out.custo.maia_usd} (R$ ${out.custo.maia_brl}) em ${usos.length} chamadas · dono simulado US$ ${out.custo.dono_simulado_usd}`)
for (const s of cobertura) console.log(`${s.faltou.length ? '✘' : '✔'} ${s.setor}: trouxe ${s.trouxe.length}/${s.trouxe.length + s.faltou.length}${s.faltou.length ? ' · faltou ' + s.faltou.join(', ') : ''}`)
console.log('resultado:', dest)
