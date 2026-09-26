import { randomBytes } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// AS CHAMADAS DO SISTEMA: criar o link, receber a gravação em pedaços, fechar (juntar,
// transcrever, gravar no histórico do lead). A conversa em si acontece entre os dois
// navegadores (WebRTC), este arquivo só cuida do antes e do depois.

const BUCKET = 'chamadas'
// código curto, sem letras ambíguas, pra caber num WhatsApp e ser lido por telefone se precisar
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
export const novoCodigo = (n = 8) => Array.from(randomBytes(n)).map(b => ALFABETO[b % ALFABETO.length]).join('')

export async function criarChamada(org: string, x: { lead_id?: string | null; lead_nome?: string | null; telefone?: string | null; criado_por: string; criado_por_nome: string; com_video?: boolean }) {
  const codigo = novoCodigo()
  const chave_host = randomBytes(18).toString('base64url')
  const { data, error } = await sb.from('chamadas').insert({
    org_id: org, codigo, chave_host, lead_id: x.lead_id || null, lead_nome: x.lead_nome || null, telefone: (x.telefone || '').replace(/\D/g, '') || null,
    criado_por: x.criado_por, criado_por_nome: x.criado_por_nome, com_video: !!x.com_video,
  }).select('*').single()
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, chamada: data }
}

export async function chamadaPorCodigo(codigo: string) {
  const { data } = await sb.from('chamadas').select('*').eq('codigo', codigo).maybeSingle()
  return data
}

// um pedaço da gravação (webm/opus, 30s). O primeiro traz o cabeçalho; concatenados em ordem
// formam um arquivo válido. O nome é o instante (segundos) em que o pedaço fechou: ordena certo
// no Storage e, se o host recarregar a página no meio, a gravação nova não sobrescreve a antiga.
export async function guardarPedaco(codigo: string, seq: number, buf: Buffer, mime = 'audio/webm') {
  const path = `${codigo}/${String(seq).padStart(5, '0')}.webm`
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: true })
  if (error) return { ok: false as const, error: error.message }
  const { data: lista } = await sb.storage.from(BUCKET).list(codigo, { limit: 1000 })
  const pedacos = (lista || []).filter(f => /^\d+\.webm$/.test(f.name)).length
  await sb.from('chamadas').update({ pedacos, status: 'em_andamento' }).eq('codigo', codigo).lt('pedacos', pedacos)
  return { ok: true as const, path }
}

// FECHAR: junta os pedaços, transcreve, grava no histórico. Roda depois de responder (after()).
export async function finalizarChamada(codigo: string) {
  const ch = await chamadaPorCodigo(codigo)
  if (!ch) return { ok: false, error: 'chamada não encontrada' }
  try {
    const { data: lista } = await sb.storage.from(BUCKET).list(codigo, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
    const pedacos = (lista || []).filter(f => /^\d+\.webm$/.test(f.name))
    let transcricao: string | null = null, gravacao_path: string | null = null
    if (pedacos.length) {
      const partes: Buffer[] = []
      for (const f of pedacos) {
        const { data } = await sb.storage.from(BUCKET).download(`${codigo}/${f.name}`)
        if (data) partes.push(Buffer.from(await data.arrayBuffer()))
      }
      const inteiro = Buffer.concat(partes)
      gravacao_path = `${codigo}/gravacao.webm`
      await sb.storage.from(BUCKET).upload(gravacao_path, inteiro, { contentType: 'audio/webm', upsert: true })
      transcricao = await transcrever(inteiro)
    }
    const duracao = ch.iniciada_em && ch.encerrada_em ? Math.max(0, Math.round((+new Date(ch.encerrada_em) - +new Date(ch.iniciada_em)) / 1000)) : ch.duracao_seg || 0

    // a linha em ligacoes: é o que o dossiê do lead e a IA já leem (atendida = mais de 60s)
    let ligacao_id: string | null = null
    if (ch.lead_id) {
      const { data: lig } = await sb.from('ligacoes').insert({
        org_id: ch.org_id, lead_id: ch.lead_id, vendedor_id: ch.criado_por, telefone: ch.telefone, direcao: ch.com_video ? 'video' : 'saida', status: 'encerrada',
        duracao, gravacao_url: gravacao_path, criado_em: ch.iniciada_em || ch.criado_em, atendida_em: ch.iniciada_em, encerrada_em: ch.encerrada_em,
        metadata: { origem: 'chamada_sistema', chamada_id: ch.id, codigo, transcricao: transcricao || '', com_video: ch.com_video },
      }).select('id').single()
      ligacao_id = lig?.id || null
      const min = Math.round(duracao / 60)
      await sb.from('lead_andamentos').insert({ lead_id: ch.lead_id, vendedor_id: ch.criado_por, tipo: 'ligacao', observacao: `📞 Chamada pelo sistema com ${ch.criado_por_nome || 'a escola'}: ${min ? `${min} min` : `${duracao}s`}${transcricao ? '. Transcrita no histórico.' : '.'}` })
    }
    // 'transcrita' = processada (mesmo sem fala detectada: aí transcricao fica nula e a tela diz isso)
    await sb.from('chamadas').update({ status: 'transcrita', duracao_seg: duracao, gravacao_path, transcricao, ligacao_id }).eq('id', ch.id)
    return { ok: true, duracao, pedacos: pedacos.length, transcrita: !!transcricao }
  } catch (e: any) {
    await sb.from('chamadas').update({ status: 'erro', erro: e?.message || 'falha ao fechar' }).eq('id', ch.id)
    return { ok: false, error: e?.message }
  }
}

// Deepgram com separação de quem fala: "[02:15] Falante 1: ..." A voz de quem convidou é a
// primeira a aparecer na maioria das chamadas, mas o rótulo é por falante, não por nome.
async function transcrever(buf: Buffer): Promise<string | null> {
  const key = process.env.DEEPGRAM_API_KEY || ''
  if (!key || !buf.length) return null
  const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true&diarize=true&utterances=true&keywords=Claude:2&keywords=Meta:1&keywords=tráfego:1', {
    method: 'POST', headers: { Authorization: `Token ${key}`, 'Content-Type': 'audio/webm' }, body: new Uint8Array(buf),
  })
  const j: any = await r.json().catch(() => null)
  if (!r.ok) return null
  const utts: any[] = j?.results?.utterances || []
  if (utts.length) {
    const mm = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    return utts.map(u => `[${mm(u.start)}] Falante ${(u.speaker ?? 0) + 1}: ${u.transcript}`).join('\n')
  }
  const t = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript
  return typeof t === 'string' && t.trim() ? t.trim() : null
}

export async function urlGravacao(path: string | null) {
  if (!path) return null
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl || null
}
