// Maia: teste da VENDEDORA (13/11, ramo maia-vendedora). Modo local, nada sai pra Meta nem pra WhatsApp de verdade
// (todo telefone que recebe mensagem começa com 55000).
//
// Servidor (pasta limpa; a chave de IA só é preciso pro --ia):
//   rm -rf .teste-vendedora
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-vendedora MAIA_PAINEL_SENHA=teste123 MAIA_CONECTAR_SEGREDO=seg123 MAIA_SEM_AVISO=1 npx next dev --webpack -p 3221
// Teste:
//   node scripts/maia-teste-vendedora.mjs http://localhost:3221 teste123 .teste-vendedora         (sem IA)
//   node scripts/maia-teste-vendedora.mjs http://localhost:3221 teste123 .teste-vendedora --ia    (também as conversas com IA, ~US$ 0,20)
//
// O que confere: (1) retomada 1ª com ~20 h (dentro das 24 h e da janela de horário), 3 e 6 dias, e o evento da retomada com tipo e
// canal; (2) a despedida na 3ª; (3) preço personalizado; (4) o fechamento vai pro time (padrão) e a opção 'maia'; Pix fixo só
// com 'maia'; (5) o botão "Resolvido, devolver pra Maia" no painel do dono.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const [URL = 'http://localhost:3221', SENHA = 'teste123', PASTA = '.teste-vendedora'] = args
const COM_IA = process.argv.includes('--ia')
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra) } }

async function api(acao, corpo = {}) {
  const r = await fetch(`${URL}/api/maia/operacao`, { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'teste', ...corpo }) })
  const j = await r.json().catch(() => ({}))
  return Array.isArray(j) ? j : { ...j, http: r.status }
}
const arq = tab => path.join(PASTA, tab + '.json')
const le = tab => { try { return JSON.parse(fs.readFileSync(arq(tab), 'utf8')) } catch { return [] } }
const grava = (tab, l) => { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(arq(tab), JSON.stringify(l, null, 1)) }
const poe = (tab, linhas) => { const l = le(tab); for (const x of linhas) l.push(x); grava(tab, l) }
const agora = () => new Date().toISOString()
const RUN = String(Date.now()).slice(-5)
const H = 3600e3
// a hora em Brasília de um ISO (o servidor é UTC; janela da rotina: 9h às 20h, domingo só depois das 10h)
const horaBR = iso => { const d = new Date(Date.parse(iso) - 3 * H); return d.getUTCHours() + d.getUTCMinutes() / 60 }
const diaBR = iso => new Date(Date.parse(iso) - 3 * H).getUTCDay()

const DOCERIA = {
  produto: 'Cookies artesanais: caixa com 6 e caixa com 12', preco: 'Caixa com 6: R$ 45 (6 cookies recheados, embalagem de presente). Caixa com 12: R$ 85',
  pagamento: 'Pix ou cartão pelo link', pix: 'CNPJ 00.000.000/0001-00', endereco: 'Rua Exemplo, 100, Centro, Estrela',
  horario: 'terça a sábado, das 10h às 19h', frete: 'Estrela: grátis. Lajeado: R$ 10', prazo: 'Encomenda com 1 dia de antecedência',
  funil: { sim: 'Pagou o Pix', etapas: [{ etapa: 'escolheu', proximo_passo: 'Mandar o total com o frete e a chave Pix' }] },
}
const ESTETICA = {
  produto: 'Clínica de estética facial', preco: 'Limpeza de pele profunda: R$ 180 (60 minutos, tira cravos e impurezas). Avaliação: R$ 80',
  pagamento: 'Pix ou cartão', endereco: 'Av. Exemplo, 200, Lajeado', horario: 'segunda a sexta, das 9h às 19h',
  preco_personalizado: { servicos: 'Tratamento de manchas e acne', por_que: 'depende do tipo de pele, da causa e de quantas sessões cada pessoa precisa', caminho: 'agendar a avaliação (R$ 80), em que a esteticista vê a pele e monta o plano com o valor' },
}

