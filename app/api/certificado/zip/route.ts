import { NextRequest } from 'next/server'
import JSZip from 'jszip'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { carregarFontes, gerarCertificado } from '@/lib/certificado'

export const maxDuration = 120 // gerar vários PNGs leva tempo

// GET ?turma=<id> -> ZIP com o certificado de todos os matriculados da turma
export async function GET(req: NextRequest) {
  const turmaId = req.nextUrl.searchParams.get('turma')
  if (!turmaId) return new Response('falta turma', { status: 400 })
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data: turma } = await supabase.from('turmas').select('codigo').eq('org_id', org).eq('id', turmaId).single()
    if (!turma) return new Response('turma não encontrada', { status: 404 })
    const { data: mats } = await supabase.from('matriculas')
      .select('id, alunos(nome)').eq('org_id', org).eq('turma_id', turmaId)
    if (!mats?.length) return new Response('turma sem matrículas', { status: 404 })

    const fontes = await carregarFontes(req.nextUrl.origin)
    const zip = new JSZip()
    const usados = new Set<string>()
    for (const m of mats) {
      const cert = await gerarCertificado(m.id, fontes)
      if (!cert) continue
      let nome = cert.nomeArq || 'aluno'
      while (usados.has(nome)) nome += '-2'
      usados.add(nome)
      zip.file(`${nome}.png`, cert.buffer)
    }
    const out = await zip.generateAsync({ type: 'arraybuffer' })
    const arq = `certificados-${turma?.codigo || 'turma'}.zip`
    return new Response(out, {
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${arq}"` },
    })
  } catch (e: any) {
    return new Response('ERRO ZIP: ' + (e?.stack || e?.message || String(e)), { status: 500 })
  }
}
