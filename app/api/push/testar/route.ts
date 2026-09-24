import { NextRequest, NextResponse } from 'next/server'
import { enviarPushPara } from '@/lib/push'

// MANDA UM AVISO DE TESTE PRO PRÓPRIO APARELHO.
//
// ⚠️ EXISTE PORQUE "ESTÁ ATIVA" NÃO É UMA RESPOSTA. O Rick passou semanas vendo "notificações
// ativas" e sem receber nada, e ninguém — nem ele, nem eu — tinha como saber onde a corrente
// arrebentava: o cadastro? o envio? o aparelho? Cada palpite custava uma conversa e um dia.
//
// Este botão responde em cinco segundos: chegou o aviso, a corrente inteira funciona e o que falha
// é qual evento dispara; não chegou, o problema é do aparelho (permissão do sistema, economia de
// bateria, navegador diferente do que foi inscrito).
//
// Manda SÓ pro aparelho que pediu, pelo endereço dele. Um teste que avisa a empresa inteira vira
// motivo pra ninguém testar.
export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json().catch(() => ({} as any))
    if (!endpoint) return NextResponse.json({ ok: false, error: 'faltou o aparelho' }, { status: 200 })
    const r = await enviarPushPara(endpoint, '🔔 Teste', 'Se tu está lendo isto, os avisos funcionam neste aparelho.')
    return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.erro, recadastrar: r.recadastrar })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