// ═══════════ 1) a retomada
console.log('1) A retomada: 20 h, 3 dias e 6 dias')
let f = await api('teste_funcoes', { contexto: DOCERIA, texto: 'x' })
if (f.http !== 200) { console.log('o servidor não está em modo local (ou caiu):', JSON.stringify(f).slice(0, 200)); process.exit(1) }
confere('os dias da retomada são 0.83 (~20 h), 3 e 6', JSON.stringify(f.followup_dias) === '[0.83,3,6]', JSON.stringify(f.followup_dias))
// a resposta da Maia em vários horários (Brasília): a 1ª retomada fica entre 8 h e 22 h depois e dentro da janela da rotina
const casos = [['quarta 14h', '2026-11-11T17:00:00Z', 19.5, 21], ['quarta 2h da manhã', '2026-11-11T05:00:00Z', 13, 17], ['quarta 10h', '2026-11-11T13:00:00Z', 8, 9],
  ['quarta 23h', '2026-11-12T02:00:00Z', 17, 20], ['sábado 15h (domingo só depois das 10h)', '2026-11-14T18:00:00Z', 19, 21]]
for (const [nome, quando, min, max] of casos) {
  const r = await api('teste_funcoes', { contexto: DOCERIA, texto: 'x', agora: quando })
  const dif = (Date.parse(r.primeira_retomada) - Date.parse(quando)) / H, h = horaBR(r.primeira_retomada)
  const naJanela = h >= (diaBR(r.primeira_retomada) === 0 ? 10 : 9) && h + 1 <= 20
  confere(`resposta ${nome}: 1ª retomada ${dif.toFixed(2)} h depois, às ${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')} (dentro das 24 h e da janela)`, dif >= min && dif <= max && dif <= 22 && naJanela, r.primeira_retomada)
}

// a rotina marca no evento da retomada o tipo e como saiu (aqui o negócio não tem o WhatsApp ligado: lembrete pro dono)
const n1 = await api('criar_negocio', { nome: 'TESTE · Doceria Vendedora', nicho: 'doceria', cidade: 'Estrela', dono_nome: 'Dono Teste', dono_whatsapp: '550007771' + RUN, verba_dia: 30, contexto: DOCERIA })
if (!n1?.id) { console.log('não criou o negócio', JSON.stringify(n1).slice(0, 200)); process.exit(1) }
const lead = (nome, extra) => ({ id: crypto.randomUUID(), negocio_id: n1.id, telefone: '550007772' + RUN + nome.length, nome, origem: 'anuncio', etapa: 'conversando', followups: 0, criado_em: agora(), atualizado_em: agora(), ...extra })
const L1 = lead('Ana', { followups: 0, proximo_followup_em: new Date(Date.now() - 60e3).toISOString() })
const L3 = lead('Bruna Souza', { followups: 2, proximo_followup_em: new Date(Date.now() - 60e3).toISOString() })
poe('leads', [L1, L3])
const hoje14 = new Date(Date.now() - 3 * H); hoje14.setUTCHours(17, 0, 0, 0)
let rot = await api('rodar_rotina', { relogio: hoje14.toISOString() })
const feitos = (rot.retomadas || [])
const fx1 = feitos.find(x => x.lead === L1.id), fx3 = feitos.find(x => x.lead === L3.id)
confere('a rotina mandou a 1ª e a 3ª (lembrete pro dono: o WhatsApp do negócio não está ligado)', fx1?.numero === 1 && fx3?.numero === 3 && fx1.como === 'lembrete_dono', JSON.stringify(feitos))
const ev = tipo => le('lead_eventos').filter(e => e.tipo === 'followup')
const e1 = ev().find(e => e.lead_id === L1.id), e3 = ev().find(e => e.lead_id === L3.id)
confere('o evento da retomada leva o número, o tipo e como saiu', e1?.detalhe?.numero === 1 && e1?.detalhe?.tipo === 'retomada' && e1?.detalhe?.como === 'lembrete_dono' && e3?.detalhe?.numero === 3, JSON.stringify([e1?.detalhe, e3?.detalhe]))
confere('sem o texto da Maia (lembrete pro dono), a 3ª não conta como despedida', e3?.detalhe?.tipo === 'retomada')
const l1 = le('leads').find(l => l.id === L1.id)
const dias2 = (Date.parse(l1.proximo_followup_em) - Date.now()) / 86400e3
confere(`depois da 1ª, a 2ª fica pra ~3 dias da resposta (daqui a ${dias2.toFixed(2)} dias = 3 − 0,83)`, Math.abs(dias2 - (3 - 0.83)) < 0.01)
const l3 = le('leads').find(l => l.id === L3.id)
confere('depois da 3ª não tem 4ª: em 4 dias sem resposta vira perdido', l3.followups === 3 && Math.abs((Date.parse(l3.proximo_followup_em) - Date.now()) / 86400e3 - 4) < 0.01)

