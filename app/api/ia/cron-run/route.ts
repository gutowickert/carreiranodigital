import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// ⏱️ ORQUESTRADOR dos jobs da IA — um endpoint que o pg_cron (Supabase) chama e que roda a SEQUÊNCIA da fase
// em lotes, dentro de um orçamento de tempo (~52s). Idempotente e resumível: se não terminar numa chamada,
// o pg_cron chama de novo e ele continua de onde parou (cada passo só processa o que ainda falta).
//   fase=noite  → virada (quem respondeu hoje) → sync-pool
//   fase=manha  → warming → virada de ONTEM (rede de segurança) → reconciliar → follow-up → posse-funil → sync-pool
const BASE = 'https://carreiranodigital.vercel.app'
const ORCAMENTO_MS = 52_000

const post = (path: string, body: any) => fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null)
const ontemUTC = () => { const d = new Date(Date.now() - 864e5); return d.toISOString().slice(0, 10) }

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  const restam = () => ORCAMENTO_MS - (Date.now() - t0)
  const fase = (new URL(req.url).searchParams.get('fase') || 'noite').toLowerCase()
  const log: string[] = []

  // roda um passo em LOTE até restantes=0 ou acabar o tempo. `campo` = qual chave da resposta indica pendência.
  const emLote = async (nome: string, path: string, body: any, campo = 'restantes', maxRodadas = 30) => {
    for (let i = 0; i < maxRodadas && restam() > 8000; i++) {
      const r = await post(path, body)
      const pend = r ? Number(r[campo] ?? 0) : -1
      if (r?.ok === false) { log.push(`${nome}: erro ${r.error || ''}`.trim()); break }
      if (i === 0 || pend > 0) log.push(`${nome} #${i + 1} → ${campo}:${pend}`)
      if (!r || pend <= 0) break
    }
  }

  try {
    if (fase === 'manha') {
      await emLote('warming', '/api/ia/resumos', { limit: 10 })
      if (restam() > 12000) await emLote('virada-ontem', '/api/ia/virada', { dryRun: false, confirm: true, limit: 5, data: ontemUTC() })
      if (restam() > 8000) { const r = await post('/api/ia/reconciliar', { dryRun: false, confirm: true, dias: 3 }); log.push('reconciliar → ' + (r?.ok ? 'ok' : 'erro')) }
      if (restam() > 12000) await emLote('followup', '/api/ia/followup-auto', { dryRun: false, confirm: true, limit: 60 }, 'planejados', 6)
      if (restam() > 8000) { const r = await post('/api/ia/posse-funil', { dryRun: false, confirm: true }); log.push('posse-funil → ' + (r?.passaramPraIA ?? '?') + ' pra IA, ' + (r?.tarefasCadenciaCanceladas ?? '?') + ' tarefas limpas') }
      if (restam() > 6000) { const r = await post('/api/ia/garantir-tarefas', { dryRun: false, confirm: true }); log.push('garantir-tarefas → ' + (r?.criadas ?? '?') + ' órfãos do time') }
      // roteador de turma: 10d após uma turma começar, rola os órfãos dela pra próxima turma (1 toque de reativação)
      if (restam() > 6000) { const r = await post('/api/ia/roteador-turma', { dryRun: false, confirm: true }); log.push('roteador-turma → ' + (r?.reativados ?? '?') + ' reativados' + (r?.semProxima?.length ? ` ⚠️ ${r.semProxima.length} turma(s) SEM próxima (decidir)` : '')) }
      // sem-cidade → perda em 2 dias: quem recebeu "qual tua cidade?" e não respondeu vira perda (pool de disparo)
      if (restam() > 6000) { const r = await post('/api/ia/sem-cidade-perda', { dryRun: false, confirm: true }); log.push('sem-cidade-perda → ' + (r?.perdidos ?? '?') + ' perdidos (de ' + (r?.candidatos ?? '?') + ')') }
      if (restam() > 6000) await emLote('sync-pool', '/api/ia/sync-pool', { dryRun: false, confirm: true, limit: 800 }, 'inseridos', 3)
    } else { // noite
      // limit 5 (era 10): 10 interpretações LLM numa chamada estouravam os 60s → morria sem processar.
      // Com 5 cada chamada completa; o emLote faz várias rodadas e os passes noturnos escalonados drenam o resto.
      await emLote('virada', '/api/ia/virada', { dryRun: false, confirm: true, limit: 5 })
      if (restam() > 6000) await emLote('sync-pool', '/api/ia/sync-pool', { dryRun: false, confirm: true, limit: 800 }, 'inseridos', 3)
    }
    return NextResponse.json({ ok: true, fase, gastou_ms: Date.now() - t0, log })
  } catch (e: any) {
    return NextResponse.json({ ok: false, fase, error: e?.message || 'erro', log }, { status: 200 })
  }
}
