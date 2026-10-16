// Oito Posts: os acessos 1 a 1 (16/10), pra acompanhar o teste de perto: cada pessoa (sessão), de que anúncio veio,
// o caminho dela (página, formulário, teste, WhatsApp, pagamento) e onde parou. Mesma senha do painel (x-senha).
//   GET ?regiao=br|latam&desde=ISO   (padrão: o zero do painel, oito_estado.painel_desde)
// Os números da Meta por anúncio a página busca em /api/oito/campanhas (o utm_content do link é o nome do anúncio).
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { senhaOk, regiaoDe, lerRegiao } from '@/lib/oito/config'

export const maxDuration = 60

// a escada do funil (a etapa mais alta que a pessoa alcançou)
const ESCADA = ['visita', 'abriu_form', 'comecou_form', 'pediu', 'teste_pronto', 'viu_teste', 'wa_chamou', 'wa_respondeu', 'aprovou', 'quis_assinar', 'pagou'] as const
const NOME_ETAPA: Record<string, string> = { visita: 'Visitou a página', abriu_form: 'Abriu o formulário', comecou_form: 'Começou o formulário', pediu: 'Pediu o teste', teste_pronto: 'Teste pronto',
  viu_teste: 'Viu o teste', wa_chamou: 'O WhatsApp chamou', wa_respondeu: 'Respondeu no WhatsApp', aprovou: 'Aprovou o teste', quis_assinar: 'Quis assinar', pagou: 'Pagou' }
const PASSOS_FORM: Record<number, string> = { 1: 'o negócio', 2: 'o que vende', 3: 'cores e tom', 4: 'fotos ou IA', 5: 'contato' }