// a resposta fixa (sem IA) também agenda a 1ª retomada dentro das 24 h
const tel = '550007773' + RUN
const cvR = { id: crypto.randomUUID(), negocio_id: n1.id, canal: 'cliente', telefone: tel, nome: 'Carla', modo: 'ia', nao_lidas: 0, ia_respostas: 1, simulada: true, criado_em: agora(), ultima_msg_em: agora(), janela_ate: new Date(Date.now() + 24 * H).toISOString() }
poe('conversas', [cvR]); poe('msgs', [{ id: crypto.randomUUID(), conversa_id: cvR.id, negocio_id: n1.id, autor: 'maia', tipo: 'texto', texto: 'Oi! Aqui é a assistente virtual.', criado_em: agora() }])
let r = await api('simular_cliente', { negocio_id: n1.id, telefone: tel, nome: 'Carla', texto: 'qual o endereço?' })
const lc = le('leads').find(l => l.telefone === tel)
const difC = lc?.proximo_followup_em ? (Date.parse(lc.proximo_followup_em) - Date.now()) / H : null
confere(`endereço continua resposta fixa (sem IA) com fechamento no time`, r?.respondeu?.fixa === 'endereco', JSON.stringify(r?.respondeu).slice(0, 200))
confere(`e a 1ª retomada ficou ${difC?.toFixed(1)} h depois (entre 8 h e 22 h, na janela)`, difC != null && difC >= 8 && difC <= 22 && horaBR(lc.proximo_followup_em) >= 9 && horaBR(lc.proximo_followup_em) < 19.01)

// ═══════════ 2) quem fecha a venda
console.log('2) O fechamento vai pro time (padrão) ou fica com a Maia')
f = await api('teste_funcoes', { contexto: DOCERIA, texto: 'qual a chave pix?' })
confere('sem nada no cadastro, o fechamento é do time', f.fechamento === 'time')
confere('com o time, o Pix NÃO sai como resposta fixa', f.fixa === null, JSON.stringify(f.fixa))
confere('com o time, a chave Pix não vai pro prompt', f.ficha && !('pix' in f.ficha) && f.ficha.endereco, JSON.stringify(f.ficha).slice(0, 160))
confere('a regra do fechamento entra no prompt (não agenda, não manda Pix, passa pro dono)', /NÃO agenda horário/.test(f.regra_fechamento) && /passar_para_o_dono/.test(f.regra_fechamento))
confere('o "sim" do cadastro diz que quem fecha é a equipe', /quem fecha é a equipe/.test(f.regras_cadastro))
confere('a retomada também não manda Pix nem marca horário', /não manda dados de pagamento nem marca horário/.test(f.regras_retomada))
const fm = await api('teste_funcoes', { contexto: { ...DOCERIA, fechamento: 'maia' }, texto: 'qual a chave pix?' })
confere("com fechamento 'maia', fica como era: o Pix sai fixo e vai pro prompt", fm.fechamento === 'maia' && fm.fixa?.assunto === 'pix' && fm.ficha?.pix && fm.regra_fechamento === '', JSON.stringify(fm.fixa))
for (const t of ['qual o horário de vocês?', 'qual o endereço?', 'vocês fazem entrega em Lajeado? qual o frete?']) {
  const x = await api('teste_funcoes', { contexto: DOCERIA, texto: t })
  confere(`"${t}" continua resposta fixa com o time`, !!x.fixa, JSON.stringify(x.fixa))
}
const SIM = ['quero agendar pra sexta', 'qual a chave pix?', 'me passa o pix que eu já pago', 'quero 2 caixas com 6', 'Fechado!', 'tem horário amanhã de manhã?', 'pode ser sábado às 10h?', 'como faço pra pagar?', 'quero reservar uma caixa pro dia 20']
const NAO = ['quanto custa a caixa com 6?', 'vocês entregam em Lajeado?', 'que horas vocês abrem?', 'não quero, obrigado', 'já paguei, segue o comprovante', 'tem sem glúten?', 'oi, vi o anúncio', 'quero saber mais sobre os cookies']
for (const t of SIM) { const x = await api('teste_funcoes', { contexto: DOCERIA, texto: t }); confere(`quer fechar: "${t}"`, x.quer_fechar === true) }
for (const t of NAO) { const x = await api('teste_funcoes', { contexto: DOCERIA, texto: t }); confere(`não é fechar: "${t}"`, x.quer_fechar === false) }

