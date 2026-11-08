// Maia Gestora (T15, 08/11): de onde ela lê. Trazido de ferramentas/maia-gestora/lib/fontes.js.
// TUDO SÓ LEITURA: o único método HTTP deste arquivo é GET (a trava está em `pega`). Nada escreve no CRM nem na Meta.
//
// CRM (teunegócio OS), em maia_negocios.crm:
//   {"tipo":"teunegocio","mesmo_banco":true}                                    → a escola: o CRM está no banco deste sistema
//   {"tipo":"teunegocio","url_env":"MAIA_CRM_DANI_URL","chave_env":"MAIA_CRM_DANI_LEITURA"} → os outros, com a chave SÓ DE LEITURA
//      (db/teunegocio-os-leitura.sql). A chave fica só na Vercel; aqui vai o NOME da variável, que tem que começar com MAIA_CRM_.
//   {"tipo":"pasta","pasta":"..."}  → só no modo local (MAIA_LOCAL=1): os .json de um CRM baixado (teste e comparação)
//   Sem a chave: o CRM do negócio é pulado e a nota diz isso (as regras da Meta rodam do mesmo jeito).
// META (números dos anúncios), juntadas (a última ganha no mesmo anúncio+dia):
//   1) trafego_anuncios_dia deste banco (a rotina do tráfego já grava Wood, Dani e Gaja todo dia)
//   2) no modo local, MAIA_GESTORA_META_PASTA/<chave>.json (o que o conector baixou, como o vigia fazia)
//   3) a Graph API (GET /insights), com o token do sistema que a Maia já usa (MAIA_ADS_TOKEN ou FB_ADS_TOKEN)
// No modo local, o banco, a Meta e os CRMs de verdade só são lidos com MAIA_GESTORA_LER_REAL=1 (o teste com dados inventados não sai do PC).
import fs from 'node:fs'
import path from 'node:path'
import { maiaLocal } from './db'
import type { LinhaMeta } from './gestora'

const GRAPH = 'https://graph.facebook.com/v25.0'
const D = 86400e3
export const leituraReal = () => !maiaLocal() || process.env.MAIA_GESTORA_LER_REAL === '1'

// SÓ GET. Não trocar.
async function pega(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method: 'GET', headers, cache: 'no-store', signal: AbortSignal.timeout(30000) })
  const t = await r.text()
  let j: any = null; try { j = JSON.parse(t) } catch { j = null }
  return { ok: r.ok, status: r.status, j }
}

// ─────────────────────────────── CRM
// cada tabela com a janela de datas que as regras usam (nunca o banco inteiro). `sem` é a consulta de reserva quando a coluna
// do filtro não existe naquele CRM (cada sistema tem colunas um pouco diferentes).
function tabelasCRM(agora: number) {
  const d = (n: number) => new Date(agora - n * D).toISOString()
  return {
    etapas: { q: 'select=chave,label,ordem,papel,ativo' },
    leads: { q: `select=id,nome,whatsapp,origem,etapa,anuncio_id,anuncio_titulo,ctwa_clid,valor_venda,data_ganho,criado_em,atualizado_em&or=(criado_em.gte.${d(180)},atualizado_em.gte.${d(180)})`, sem: `select=id,nome,whatsapp,origem,etapa,anuncio_id,ctwa_clid,criado_em,atualizado_em&criado_em=gte.${d(180)}` },
    matriculas: { q: `select=id,lead_id,status,valor_pago,data_compra,criado_em&criado_em=gte.${d(180)}` },
    lead_andamentos: { q: `select=lead_id,etapa_anterior,etapa_nova,tipo,criado_em&criado_em=gte.${d(45)}` },
    wa_conversas: { q: `select=id,telefone,lead_id,ultima_msg_em,nao_lidas,criado_em,eh_grupo&ultima_msg_em=gte.${d(30)}` },
    wa_mensagens: { q: `select=conversa_id,direcao,status,criado_em,texto&criado_em=gte.${d(21)}` },
    webhook_logs: { q: `select=origem,evento,status,erro,payload,recebido_em&status=eq.erro&recebido_em=gte.${d(30)}` },
    orcamento_aberturas: { q: `select=*&aberto_em=gte.${d(7)}`, sem: 'select=*&limit=1000' },
    orcamentos: { q: `select=id,lead_id,criado_em,aceito_em&criado_em=gte.${d(180)}` },
  } as Record<string, { q: string; sem?: string }>
}

