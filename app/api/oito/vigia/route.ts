// Oito Posts: o vigia (17/10). Roda a cada 5 min pelo pg_cron do Supabase (independe do gerador estar vivo) e avisa no celular:
//   · teste/mês/ajuste parado (na fila há mais de 8 min, gerando há mais de 10 min, ou com erro)
//   · o gerador sem sinal há mais de 10 min (os testes ficam na fila até ele voltar)
//   · cliente esperando resposta tua no WhatsApp (conversa em modo humano com mensagem não lida há mais de 15 min)
//   · o crédito da Anthropic ou do Replicate acabou (pelo erro registrado no lote)
// Cada aviso tem a sua janela (não repete o mesmo aviso nesse intervalo). GET ?chave=OITO_VIGIA_CHAVE
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { oitoConfig as cfg, Marca } from '@/lib/oito/config'
import { avisaProblema, alertaCredito } from '@/lib/oito/servico'

export const maxDuration = 60
const min = (iso: any) => (iso ? (Date.now() - new Date(iso).getTime()) / 60e3 : 0)
const TIPO: Record<string, string> = { teste: 'Teste', mes: 'Mês', ajuste: 'Ajuste' }

export async function GET(req: Request) {
  const chave = new URL(req.url).searchParams.get('chave')
  if (!process.env.OITO_VIGIA_CHAVE || chave !== process.env.OITO_VIGIA_CHAVE.trim()) return NextResponse.json({ erro: 'chave' }, { status: 401 })
  const avisos: string[] = []
  const desde = new Date(Date.now() - 3 * 86400e3).toISOString()

  // 1. lotes parados
  const lotes = (await db.lista('lotes', {}, { ordem: 'criado_em', desc: true, limite: 300 })).filter(l => l.criado_em > desde && ['fila', 'gerando', 'erro'].includes(l.status))
  for (const l of lotes) {
    const parado = l.status === 'erro' || (l.status === 'fila' && min(l.criado_em) > 8) || (l.status === 'gerando' && min(l.iniciado_em || l.criado_em) > 10)
    if (!parado) continue
    const c = await db.um('clientes', { id: l.cliente_id })
    if (!c || c.exemplo) continue
    if (l.status === 'erro' && (await alertaCredito('O gerador de posts', l.erro))) { avisos.push('crédito'); continue }
    const marca = cfg.marcas[c.marca as Marca]?.nome || c.marca
    const como = l.status === 'erro' ? `deu erro: ${String(l.erro || '').slice(0, 110)}` : l.status === 'fila' ? `na fila há ${Math.round(min(l.criado_em))} min` : `gerando há ${Math.round(min(l.iniciado_em))} min`
    if (await avisaProblema('lote_' + l.id, `${TIPO[l.tipo] || l.tipo} parado`, `${c.nome_negocio} (${marca}) · ${como}. Me avisa que eu coloco em dia.`, 180)) avisos.push('lote ' + c.codigo)
  }

  // 2. o gerador sem sinal
  const hb: any = (await db.um('estado', { chave: 'trabalhador' }))?.valor
  if (hb?.em && min(hb.em) > 10)
    if (await avisaProblema('gerador_parado', 'O gerador de posts parou', `Sem sinal há ${Math.round(min(hb.em))} min (Railway). Testes novos ficam na fila até ele voltar.`, 60)) avisos.push('gerador')

  // 3. cliente esperando resposta tua no WhatsApp
  const cvs = (await db.lista('wa_conversas', { modo: 'humano' }, { ordem: 'ultima_msg_em', desc: true, limite: 50 })).filter(cv => !cv.simulado && !cv.optout && (cv.nao_lidas || 0) > 0 && min(cv.ultima_msg_em) > 15 && min(cv.ultima_msg_em) < 48 * 60)
  for (const cv of cvs)
    if (await avisaProblema('wa_humano_' + cv.id, 'WhatsApp esperando tua resposta', `${cv.nome || cv.telefone}: "${String(cv.ultima_msg || '').slice(0, 120)}" (há ${Math.round(min(cv.ultima_msg_em))} min). Responde no painel, aba WhatsApp.`, 120)) avisos.push('whats ' + String(cv.telefone).slice(-4))

  return NextResponse.json({ ok: true, avisos, lotes_olhados: lotes.length, conversas_esperando: cvs.length })
}