// ═══════════ 3) preço personalizado
console.log('3) Preço personalizado')
f = await api('teste_funcoes', { contexto: ESTETICA, texto: 'quanto custa o tratamento de manchas?' })
confere('o cadastro aceita preco_personalizado e vira regra', f.preco_personalizado?.length === 1 && /PREÇO PERSONALIZADO \(Tratamento de manchas e acne\)/.test(f.regras_cadastro), JSON.stringify(f.preco_personalizado))
confere('a regra diz por que, o caminho (a avaliação) e proíbe inventar valor', /depende do tipo de pele/.test(f.regras_cadastro) && /agendar a avaliação \(R\$ 80\)/.test(f.regras_cadastro) && /NUNCA inventa um valor/.test(f.regras_cadastro))
confere('fora da ficha solta (não repete) e a pergunta de preço continua com "valor antes do preço"', f.ficha && !f.ficha.preco_personalizado && !('fechamento' in f.ficha) && f.pergunta_preco === true)
confere('a retomada sabe que esse serviço não tem preço fixo', /Tratamento de manchas e acne: não tem preço fixo/.test(f.regras_retomada))
f = await api('teste_funcoes', { contexto: { ...ESTETICA, preco_personalizado: [ESTETICA.preco_personalizado, { servicos: 'Peeling', por_que: 'depende da pele', caminho: 'a avaliação' }] }, texto: 'x' })
confere('aceita uma lista de serviços com preço personalizado', f.preco_personalizado?.length === 2 && /PREÇO PERSONALIZADO \(Peeling\)/.test(f.regras_cadastro))