function etapaDe(e: any): string | null {
  switch (e.tipo) {
    case 'visita': return 'visita'
    case 'saiu': return e.detalhe?.pagina === 'form' ? 'abriu_form' : e.detalhe?.pagina === 'teste' ? 'viu_teste' : 'visita'
    case 'form_inicio': case 'form_passo': case 'form_erro': return 'comecou_form'
    case 'lead': return 'pediu'
    case 'teste_pronto': return 'teste_pronto'
    case 'teste_visto': case 'baixou': case 'copiou_legenda': return 'viu_teste'
    case 'wa_followup': return 'wa_chamou'
    case 'wa_recebida': return 'wa_respondeu'
    case 'teste_aprovado': return 'aprovou'
    case 'assinar_clique': case 'assinatura_aberta': case 'fatura_aberta': return 'quis_assinar'
    case 'pagou': return 'pagou'
    default: return null
  }
}
function resumo(e: any): string {
  const d = e.detalhe || {}
  switch (e.tipo) {
    case 'visita': return 'Entrou na página de venda'
    case 'saiu': return d.pagina === 'form' ? `Saiu do formulário no passo ${d.passo || '?'}${PASSOS_FORM[d.passo] ? ' (' + PASSOS_FORM[d.passo] + ')' : ''} depois de ${d.seg}s`
      : d.pagina === 'teste' ? `Saiu da tela do teste depois de ${d.seg}s` : `Saiu da página de venda: ${d.seg}s, rolou ${d.rolou}%${d.secao ? ', última seção: ' + d.secao : ''}`
    case 'whats_clique': return 'Clicou no link do WhatsApp'
    case 'form_inicio': return 'Começou a preencher o formulário'
    case 'form_passo': return `Avançou pro passo ${d.passo}${PASSOS_FORM[d.passo] ? ' (' + PASSOS_FORM[d.passo] + ')' : ''}`
    case 'form_erro': return 'Erro no formulário: ' + String(d.erro || '').slice(0, 80)
    case 'lead': return 'Pediu o teste grátis'
    case 'teste_pronto': return `Teste pronto em ${d.segundos || '?'}s`
    case 'teste_visto': return 'Viu os 2 posts na tela'
    case 'baixou': return 'Baixou um post'
    case 'copiou_legenda': return 'Copiou uma legenda'
    case 'wa_followup': return +d.etapa === 1 ? 'O WhatsApp chamou (teste pronto)' : `Lembrete ${d.etapa} de 3 no WhatsApp`
    case 'wa_retoma': return 'Lembrete no WhatsApp (parou no meio)'
    case 'wa_recebida': return 'Mandou mensagem no WhatsApp'
    case 'teste_aprovado': return 'Aprovou o teste'
    case 'assinar_clique': return 'Clicou em assinar na tela do teste'
    case 'assinatura_aberta': return d.gateway === 'hotmart' ? 'Recebeu o link de pagamento' : 'Abriu a fatura'
    case 'fatura_aberta': return 'Abriu a fatura'
    case 'pagou': return 'Pagou 🎉'
    case 'email_followup': return 'E-mail de acompanhamento'
    case 'ajuste_pedido': return 'Pediu ajuste num post'
    default: return e.tipo
  }
}
function aparelho(ua: string) {
  const app = /Instagram/i.test(ua) ? 'Instagram' : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua) ? 'Facebook' : /WhatsApp|WAiOS/i.test(ua) ? 'WhatsApp' : 'navegador'
  const so = /iPhone|iPad/i.test(ua) ? 'iPhone' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : ua ? 'outro' : '?'
  return { app, so, celular: so === 'iPhone' || so === 'Android' }
}
const mediana = (xs: number[]) => { const a = xs.filter(x => isFinite(x)).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null }

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const u = new URL(req.url), regiao = lerRegiao(u.searchParams.get('regiao'))
  const [estado, clientesT, eventosT, conversasT] = await Promise.all([
    db.lista('estado', {}), db.lista('clientes', {}, { ordem: 'criado_em', desc: true }),
    db.lista('eventos', {}, { ordem: 'criado_em', desc: true, limite: 8000 }), db.lista('wa_conversas', {}, { limite: 2000 }).catch(() => [] as any[]),
  ])
  const zero = String(estado.find((e: any) => e.chave === 'painel_desde')?.valor || '')
  const desde = u.searchParams.get('desde') || zero || new Date(Date.now() - 2 * 86400e3).toISOString()
  const cli = new Map(clientesT.map((c: any) => [c.id, c]))
  const convCli = new Map(conversasT.map((cv: any) => [cv.id, cv.cliente_id]))
  const convDoCli = new Map(conversasT.filter((cv: any) => cv.cliente_id).map((cv: any) => [cv.cliente_id, cv]))
  const daRegiao = (marca: any) => !regiao || (!!marca && regiaoDe(marca) === regiao)

  // 1. junta os eventos por pessoa: a sessão do navegador; depois do cadastro, a sessão gravada no cliente
  const sess = new Map<string, any>()
  for (const e of [...eventosT].reverse()) {
    if (e.criado_em < desde) continue
    const cid = e.cliente_id || (e.tipo === 'wa_recebida' ? convCli.get(e.detalhe?.conversa) : null)
    const c: any = cid ? cli.get(cid) : null
    if (c && (c.exemplo || c.criado_em < desde)) continue // exemplo e turma antiga (antes do zero) ficam de fora
    if (e.detalhe?.simulado) continue
    const marca = e.marca || c?.marca
    if (!daRegiao(marca)) continue
    const chave = e.sessao || (c ? c.sessao || 'c:' + c.id : 'e:' + e.id)
    const s = sess.get(chave) || { id: chave, marca, eventos: [] as any[], cliente: null as any }
    if (c) s.cliente = c
    s.marca = s.marca || marca
    s.eventos.push(e)
    sess.set(chave, s)
  }

  // 2. cada pessoa: origem, aparelho, até onde foi e onde parou
  const pessoas: any[] = []
  for (const s of sess.values()) {
    const evs = s.eventos
    const temHumano = evs.some((e: any) => ['visita', 'form_inicio', 'form_passo', 'lead', 'saiu'].includes(e.tipo))
    if (!temHumano && !s.cliente) continue // clique solto sem visita = robô (revisão da Meta)
    const ua = (evs.find((e: any) => e.detalhe?.ua) || {}).detalhe?.ua || ''
    const vis = evs.find((e: any) => e.tipo === 'visita')
    const utm = vis?.detalhe?.utm || s.cliente?.utm || null
    const ref = String(vis?.detalhe?.ref || '')
    const meta = /meta|facebook|instagram|fb|ig/i.test(String(utm?.utm_source || '')) || /instagram|facebook/i.test(ref) || /Instagram|FBAN|FBAV|FB_IAB/i.test(ua)
    const anuncio = utm?.utm_content ? String(utm.utm_content) : meta ? 'Meta (sem nome do anúncio)' : ref ? 'outro site' : 'direto'
    let topo = -1
    for (const e of evs) { const et = etapaDe(e); if (et) topo = Math.max(topo, ESCADA.indexOf(et as any)) }
    const saidas = evs.filter((e: any) => e.tipo === 'saiu')
    const saidaVenda = saidas.filter((e: any) => e.detalhe?.pagina === 'venda').sort((a: any, b: any) => (b.detalhe.rolou - a.detalhe.rolou) || (b.detalhe.seg - a.detalhe.seg))[0]
    const passoMax = Math.max(0, ...evs.filter((e: any) => e.tipo === 'form_passo').map((e: any) => +e.detalhe?.passo || 0), ...saidas.filter((e: any) => e.detalhe?.pagina === 'form').map((e: any) => +e.detalhe?.passo || 0), evs.some((e: any) => e.tipo === 'form_inicio') ? 1 : 0)
    const cv = s.cliente ? convDoCli.get(s.cliente.id) : null
    const et = topo >= 0 ? ESCADA[topo] : 'visita'
    let parou = '', grupo = ''
    if (et === 'pagou') { parou = 'Comprou 🎉'; grupo = 'comprou' }
    else if (et === 'quis_assinar') { parou = 'Foi pro pagamento e não pagou (ainda)'; grupo = 'no pagamento' }
    else if (et === 'wa_respondeu' || et === 'aprovou') { parou = `Conversando no WhatsApp${cv?.fase ? ' (fase: ' + cv.fase.replace(/_/g, ' ') + ')' : ''}`; grupo = 'no WhatsApp' }
    else if (et === 'wa_chamou') { parou = 'Teste pronto; o WhatsApp chamou e não respondeu'; grupo = 'não respondeu o WhatsApp' }
    else if (et === 'teste_pronto' || et === 'viu_teste') { parou = 'Teste pronto, sem resposta ainda'; grupo = 'teste pronto' }
    else if (et === 'pediu') { parou = 'Pediu o teste (gerando ou com erro)'; grupo = 'gerando' }
    else if (et === 'comecou_form') { parou = `Desistiu no formulário, passo ${passoMax || 1}${PASSOS_FORM[passoMax || 1] ? ' (' + PASSOS_FORM[passoMax || 1] + ')' : ''}`; grupo = 'formulário passo ' + (passoMax || 1) }
    else if (et === 'abriu_form') { parou = 'Abriu o formulário e não preencheu nada'; grupo = 'abriu o formulário' }
    else if (saidaVenda) { const d = saidaVenda.detalhe; parou = `Saiu da página de venda (${d.seg}s, rolou ${d.rolou}%${d.secao ? ', até "' + d.secao + '"' : ''})`; grupo = 'saiu da página' }
    else if (evs.some((e: any) => e.tipo === 'whats_clique')) { parou = 'Clicou no WhatsApp e não mandou mensagem'; grupo = 'clicou no WhatsApp' }
    else { parou = 'Entrou na página (sem dado de saída)'; grupo = 'saiu da página' }
    pessoas.push({
      id: s.id, marca: s.marca, inicio: evs[0].criado_em, fim: evs[evs.length - 1].criado_em, aparelho: aparelho(ua),
      anuncio, campanha: utm?.utm_campaign || null, fonte: utm?.utm_source || (meta ? 'meta' : ref ? 'outro' : 'direto'), ref: ref.slice(0, 80),
      etapa: et, etapa_nome: NOME_ETAPA[et], etapa_i: Math.max(0, topo), parou, grupo,
      pagina: saidaVenda ? { seg: saidaVenda.detalhe.seg, rolou: saidaVenda.detalhe.rolou, secao: saidaVenda.detalhe.secao } : null, passo_form: passoMax || null,
      cliente: s.cliente ? { codigo: s.cliente.codigo, nome: s.cliente.nome_negocio, cidade: s.cliente.cidade, status: s.cliente.status, responsavel: s.cliente.responsavel } : null,
      whatsapp: cv ? { fase: cv.fase, modo: cv.modo } : null,
      linha: evs.map((e: any) => ({ em: e.criado_em, tipo: e.tipo, txt: resumo(e) })),
    })
  }
  pessoas.sort((a, b) => (a.fim < b.fim ? 1 : -1))

  // 3. os números pra decidir: por anúncio, onde param, a página de venda, o formulário e o aparelho
  const porAnuncio: Record<string, any> = {}
  for (const p of pessoas) {
    const a = porAnuncio[p.anuncio] ||= { anuncio: p.anuncio, campanha: p.campanha, marca: p.marca, pessoas: 0, etapas: Object.fromEntries(ESCADA.map(e => [e, 0])), seg: [] as number[], rolou: [] as number[] }
    a.pessoas++
    for (let i = 0; i <= p.etapa_i; i++) a.etapas[ESCADA[i]]++
    if (p.pagina) { a.seg.push(p.pagina.seg); a.rolou.push(p.pagina.rolou) }
  }
  const anuncios = Object.values(porAnuncio).map((a: any) => ({ ...a, seg_mediana: mediana(a.seg), rolou_mediana: mediana(a.rolou), seg: undefined, rolou: undefined })).sort((x: any, y: any) => y.pessoas - x.pessoas)
  const conta = (f: (p: any) => string | null) => { const m: Record<string, number> = {}; for (const p of pessoas) { const k = f(p); if (k) m[k] = (m[k] || 0) + 1 } return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })) }
  const funil = Object.fromEntries(ESCADA.map((e, i) => [e, pessoas.filter(p => p.etapa_i >= i).length]))
  const soPagina = pessoas.filter(p => p.etapa_i === 0 && p.pagina)
  return NextResponse.json({
    desde, zero, regiao, agora: new Date().toISOString(), total: pessoas.length,
    escada: ESCADA.map(e => ({ id: e, nome: NOME_ETAPA[e] })), funil,
    onde_param: conta(p => p.grupo),
    pagina: { pessoas: soPagina.length, seg_mediana: mediana(soPagina.map(p => p.pagina.seg)), rolou_mediana: mediana(soPagina.map(p => p.pagina.rolou)),
      rolagem: conta(p => p.etapa_i === 0 && p.pagina ? (p.pagina.rolou < 25 ? '0-24%' : p.pagina.rolou < 50 ? '25-49%' : p.pagina.rolou < 75 ? '50-74%' : '75-100%') : null),
      secoes: conta(p => p.etapa_i === 0 && p.pagina?.secao ? p.pagina.secao : null),
      tempo: conta(p => p.etapa_i === 0 && p.pagina ? (p.pagina.seg < 5 ? 'menos de 5s' : p.pagina.seg < 15 ? '5 a 15s' : p.pagina.seg < 45 ? '15 a 45s' : 'mais de 45s') : null) },
    formulario: conta(p => p.etapa === 'comecou_form' ? 'passo ' + (p.passo_form || 1) + (PASSOS_FORM[p.passo_form || 1] ? ' · ' + PASSOS_FORM[p.passo_form || 1] : '') : null),
    aparelhos: conta(p => p.aparelho.so + ' · ' + p.aparelho.app),
    anuncios, pessoas: pessoas.slice(0, 400),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
