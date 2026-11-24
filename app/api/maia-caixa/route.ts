// A CAIXA DO NÚMERO DA MAIA DENTRO DO CRM DA ESCOLA (24/11/2026, pedido do Nando: "pode fazer tudo logo, que o
// Guto está iniciando a campanha"). Ver, responder, assumir e devolver as conversas do WhatsApp da Maia
// (51 99376-7137), que ficam nas tabelas oito_wa_conversas / oito_wa_msgs — separadas do número da escola.
//
// Combinado com a janela da Maia (24/11): esta rota só USA lib/oito/db e lib/oito/wa (não mexe neles, nem em
// lib/maia/*, nem no webhook do número). O sinal pra vendedora ficar quieta é o `modo` da conversa:
//   - Assumir  → modo 'humano'
//   - Responder → manda pelo número da Maia, grava como autor 'dono' (a vendedora lê como EQUIPE) e já assume
//   - Devolver → modo 'ia' e ia_respostas 0 (senão a vendedora, com 30 respostas, devolve pro time na hora);
//                a fase fica como está ('maia' é a da vendedora). "Devolver e responder" chama atendeConversa.
// Quem pode: admin ou quem tem a caixa do WhatsApp (wa_caixa), igual à caixa da escola.
import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { usuarioLogado } from '@/lib/exigir-login'
import { oitoDb as db } from '@/lib/oito/db'
import { enviaTexto, registraSaida, janelaAberta, waLigado } from '@/lib/oito/wa'

export const maxDuration = 60

async function podeVer(req: Request): Promise<{ ok: boolean; nome?: string }> {
  const uid = await usuarioLogado(req)
  if (!uid) return { ok: false }
  const { data: p } = await sb.from('usuarios_perfil').select('nome, papel, wa_caixa, ativo').eq('id', uid).maybeSingle()
  return { ok: !!p && p.ativo !== false && (p.papel === 'admin' || p.wa_caixa === true), nome: p?.nome }
}

const CAMPOS_LEAD = 'id, nome, etapa, negocio, maior_problema, qualificacao, vendedor_id'

export async function GET(req: Request) {
  if (!(await podeVer(req)).ok) return NextResponse.json({ ok: false, erro: 'sem acesso' }, { status: 401 })
  const u = new URL(req.url)
  const id = u.searchParams.get('conversa')
  try {
    if (id) {
      const cv = await db.um('wa_conversas', { id })
      if (!cv) return NextResponse.json({ ok: false, erro: 'conversa não encontrada' }, { status: 404 })
      const msgs = await db.lista('wa_msgs', { conversa_id: id }, { ordem: 'criado_em', campos: 'id, autor, tipo, texto, status, erro, criado_em' })
      const leadId = cv.rascunho?.maia?.lead_id
      const { data: lead } = leadId ? await sb.from('leads').select(CAMPOS_LEAD).eq('id', leadId).maybeSingle() : { data: null }
      return NextResponse.json({ ok: true, conversa: limpa(cv), mensagens: msgs.slice(-300), lead, janela: janelaAberta(cv) })
    }
    // a lista: as conversas do número, mais recentes primeiro (a escala é pequena: dezenas)
    const todas = await db.lista('wa_conversas', {}, { ordem: 'ultima_msg_em', desc: true, limite: 400, campos: 'id, telefone, nome, modo, fase, nao_lidas, ia_respostas, ultima_msg, ultima_msg_em, janela_ate, optout, simulado, rascunho' })
    const reais = todas.filter((c: any) => !c.simulado)
    const ids = Array.from(new Set(reais.map((c: any) => c.rascunho?.maia?.lead_id).filter(Boolean))) as string[]
    const leads: Record<string, any> = {}
    if (ids.length) {
      const { data } = await sb.from('leads').select(CAMPOS_LEAD).in('id', ids)
      for (const l of data || []) leads[l.id] = l
    }
    return NextResponse.json({
      ok: true,
      conversas: reais.map((c: any) => ({ ...limpa(c), lead: leads[c.rascunho?.maia?.lead_id] || null, janela: janelaAberta(c) })),
      naoLidas: reais.reduce((s: number, c: any) => s + (c.nao_lidas || 0), 0),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || 'erro' }, { status: 200 })
  }
}

// o rascunho tem coisa interna da vendedora; pra tela só interessa o lead
const limpa = (c: any) => { const { rascunho, ...resto } = c; return { ...resto, lead_id: rascunho?.maia?.lead_id || null } }

export async function POST(req: Request) {
  const quem = await podeVer(req)
  if (!quem.ok) return NextResponse.json({ ok: false, erro: 'sem acesso' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const id = String(b.id || '')
  const cv = id ? await db.um('wa_conversas', { id }) : null
  if (!cv) return NextResponse.json({ ok: false, erro: 'conversa não encontrada' })
  try {
    if (b.acao === 'lida') { await db.atualiza('wa_conversas', { id }, { nao_lidas: 0 }); return NextResponse.json({ ok: true }) }
    if (b.acao === 'assumir') { await db.atualiza('wa_conversas', { id }, { modo: 'humano' }); return NextResponse.json({ ok: true, modo: 'humano' }) }
    if (b.acao === 'devolver') {
      await db.atualiza('wa_conversas', { id }, { modo: 'ia', ia_respostas: 0 })
      let respondeu = false
      if (b.responder) {
        // a vendedora lê a conversa inteira (com o que o time falou) e responde agora
        const { atendeConversa } = await import('@/lib/oito/vendedor')
        await atendeConversa(id).catch(() => null)
        respondeu = true
      }
      return NextResponse.json({ ok: true, modo: 'ia', respondeu })
    }
    if (b.acao === 'responder') {
      const texto = String(b.texto || '').trim()
      if (!texto) return NextResponse.json({ ok: false, erro: 'mensagem vazia' })
      if (!waLigado()) return NextResponse.json({ ok: false, erro: 'O WhatsApp da Maia não está configurado neste sistema.' })
      // fora das 24 h da última mensagem do cliente a Meta só aceita modelo aprovado
      if (!janelaAberta(cv)) return NextResponse.json({ ok: false, erro: 'Passou de 24 horas da última mensagem do cliente: a Meta só deixa mandar modelo aprovado. Espera ele responder ou chama pelo número da escola.' })
      const r = await enviaTexto(cv.telefone, texto)
      await registraSaida(cv, 'dono', texto, r)
      if (!r.ok) return NextResponse.json({ ok: false, erro: 'A Meta recusou: ' + (r.erro || 'sem detalhe') })
      // o time falou: a vendedora fica quieta nessa conversa até alguém devolver
      await db.atualiza('wa_conversas', { id }, { modo: 'humano', nao_lidas: 0 })
      return NextResponse.json({ ok: true, modo: 'humano' })
    }
    return NextResponse.json({ ok: false, erro: 'ação desconhecida' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || 'erro' })
  }
}