async function lerREST(U: string, K: string, agora: number) {
  const H = { apikey: K, Authorization: 'Bearer ' + K }
  const out: Record<string, any[]> = {}, faltas: string[] = []
  for (const [t, cfg] of Object.entries(tabelasCRM(agora))) {
    let q = cfg.q, tentativas = 0, usouReserva = false
    let tudo: any[] | null = []
    for (let de = 0; ;) {
      const r = await pega(`${U}/rest/v1/${t}?${q}`, { ...H, Range: `${de}-${de + 999}` })
      // coluna que não existe nesse CRM: tira do select e tenta de novo; se for a do filtro, usa a consulta de reserva
      const col = r.j?.code === '42703' && String(r.j.message).match(/column \w+\.(\w+) does not exist/)?.[1]
      if (col && tentativas++ < 8) {
        const sem = q.replace(new RegExp(`(select=[^&]*?)(,${col}\\b|\\b${col},)`), '$1')
        if (sem !== q) { q = sem; continue }
        if (cfg.sem && !usouReserva) { q = cfg.sem; usouReserva = true; continue }
      }
      if (!r.ok || !Array.isArray(r.j)) { tudo = null; if (r.status !== 404) faltas.push(t + ' (' + r.status + ')'); break }
      tudo = tudo!.concat(r.j); if (r.j.length < 1000) break; de += 1000
      if (de > 50000) break   // trava: nunca puxa mais que isso de uma tabela
    }
    if (tudo) out[t] = tudo
  }
  return { dados: out, faltas }
}

function lerPasta(pasta: string) {
  const out: Record<string, any> = {}
  for (const a of fs.readdirSync(pasta)) if (a.endsWith('.json')) { try { out[a.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(pasta, a), 'utf8')) } catch { /* arquivo ruim: pula */ } }
  // a Wood não tem wa_mensagens baixado: as conversas de empresa (lidas à mão em 06/11) viram mensagens
  if (!out.wa_mensagens && out['conversas-empresa']) {
    out.wa_mensagens = []
    const porNome = Object.fromEntries((out.leads || []).map((l: any) => [String(l.nome || '').trim().toLowerCase(), l]))
    out['conversas-empresa'].forEach((c: any, i: number) => {
      const lead: any = porNome[String(c.nome || '').trim().toLowerCase()]
      const id = 'empresa-' + i
      ;(out.wa_conversas ||= []).push({ id, lead_id: lead?.id || null, ultima_msg_em: c.msgs?.at(-1)?.criado_em, sintetica: true })
      for (const m of c.msgs || []) out.wa_mensagens.push({ conversa_id: id, direcao: m.direcao, criado_em: m.criado_em, texto: m.texto })
    })
  }
  return out
}

// só nome de variável MAIA_CRM_* (uma linha errada no banco nunca aponta pra chave de serviço da escola)
const nomeOk = (n: any) => typeof n === 'string' && /^MAIA_CRM_[A-Z0-9_]+$/.test(n)

export type LeituraCRM = { dados: Record<string, any[]> | null; faltas: string[]; nota?: string; data_dos_dados?: string | null; fonte: string }

