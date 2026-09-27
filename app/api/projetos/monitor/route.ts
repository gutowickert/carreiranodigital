import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { montarMonitor, LIMITES } from '@/lib/monitor-entregas'
import { sincronizarProjeto } from '@/lib/trafego-cliente'

export const maxDuration = 120

// Se o último sync de um cliente tem mais que isso, o monitor lê a Meta de novo antes de montar a tela.
// Abaixo disso reaproveita o banco: quem abre a tela três vezes em dois minutos não paga três leituras.
const FRESCOR_MIN = 10

// O MONITOR DAS ENTREGAS: todos os clientes em entrega com cor, alertas, recomendação,
// próximo encontro, quem contatar hoje e os encontros da semana. Interno: Guto e Mateus decidem em grupo aqui.
//
// AO VIVO (27/09/2026, pedido do Guto): antes de montar, sincroniza os últimos 3 dias de cada conta que
// está com o sync velho, em paralelo. Assim a tela mostra o que a Meta tem AGORA, igual ao Tráfego dos
// Clientes, e continua servindo os 30 dias de histórico que só o banco guarda. `?ao_vivo=0` desliga.
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const sp = new URL(req.url).searchParams
    const dias = Math.min(90, Math.max(1, Number(sp.get('dias')) || LIMITES.janelaDias))
    const aoVivo = sp.get('ao_vivo') !== '0'

    let sincronizados = 0, falhas: string[] = []
    if (aoVivo) {
      const { data: projetos } = await sb.from('projetos').select('*').eq('org_id', org).in('status', ['ativo', 'manutencao']).not('ad_account_id', 'is', null)
      const limite = new Date(Date.now() - FRESCOR_MIN * 60000).toISOString()
      const velhos = (await Promise.all((projetos || []).map(async p => {
        const { data } = await sb.from('trafego_anuncios_dia').select('atualizado_em').eq('projeto_id', p.id).order('atualizado_em', { ascending: false }).limit(1)
        const ultimo = data?.[0]?.atualizado_em as string | undefined
        return !ultimo || ultimo < limite ? p : null
      }))).filter(Boolean) as any[]
      const rs = await Promise.all(velhos.map(async p => { try { return { p, r: await sincronizarProjeto(p) } } catch (e: any) { return { p, r: { ok: false, error: e?.message } } } }))
      for (const { p, r } of rs) { if ((r as any).ok) sincronizados++; else falhas.push(`${p.cliente}: ${(r as any).error || 'erro'}`) }
    }

    const monitor = await montarMonitor(org, dias)
    return NextResponse.json({ ...monitor, ao_vivo: aoVivo, sincronizados, falhas_sync: falhas, atualizado_em: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