// ═══════════ 4) o botão "Resolvido, devolver pra Maia" no painel do dono
console.log('4) Painel do dono: devolver a conversa pra Maia')
const n2 = await api('criar_negocio', { nome: 'TESTE · Outra Vendedora', nicho: 'doceria', cidade: 'Estrela', dono_nome: 'Outro Dono', dono_whatsapp: '550007774' + RUN, verba_dia: 30, contexto: DOCERIA })
const cvH = { id: crypto.randomUUID(), negocio_id: n1.id, canal: 'cliente', telefone: '550007775' + RUN, nome: 'Dora', modo: 'humano', nao_lidas: 0, ia_respostas: 2, simulada: true, criado_em: agora(), ultima_msg_em: agora() }
const cvOutro = { ...cvH, id: crypto.randomUUID(), negocio_id: n2.id, telefone: '550007776' + RUN, nome: 'Eva' }
poe('conversas', [cvH, cvOutro])
const link = await api('link_painel_dono', { negocio_id: n1.id })
const t = new globalThis.URL(link.link).searchParams.get('t')
const IP = { 'x-real-ip': '10.9.9.' + Math.floor(Math.random() * 200) }
const painel = (corpo, cab = { 'x-maia-painel': '1' }) => fetch(`${URL}/api/maia/painel`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'maia_dono=' + encodeURIComponent(t), ...IP, ...cab }, body: JSON.stringify(corpo) })
const verCv = async id => (await fetch(`${URL}/api/maia/painel?acao=conversa&id=${id}`, { headers: { cookie: 'maia_dono=' + encodeURIComponent(t), ...IP } })).json()
confere('a conversa com o dono aparece com modo humano no painel', (await verCv(cvH.id)).conversa?.modo === 'humano')
let p = await painel({ acao: 'devolver', conversa_id: cvH.id }, {})
confere('sem o cabeçalho do painel, recusa (403)', p.status === 403)
p = await painel({ acao: 'devolver', conversa_id: cvOutro.id })
confere('conversa de OUTRO negócio: não acha (404) e não mexe', p.status === 404 && le('conversas').find(c => c.id === cvOutro.id).modo === 'humano')
p = await painel({ acao: 'devolver', conversa_id: cvH.id })
const pj = await p.json().catch(() => ({}))
confere('"Resolvido, devolver pra Maia": a conversa volta pra Maia', p.status === 200 && pj.ok && le('conversas').find(c => c.id === cvH.id).modo === 'ia', JSON.stringify(pj))
const evD = le('eventos').filter(e => e.tipo === 'conversa_devolvida' && e.detalhe?.conversa_id === cvH.id)
confere('fica o evento conversa_devolvida (por: dono, pelo painel) e a ação do painel', evD.some(e => e.detalhe?.por === 'dono' && e.detalhe?.motivo === 'dono_painel') && le('eventos').some(e => e.tipo === 'painel_dono_acao' && e.detalhe?.acao === 'devolver'))
p = await painel({ acao: 'devolver', conversa_id: cvH.id })
confere('devolver de novo: avisa que já está com a Maia', p.status === 400)
const html = await (await fetch(`${URL}/maia/painel/index.html`)).text().catch(() => '')
confere('a página do painel tem o botão', /Resolvido, devolver pra Maia/.test(html) && /acao:'devolver'/.test(html))