export async function lerCRM(neg: any, agora = Date.now()): Promise<LeituraCRM> {
  const crm = neg?.crm || {}
  if (crm.tipo === 'pasta') {
    if (!maiaLocal()) return { dados: null, faltas: [], nota: 'CRM em pasta só vale no modo local', fonte: 'pasta' }
    const p = path.resolve(/*turbopackIgnore: true*/ process.cwd(), String(crm.pasta || ''))
    if (!crm.pasta || !fs.existsSync(p)) return { dados: null, faltas: [], nota: 'CRM: a pasta do CRM não existe', fonte: 'pasta' }
    return { dados: lerPasta(p), faltas: [], data_dos_dados: crm.data_dos_dados || null, fonte: 'pasta' }
  }
  if (crm.tipo !== 'teunegocio') return { dados: null, faltas: [], nota: 'CRM: sem CRM configurado (só os avisos da Meta)', fonte: 'nenhum' }
  let U = '', K = ''
  if (crm.mesmo_banco) { U = process.env.NEXT_PUBLIC_SUPABASE_URL || ''; K = process.env.SUPABASE_SERVICE_ROLE_KEY || '' }
  else if (nomeOk(crm.url_env) && nomeOk(crm.chave_env)) { U = process.env[crm.url_env] || ''; K = process.env[crm.chave_env] || '' }
  if (!U || !K) return { dados: null, faltas: [], nota: `CRM pulado: falta a chave de leitura (${crm.mesmo_banco ? 'banco do sistema' : (nomeOk(crm.url_env) ? crm.url_env : 'MAIA_CRM_?_URL') + '/' + (nomeOk(crm.chave_env) ? crm.chave_env : 'MAIA_CRM_?_LEITURA')}). Os avisos de conversa e etapa não saíram.`, fonte: 'nenhum' }
  if (!leituraReal()) return { dados: null, faltas: [], nota: 'CRM: modo local sem MAIA_GESTORA_LER_REAL=1 (não lê CRM de verdade)', fonte: 'nenhum' }
  try {
    const r = await lerREST(U.replace(/\/+$/, ''), K, agora)
    return { dados: r.dados, faltas: r.faltas, nota: r.faltas.length ? 'CRM: não consegui ler ' + r.faltas.join(', ') : undefined, fonte: crm.mesmo_banco ? 'mesmo_banco' : 'chave_leitura' }
  } catch (e: any) { return { dados: null, faltas: [], nota: 'CRM: ' + String(e?.message || e).slice(0, 120), fonte: 'erro' } }
}

// o primeiro nome + inicial de alguns leads, lido na hora (a tela pede; nada fica gravado). Área da saúde: nunca.
export async function nomesDosLeads(neg: any, ids: string[]): Promise<Record<string, string>> {
  const so = ids.filter(i => /^[\w-]{1,64}$/.test(i)).slice(0, 30)
  if (!so.length || neg?.gestora?.saude) return {}
  const { primeiroNome } = await import('./gestora')
  const crm = neg?.crm || {}
  let leads: any[] = []
  if (crm.tipo === 'pasta' && maiaLocal()) {
    try { leads = JSON.parse(fs.readFileSync(path.join(path.resolve(/*turbopackIgnore: true*/ process.cwd(), String(crm.pasta)), 'leads.json'), 'utf8')) } catch { leads = [] }
    leads = leads.filter(l => so.includes(String(l.id)))
  } else if (crm.tipo === 'teunegocio' && leituraReal()) {
    let U = '', K = ''
    if (crm.mesmo_banco) { U = process.env.NEXT_PUBLIC_SUPABASE_URL || ''; K = process.env.SUPABASE_SERVICE_ROLE_KEY || '' }
    else if (nomeOk(crm.url_env) && nomeOk(crm.chave_env)) { U = process.env[crm.url_env] || ''; K = process.env[crm.chave_env] || '' }
    if (!U || !K) return {}
    const r = await pega(`${U.replace(/\/+$/, '')}/rest/v1/leads?select=id,nome&id=in.(${so.map(encodeURIComponent).join(',')})`, { apikey: K, Authorization: 'Bearer ' + K })
    leads = Array.isArray(r.j) ? r.j : []
  }
  return Object.fromEntries(leads.map(l => [String(l.id), primeiroNome(l.nome)]))
}

// ─────────────────────────────── META
export type LeituraMeta = { linhas: LinhaMeta[]; notas: string[]; usadas: string[] }

