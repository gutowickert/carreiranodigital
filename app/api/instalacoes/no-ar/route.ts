import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 60

// "ESTÁ NO AR?" — a escola chama o endereço de cada sistema e vê se responde.
//
// ⚠️ ISTO NÃO MEXE EM NENHUM CLIENTE. É uma visita à porta da frente, o mesmo que abrir o site no
// navegador: nenhuma chave, nenhum dado, nenhuma alteração do outro lado.
//
// ⚠️ E NÃO É DIAGNÓSTICO. Responder 200 quer dizer "o site está de pé", não "o motor rodou" nem "o
// WhatsApp está conectado" — isso só o sistema do cliente sabe dizer, e depende de mudança no
// núcleo que desce pras instalações. Está fora daqui de propósito, pra ninguém ler verde e achar
// que está tudo certo lá dentro.
//
// O achado que justificou existir: na conferência de 23/09, JamRock e Núcleo não respondiam no
// endereço que a gente achava que era o deles.

const TEMPO = 8000

async function bate(url: string) {
  const t0 = Date.now()
  const corta = AbortSignal.timeout(TEMPO)
  try {
    // GET, não HEAD: alguns hosts respondem 405 pra HEAD e pareceria que o sistema caiu
    const r = await fetch(url.replace(/\/$/, '') + '/login', { signal: corta, redirect: 'follow' })
    return { ok: r.status < 400, status: r.status, ms: Date.now() - t0 }
  } catch (e: any) {
    return { ok: false, status: 0, ms: Date.now() - t0, erro: e?.name === 'TimeoutError' ? 'demorou demais' : 'não respondeu' }
  }
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const { data: perfil } = await sb.from('usuarios_perfil').select('papel').eq('id', quem.eu.id).maybeSingle()
    if (perfil?.papel !== 'admin') return NextResponse.json({ ok: false, error: 'só administradores' }, { status: 403 })

    const { data } = await sb.from('instalacoes').select('id, url').eq('org_id', org).eq('ativo', true).not('url', 'is', null)
    const alvos = (data || []) as { id: string; url: string }[]
    const res = await Promise.all(alvos.map(async i => ({ id: i.id, ...(await bate(i.url)) })))
    return NextResponse.json({ ok: true, estado: Object.fromEntries(res.map(r => [r.id, r])) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