// ═══════════ 5) com IA
if (COM_IA) {
  console.log('5) Com IA: fechamento, preço personalizado e despedida')
  const msgsDe = tel => { const cv = le('conversas').find(c => c.telefone === tel); return le('msgs').filter(m => m.conversa_id === cv?.id) }
  const donoDe = neg => { const cv = le('conversas').find(c => c.negocio_id === neg.id && c.canal === 'dono'); return le('msgs').filter(m => m.conversa_id === cv?.id) }
  // time: pergunta o preço (Maia prepara), depois quer pagar (vai pro dono)
  const tA = '550007781' + RUN
  r = await api('simular_cliente', { negocio_id: n1.id, telefone: tA, nome: 'Fabi', texto: 'Oi! Quanto custa a caixa com 6?' })
  const m1 = (r?.respondeu?.mensagens || []).join(' ')
  confere('time: perguntou o preço → a Maia responde com o preço e segue atendendo', /45/.test(m1) && le('conversas').find(c => c.telefone === tA)?.modo === 'ia', m1.slice(0, 240))
  r = await api('simular_cliente', { negocio_id: n1.id, telefone: tA, nome: 'Fabi', texto: 'Quero 2 caixas. Me passa o pix que eu pago agora' })
  const m2 = (r?.respondeu?.mensagens || []).join(' ')
  const cvA = le('conversas').find(c => c.telefone === tA), lA = le('leads').find(l => l.telefone === tA)
  confere('time: quis pagar → a conversa vai pro dono (modo humano)', cvA?.modo === 'humano', m2.slice(0, 240))
  confere('time: a Maia NÃO mandou a chave Pix', !/00\.000\.000/.test(m2), m2.slice(0, 240))
  confere('time: o cliente fica sabendo que uma pessoa vai seguir com ele', /equipe|pessoa|atendente/i.test(m2), m2.slice(0, 240))
  confere('time: o dono recebe "quer fechar"', donoDe(n1).some(m => /Fabi/.test(m.texto) && /quer fechar/.test(m.texto)), donoDe(n1).slice(-1)[0]?.texto)
  confere('time: o contato vai pra proposta (não ganho) e sem retomada automática', lA?.etapa === 'proposta' && !lA?.proximo_followup_em, lA?.etapa)
  confere('time: o evento da passagem tem tipo fechar', le('eventos').some(e => e.tipo === 'modo_humano' && e.detalhe?.conversa_id === cvA?.id && e.detalhe?.tipo === 'fechar'))
  // maia: fica como era
  const n3 = await api('criar_negocio', { nome: 'TESTE · Doceria Maia Fecha', nicho: 'doceria', cidade: 'Estrela', dono_nome: 'Dono Três', dono_whatsapp: '550007782' + RUN, verba_dia: 30, contexto: { ...DOCERIA, fechamento: 'maia' } })
  const tB = '550007783' + RUN
  await api('simular_cliente', { negocio_id: n3.id, telefone: tB, nome: 'Gabi', texto: 'Oi! Quanto custa a caixa com 6?' })
  r = await api('simular_cliente', { negocio_id: n3.id, telefone: tB, nome: 'Gabi', texto: 'Quero 2 caixas. Me passa o pix que eu pago agora' })
  const m3 = (r?.respondeu?.mensagens || []).join(' ')
  confere("'maia': quis pagar → ela mesma manda o Pix e segue atendendo", /00\.000\.000/.test(m3) && le('conversas').find(c => c.telefone === tB)?.modo === 'ia', m3.slice(0, 240))
  // preço personalizado
  const n4 = await api('criar_negocio', { nome: 'TESTE · Estética Vendedora', nicho: 'estetica', cidade: 'Lajeado', dono_nome: 'Dona Quatro', dono_whatsapp: '550007784' + RUN, verba_dia: 30, contexto: ESTETICA })
  const tC = '550007785' + RUN
  await api('simular_cliente', { negocio_id: n4.id, telefone: tC, nome: 'Helena', texto: 'Oi, tudo bem?' })
  r = await api('simular_cliente', { negocio_id: n4.id, telefone: tC, nome: 'Helena', texto: 'Quanto custa o tratamento pra manchas?' })
  const m4 = (r?.respondeu?.mensagens || []).join(' ')
  const valores = [...m4.matchAll(/R\$\s*(\d+(?:[.,]\d{2})?)/g)].map(x => x[1])
  confere('preço personalizado: explica e leva pra avaliação, sem inventar valor do tratamento', /avalia/i.test(m4) && valores.every(v => v === '80' || v === '80,00'), m4.slice(0, 300))
  confere('preço personalizado: a conversa segue com a Maia (não é fechar)', le('conversas').find(c => c.telefone === tC)?.modo === 'ia')
  r = await api('simular_cliente', { negocio_id: n4.id, telefone: tC, nome: 'Helena', texto: 'E a limpeza de pele, quanto é?' })
  const m5 = (r?.respondeu?.mensagens || []).join(' ')
  const iV = m5.search(/cravo|impureza|60 min|minuto|pele/i), iP = m5.indexOf('180')
  confere('preço fixo: diz o preço (R$ 180), com o valor antes do número', iP >= 0 && iV >= 0 && iV < iP, m5.slice(0, 300))
  // despedida
  const lH = le('leads').find(l => l.telefone === tC)
  const d3 = await api('teste_retomada_texto', { negocio_id: n4.id, lead_id: lH.id, numero: 3 })
  console.log('     despedida: ' + d3.texto)
  confere('3ª retomada = despedida: para o atendimento e fica à disposição', /parar|por aqui|encerr/i.test(d3.texto || '') && /quando quiser|chamar|disposi/i.test(d3.texto || ''))
  confere('despedida sem pressão (nada de "condição especial", "último dia", desconto)', !/condi[cç][aã]o especial|[uú]ltimo dia|[uú]ltima chance|desconto/i.test(d3.texto || ''))
  const d1 = await api('teste_retomada_texto', { negocio_id: n4.id, lead_id: lH.id, numero: 1 })
  console.log('     1ª retomada: ' + d1.texto)
  confere('a 1ª retomada não é despedida', !/parar o atendimento|por aqui pra n[aã]o/i.test(d1.texto || '') && (d1.texto || '').length > 10)
}

console.log(`\n${ok} certos, ${falha} errados`)
process.exit(falha ? 1 : 0)