export async function lerMeta(neg: any, agora = Date.now(), chaveLocal?: string): Promise<LeituraMeta> {
  const conta = String(neg?.meta?.ad_account_id || '').replace(/^act_/, '')
  const linhas = new Map<string, LinhaMeta>(), notas: string[] = [], usadas: string[] = []
  const poe = (l: LinhaMeta) => linhas.set(l.data + '|' + l.ad_id, l)
  if (!conta) return { linhas: [], notas: ['Meta: o negócio não tem conta de anúncio (meta.ad_account_id)'], usadas }
  const hoje = new Date(agora - 3 * 3600e3).toISOString().slice(0, 10)
  const desde = new Date(Date.parse(hoje + 'T12:00:00Z') - 30 * D).toISOString().slice(0, 10)

  // 1) o que a rotina do tráfego já grava neste banco
  if (leituraReal()) {
    const U = process.env.NEXT_PUBLIC_SUPABASE_URL || '', K = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (U && K) {
      try {
        let n = 0
        for (let de = 0; de <= 20000; de += 1000) {
          const r = await pega(`${U}/rest/v1/trafego_anuncios_dia?select=data,ad_id,ad_name,campaign_name,adset_name,gasto,conversas&ad_account_id=eq.${encodeURIComponent(conta)}&data=gte.${desde}&order=data`, { apikey: K, Authorization: 'Bearer ' + K, Range: `${de}-${de + 999}` })
          if (!Array.isArray(r.j)) { notas.push('Meta (banco): ' + r.status); break }
          r.j.forEach((x: any) => poe({ ...x, ad_id: String(x.ad_id), gasto: +x.gasto || 0, conversas: +x.conversas || 0, status: '' }))
          n += r.j.length
          if (r.j.length < 1000) break
        }
        if (n) usadas.push('banco')
      } catch (e: any) { notas.push('Meta (banco): ' + String(e?.message || e).slice(0, 100)) }
    }
  }

  // 2) modo local: o que o conector baixou (meta/<cliente>.json do vigia)
  const pasta = process.env.MAIA_GESTORA_META_PASTA
  if (maiaLocal() && pasta) {
    const a = path.join(path.resolve(/*turbopackIgnore: true*/ process.cwd(), pasta), (chaveLocal || neg?.gestora?.chave || conta) + '.json')
    if (fs.existsSync(a)) {
      try { (JSON.parse(fs.readFileSync(a, 'utf8')) as any[]).forEach(l => poe({ ...l, ad_id: String(l.ad_id), gasto: +l.gasto || 0, conversas: +l.conversas || 0 })); usadas.push('arquivo') }
      catch { notas.push('Meta (arquivo): não deu pra ler') }
    }
  }

  // 3) a Graph API, só GET, com o token de sistema que a Maia já usa pras contas dos clientes
  const token = process.env.MAIA_ADS_TOKEN || process.env.FB_ADS_TOKEN || ''
  if (!leituraReal()) { /* teste local: não chama a Meta */ }
  else if (!token) notas.push('Meta: sem o token do sistema (MAIA_ADS_TOKEN/FB_ADS_TOKEN): lendo só o que está no banco')
  else {
    try {
      const filtro = JSON.stringify([{ field: 'spend', operator: 'GREATER_THAN', value: 0 }])
      let url: string | null = `${GRAPH}/act_${conta}/insights?level=ad&time_increment=1&limit=500&fields=ad_id,ad_name,campaign_name,adset_name,spend,actions&filtering=${encodeURIComponent(filtro)}&time_range=${encodeURIComponent(JSON.stringify({ since: desde, until: hoje }))}&access_token=${encodeURIComponent(token)}`
      let paginas = 0
      while (url && paginas++ < 20) {
        const r = await pega(url)
        if (!r.ok) { notas.push('Meta: ' + String(r.j?.error?.message || r.status).slice(0, 120)); break }
        for (const d of r.j.data || []) poe({ data: d.date_start, ad_id: String(d.ad_id), ad_name: d.ad_name, campaign_name: d.campaign_name, adset_name: d.adset_name, status: '', gasto: +d.spend || 0, conversas: +((d.actions || []).find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0) })
        url = r.j.paging?.next || null
      }
      usadas.push('graph')
    } catch (e: any) { notas.push('Meta: ' + String(e?.message || e).slice(0, 120)) }
  }
  return { linhas: [...linhas.values()], notas, usadas }
}
