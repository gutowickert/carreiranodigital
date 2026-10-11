// Recado Encantado: pedido de ajuda da família (página do pedido ou site), 11/10.
// Grava em recado_suporte (aparece na aba Suporte do painel), avisa o dono no celular e confirma por e-mail pra família.
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { avisaDono } from '@/lib/recado/avisa-dono'
import { enviaEmail, moldura, linkFamilia, SUPORTE } from '@/lib/recado/email'
import { recadoConfig as cfg } from '@/lib/recado/config'

const limpa = (s: any, n: number) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, n)

export async function POST(req: NextRequest) {
  try {
    const b: any = await req.json()
    if (limpa(b.site, 50)) return NextResponse.json({ ok: true })   // campo escondido: só robô preenche
    const email = limpa(b.email, 120).toLowerCase(), mensagem = limpa(b.mensagem, 2000), codigo = limpa(b.codigo, 40).toUpperCase() || null
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ erro: 'Confere o teu e-mail.' }, { status: 400 })
    if (mensagem.length < 5) return NextResponse.json({ erro: 'Escreve a tua mensagem.' }, { status: 400 })
    let nome = limpa(b.nome, 80) || null
    if (codigo && !nome) {
      const [p] = await db.busca('pedidos', `codigo=eq.${encodeURIComponent(codigo)}&select=contato`).catch(() => [])
      nome = p?.contato?.responsavel || null
    }
    const s = await db.insere('suporte', { codigo, nome, email, mensagem, pagina: limpa(b.pagina, 200) || null, origem: 'pagina', assunto: `Ajuda${codigo ? ' · pedido ' + codigo : ''}`, nao_lidas: 1 })
    await db.insere('suporte_msgs', { suporte_id: s.id, direcao: 'entrada', de: email, texto: mensagem }).catch(() => null)   // a conversa no painel
    await avisaDono('🆘 Pedido de ajuda', `${nome || email}${codigo ? ' · pedido ' + codigo : ''}\n${mensagem.slice(0, 400)}\nResponder pra: ${email}`, 'sos').catch(() => null)
    await enviaEmail(email, 'Recebemos a tua mensagem',
      moldura('Recebemos a tua mensagem', `Obrigado por escrever. A gente responde aqui no teu e-mail (${email}) o quanto antes.${codigo ? ` Pedido ${codigo}.` : ''}`,
        codigo ? 'Abrir a página do pedido' : 'Abrir o site', codigo ? linkFamilia(codigo) : cfg.urlSite)).catch(() => null)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('recado/suporte', e)
    return NextResponse.json({ erro: `Não deu agora. Escreve direto pra ${SUPORTE}` }, { status: 500 })
  }
}
