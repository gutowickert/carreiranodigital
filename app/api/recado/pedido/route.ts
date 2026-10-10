// Recado Encantado: o formulário manda os dados; salva o pedido e a foto, cria a cobrança e devolve o link de pagamento.
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { recadoDb as db } from '@/lib/recado/db'
import { recadoGateway as gateway } from '@/lib/recado/gateway'
import { recadoConfig as cfg } from '@/lib/recado/config'
import { enviaEmail, moldura, linkFamilia } from '@/lib/recado/email'

export const maxDuration = 30
const PREFIXO: Record<string, string> = { noel: 'NOEL-', fada: 'FADA-', guardiao: 'NOITE-', coragem: 'CORAGEM-', turbo: 'TURBO-', grandao: 'CHUPETA-' }
const dataOk = (s: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null
const codigo = (p: string) => (PREFIXO[p] || 'RECADO-') +Array.from(randomBytes(5)).map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
const limpa = (s: any, n = 120) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n)
const QUEM = ['mae', 'pai', 'avo', 'avo_m', 'tia', 'tio', 'madrinha', 'padrinho', 'outro']

export async function POST(req: NextRequest) {
  try {
    const b: any = await req.json()
    const pac = (cfg.pacotes[b.personagem] || {})[b.pacote]
    if (!pac) return NextResponse.json({ erro: 'pacote inválido' }, { status: 400 })
    const c = b.crianca || {}, ct = b.contato || {}
    if (!limpa(c.nome) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpa(ct.email))) return NextResponse.json({ erro: 'faltou o nome ou um e-mail válido' }, { status: 400 })
    // celular é opcional (Guto 10/10: a entrega é na página da família, com o link no e-mail)
    let wa = String(ct.whatsapp || '').replace(/\D/g, ''); if (wa && (wa.length < 10 || wa.length > 13)) return NextResponse.json({ erro: 'celular inválido' }, { status: 400 })
    if (wa && !wa.startsWith('55')) wa = '55' + wa
    const crianca: any = {
      nome: limpa(c.nome, 40), apelido: limpa(c.apelido || c.nome, 40), idade: Math.max(1, Math.min(14, +c.idade || 0)), genero: c.genero === 'menino' ? 'menino' : 'menina', cidade: limpa(c.cidade, 60),
      conquistas: (c.conquistas || []).map((x: any) => limpa(x)).filter(Boolean).slice(0, 4), adora: (c.adora || []).map((x: any) => limpa(x, 60)).filter(Boolean).slice(0, 6),
      pra_melhorar: limpa(c.pra_melhorar), detalhe_magico: limpa(c.detalhe_magico, 200),
    }
    // quem pediu (avó, tia, madrinha...): o personagem conta que foi essa pessoa que mandou o recado
    if (QUEM.includes(c.quem_pede)) { crianca.quem_pede = c.quem_pede; if (!['mae', 'pai'].includes(c.quem_pede) && limpa(c.quem_pede_nome, 40)) crianca.quem_pede_nome = limpa(c.quem_pede_nome, 40) }
    if (b.personagem === 'noel') { crianca.presente_modo = c.presente_modo === 'presente' ? 'presente' : 'surpresa'; crianca.presente = crianca.presente_modo === 'presente' ? limpa(c.presente) : 'surpresa' }
    else if (b.pacote === 'recado') { crianca.dentinho = limpa(c.dentinho); crianca.como_caiu = limpa(c.como_caiu); crianca.deixa_presente = limpa(c.deixa_presente) }
    // missão: o desafio contado pela mãe e as datas (o trabalhador agenda cada vídeo a partir delas)
    let missao: any = null
    if (pac.etapas) {
      const m = b.missao || {}
      missao = { tipo: b.pacote, desafio: limpa(m.desafio, 200), evento: limpa(m.evento, 40), data: dataOk(m.data), nome_objeto: limpa(m.nome_objeto, 40),
        presente: limpa(m.presente, 80), medo: limpa(m.medo, 160), ajuda: limpa(m.ajuda, 160), recompensa: limpa(m.recompensa, 80) }
      if ((b.pacote === 'coragem' || b.pacote === 'chupeta') && !missao.data) return NextResponse.json({ erro: 'faltou a data' }, { status: 400 })
    }
    const irmaos = Math.max(0, Math.min(3, +b.irmaos || 0))
    const preco = +(pac.preco + irmaos * cfg.irmao).toFixed(2)
    const p: any = { codigo: codigo(b.personagem), personagem: b.personagem, pacote: b.pacote, preco, crianca, missao, contato: { responsavel: limpa(ct.responsavel, 60), whatsapp: wa, email: limpa(ct.email, 120) }, origem: b.origem || null, visitante: limpa(b.origem?.visitante, 40) || null }
    if (b.foto && /^data:image\/(jpeg|png|webp);base64,/.test(b.foto)) {
      const buf = Buffer.from(b.foto.split(',')[1], 'base64'); if (buf.length > 4e6) return NextResponse.json({ erro: 'foto muito grande' }, { status: 400 })
      p.foto_path = await db.sobe(`${p.codigo}/foto.jpg`, buf, 'image/jpeg')
    }
    const salvo = await db.insere('pedidos', p)
    await db.evento(salvo.id, 'criado', { pacote: pac.nome, preco })
    const cob = await gateway.cria({ ...p, descricao: `${cfg.marca}: ${pac.nome} (${crianca.nome})` })
    await db.atualiza('pedidos', `id=eq.${salvo.id}`, { gateway: gateway.nome(), gateway_id: cob.gateway_id, checkout_url: cob.checkout_url })
    await db.evento(salvo.id, 'cobranca', { gateway: gateway.nome() })
    // e-mail com o link da página da família (é lá que tudo chega); se falhar, o pedido segue
    const em = await enviaEmail(p.contato.email, `Teu pedido do Recado Encantado (${crianca.nome})`,
      moldura('Recebemos o pedido!', `Assim que o pagamento confirmar, a gente começa a preparar tudo pra ${crianca.nome}. Na página da família tu acompanha o andamento, paga se ainda não pagou, e é lá que o vídeo aparece.`, 'Abrir a página da família', linkFamilia(p.codigo)))
    await db.evento(salvo.id, 'email_pedido', em).catch(() => {})
    return NextResponse.json({ codigo: p.codigo, checkout_url: cob.checkout_url })
  } catch (e: any) {
    console.error('recado/pedido', e)
    return NextResponse.json({ erro: 'não deu pra criar o pedido agora, tenta de novo em instantes' }, { status: 500 })
  }
}
