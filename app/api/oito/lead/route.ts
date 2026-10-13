// Oito Posts: o formulário de entrada. Grava o negócio e abre o lote de teste (2 posts grátis).
// O lote nasce em "espera": as fotos sobem depois, com o código; o "liberar" (rota cliente) põe na fila.
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { oitoDb as db, novoCodigo } from '@/lib/oito/db'
import { oitoConfig as cfg, ehMarca, emEspanhol } from '@/lib/oito/config'
import { avisaDono } from '@/lib/oito/servico'

const t = (s: any, n = 300) => (typeof s === 'string' ? s.trim().slice(0, n) : '')
const soDigitos = (s: any) => t(s, 30).replace(/\D/g, '')

export async function POST(req: Request) {
  try {
    const b = await req.json()
    if (!ehMarca(b.marca)) return NextResponse.json({ erro: 'marca' }, { status: 400 })
    const n = b.negocio || {}, x = b.contexto || {}
    // 13/10: as marcas em espanhol vendem na Colômbia (+57, celular de 10 dígitos) e no Chile (+56, celular de 9)
    const es = emEspanhol(b.marca), pais = es ? (b.pais === 'CL' ? 'CL' : 'CO') : 'BR'
    let whats = soDigitos(n.whatsapp)
    if (pais === 'BR' && (whats.length === 10 || whats.length === 11)) whats = '55' + whats
    if (pais === 'CO' && whats.length === 10) whats = '57' + whats
    if (pais === 'CL' && whats.length === 9) whats = '56' + whats
    const whatsOk = pais === 'BR' ? whats.length >= 12 : pais === 'CO' ? /^57\d{10}$/.test(whats) : /^56\d{9}$/.test(whats)
    if (!t(n.nome) || !whatsOk || !t(n.cidade)) return NextResponse.json({ erro: es ? 'Falta el nombre del negocio, la ciudad o el WhatsApp.' : 'Faltou o nome do negócio, a cidade ou o WhatsApp.' }, { status: 400 })

    // o mesmo WhatsApp já pediu teste nessa marca: devolve o que já existe (não gera de novo)
    // TRAVA DE TESTES REPETIDOS (13/10): quem já pediu não ganha outro, volta pros posts que já recebeu.
    // Mesmo WhatsApp (qualquer marca) · mesmo @ · mesmo negócio na mesma cidade · o mesmo aparelho · até 3 testes por conexão em 24 h.
    const norm = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const ig = t(n.instagram, 60).replace(/^@/, '').toLowerCase()
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    const ipHash = ip ? crypto.createHash('sha256').update('oito:' + ip).digest('hex').slice(0, 32) : null
    const todos = (await db.lista('clientes', {}, { ordem: 'criado_em', desc: true, limite: 3000 })).filter(c => !c.exemplo)
    const doAparelho = Array.isArray(b.ja) ? b.ja.map((x: any) => String(x).toUpperCase()).slice(0, 10) : []
    const ja = todos.find(c => c.whatsapp === whats)
      || (ig && todos.find(c => String(c.instagram || '').toLowerCase() === ig))
      || todos.find(c => norm(c.nome_negocio) === norm(n.nome) && norm(c.cidade) === norm(n.cidade))
      || todos.find(c => doAparelho.includes(c.codigo))
    if (ja) {
      await db.evento('teste_repetido', { cliente_id: ja.id, marca: b.marca, detalhe: { motivo: ja.whatsapp === whats ? 'whatsapp' : 'outro' } })
      return NextResponse.json({ codigo: ja.codigo, marca: ja.marca, existente: true })
    }
    if (ipHash) {
      const dia = new Date(Date.now() - 86400e3).toISOString()
      const daConexao = todos.filter(c => c.ip_hash === ipHash && c.criado_em >= dia)
      if (daConexao.length >= 3) return NextResponse.json({ codigo: daConexao[0].codigo, marca: daConexao[0].marca, existente: true })
    }

    const contexto = {
      servicos: t(x.servicos, 600), carro_chefe: t(x.carro_chefe), diferencial: t(x.diferencial, 500), publico: t(x.publico, 400),
      preco_medio: t(x.preco_medio, 80), tom: t(x.tom, 40), evitar: t(x.evitar, 400), horario: t(x.horario, 200), extra: t(x.extra, 600),
    }
    const c = await db.insere('clientes', {
      codigo: novoCodigo(), marca: b.marca, status: 'teste', exemplo: false,
      nome_negocio: t(n.nome, 120), responsavel: t(n.responsavel, 120), whatsapp: whats, email: t(n.email, 160).toLowerCase(),
      cidade: t(n.cidade, 80), bairro: t(n.bairro, 80), instagram: t(n.instagram, 60).replace(/^@/, ''),
      contexto, cores: b.cores && typeof b.cores === 'object' ? { fundo: t(b.cores.fundo, 9), destaque: t(b.cores.destaque, 9), texto: t(b.cores.texto, 9), nome: t(b.cores.nome, 40) } : null,
      ip_hash: ipHash, pais, gateway: es ? 'hotmart' : 'asaas', documento: es ? t(n.documento, 20) || null : null, fotos_modo: b.fotos_modo === 'enviar' ? 'enviar' : 'ia', utm: b.utm && typeof b.utm === 'object' ? b.utm : null, sessao: t(b.sessao, 60),
    })
    await db.insere('lotes', { cliente_id: c.id, tipo: 'teste', qtd: cfg.postsTeste, status: 'espera' })
    await db.evento('lead', { cliente_id: c.id, marca: c.marca, sessao: c.sessao, detalhe: { fotos_modo: c.fotos_modo } })
    avisaDono('teste pedido', `${cfg.marcas[c.marca as 'salao'].nome + (es ? ' (' + pais + ')' : '')} · ${c.nome_negocio} (${c.cidade})`)
    return NextResponse.json({ codigo: c.codigo })
  } catch (e: any) {
    console.error('oito lead', e)
    return NextResponse.json({ erro: 'Não deu pra salvar agora. Tenta de novo em um minuto. / No se pudo guardar. Intenta de nuevo en un minuto.' }, { status: 500 })
  }
}
