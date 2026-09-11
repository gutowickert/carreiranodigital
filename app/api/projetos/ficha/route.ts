import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { pessoasAtivas } from '@/lib/pessoas-org'
import { ROTEIROS, situacaoMarco, dataFimContrato, type Produto } from '@/lib/entrega'

// Ficha do cliente em entrega: o projeto, a linha do tempo, os andamentos e o
// que está pendente COM O CLIENTE. GET lê, PATCH edita o cadastro, POST mexe nas
// pendências (que é o que mais atrasa implantação e hoje fica solto no WhatsApp),
// no PLACAR (os números do contrato) e nos RESULTADOS e PROVAS.

const BUCKET = 'provas'   // privado: print de venda tem nome e valor do cliente do cliente
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
// "1.500,50" (digitado à brasileira) e "1500.50" (campo numérico) valem o mesmo;
// "40.000" sem vírgula é milhar, não 40
const num = (v: any) => {
  if (v === '' || v == null) return null
  const s = String(v).trim().replace(/^R\$\s*/i, '')
  const milhar = /^\d{1,3}(\.\d{3})+$/.test(s)
  const n = Number(s.includes(',') || milhar ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

export async function GET(req: Request) {
  try {
    // Sem login, não responde: sem token, `orgDaRequest` cai na empresa padrão e a rota entregava
    // (e gravava) como se fosse gente de dentro. A tela da ficha já manda o login.
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })

    const { data: projeto } = await sb.from('projetos').select('*').eq('org_id', org).eq('id', id).maybeSingle()
    if (!projeto) return NextResponse.json({ ok: false, error: 'projeto não encontrado' }, { status: 200 })

    const [{ data: marcos }, { data: andamentos }, { data: pendencias }, { data: placar }, { data: registros }, pessoas] = await Promise.all([
      sb.from('projeto_marcos').select('*').eq('projeto_id', id).order('ordem'),
      sb.from('projeto_andamentos').select('*').eq('projeto_id', id).order('criado_em', { ascending: false }).limit(100),
      sb.from('projeto_pendencias').select('*').eq('projeto_id', id).order('criado_em'),
      sb.from('projeto_placar').select('*').eq('projeto_id', id).order('data', { ascending: true }),
      sb.from('projeto_registros').select('*').eq('projeto_id', id).order('data', { ascending: false }),
      pessoasAtivas(org),
    ])

    const r = ROTEIROS[projeto.produto as Produto]
    const comSituacao = (marcos || []).map(m => ({ ...m, situacao: situacaoMarco(m) }))

    // prova fica em bucket PRIVADO (tem dado do cliente do cliente) — link assinado de 1h
    const comLink = await Promise.all((registros || []).map(async x => {
      if (!x.arquivo_path) return x
      const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(x.arquivo_path, 3600)
      return { ...x, arquivo_url: s?.signedUrl || null }
    }))

    return NextResponse.json({
      ok: true,
      projeto: { ...projeto, roteiro: r?.nome || projeto.produto, cor: r?.cor || '#9ca3af', fases: r?.fases || [] },
      marcos: comSituacao,
      andamentos: andamentos || [],
      pendencias: pendencias || [],
      placar: placar || [],
      registros: comLink,
      pessoas,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function PATCH(req: Request) {
  try {
    // Sem login, não responde: sem token, `orgDaRequest` cai na empresa padrão e a rota entregava
    // (e gravava) como se fosse gente de dentro. A tela da ficha já manda o login.
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const b = await req.json().catch(() => ({} as any))
    const id = (b.id || '').toString()
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })

    const { data: atual } = await sb.from('projetos').select('*').eq('org_id', org).eq('id', id).maybeSingle()
    if (!atual) return NextResponse.json({ ok: false, error: 'projeto não encontrado' }, { status: 200 })

    const p: any = { atualizado_em: new Date().toISOString() }
    if (b.cliente != null) p.cliente = b.cliente.toString().slice(0, 120)
    if (b.whatsapp != null) p.whatsapp = b.whatsapp.toString().replace(/\D/g, '') || null
    if (b.responsavel_id !== undefined) p.responsavel_id = b.responsavel_id || null
    if (b.prazo_meses !== undefined) p.prazo_meses = b.prazo_meses === '' || b.prazo_meses == null ? null : Number(b.prazo_meses)
    if (b.fim_tipo && ['encerra', 'renegocia', 'manutencao'].includes(b.fim_tipo)) p.fim_tipo = b.fim_tipo
    if (b.aviso_fim_dias !== undefined) p.aviso_fim_dias = Number(b.aviso_fim_dias) || 30
    if (b.mensalidade_dia !== undefined) p.mensalidade_dia = b.mensalidade_dia === '' || b.mensalidade_dia == null ? null : Number(b.mensalidade_dia)
    if (b.mensalidade_valor !== undefined) p.mensalidade_valor = b.mensalidade_valor === '' || b.mensalidade_valor == null ? null : Number(b.mensalidade_valor)
    if (b.observacoes !== undefined) p.observacoes = (b.observacoes || '').toString().slice(0, 2000) || null
    if (b.ad_account_id !== undefined) p.ad_account_id = (b.ad_account_id || '').toString().replace(/\D/g, '') || null
    // a meta do contrato: onde o cliente quer estar no fim (o ponto B do placar)
    if (b.meta_objetivo !== undefined) p.meta_objetivo = (b.meta_objetivo || '').toString().slice(0, 1000) || null
    if (b.meta_leads !== undefined) p.meta_leads = num(b.meta_leads)
    if (b.meta_vendas !== undefined) p.meta_vendas = num(b.meta_vendas)
    if (b.meta_faturamento !== undefined) p.meta_faturamento = num(b.meta_faturamento)
    if (b.fase) p.fase = b.fase
    if (b.status && ['ativo', 'manutencao', 'concluido', 'cancelado'].includes(b.status)) p.status = b.status

    // mudou o prazo → recalcula a data de fim
    if (p.prazo_meses !== undefined) {
      p.data_fim = dataFimContrato(atual.produto as Produto, atual.data_inicio, p.prazo_meses)
    }

    await sb.from('projetos').update(p).eq('org_id', org).eq('id', id)

    if (b.status === 'cancelado') {
      await sb.from('projeto_andamentos').insert({
        org_id: org, projeto_id: id, tipo: 'cancelado',
        observacao: `🚫 Projeto cancelado.${b.motivo ? ' Motivo: ' + b.motivo : ''}`, autor: (b.autor || '').toString() || null,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

// pendências com o cliente + anotação solta na ficha
export async function POST(req: Request) {
  try {
    // Sem login, não responde: sem token, `orgDaRequest` cai na empresa padrão e a rota entregava
    // (e gravava) como se fosse gente de dentro. A tela da ficha já manda o login.
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const b = await req.json().catch(() => ({} as any))
    const acao = (b.acao || '').toString()
    const projetoId = (b.projeto_id || '').toString()
    if (!projetoId) return NextResponse.json({ ok: false, error: 'falta projeto' }, { status: 200 })

    if (acao === 'pendencia_nova') {
      const d = (b.descricao || '').toString().trim()
      if (!d) return NextResponse.json({ ok: false, error: 'descreva o que falta' }, { status: 200 })
      await sb.from('projeto_pendencias').insert({ org_id: org, projeto_id: projetoId, descricao: d.slice(0, 200) })
      await sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: projetoId, tipo: 'pendencia', observacao: `📌 Pedido ao cliente: ${d}` })
      return NextResponse.json({ ok: true })
    }
    if (acao === 'pendencia_entregue') {
      await sb.from('projeto_pendencias').update({ entregue_em: new Date().toISOString().slice(0, 10) }).eq('org_id', org).eq('id', b.id)
      return NextResponse.json({ ok: true })
    }
    if (acao === 'pendencia_remover') {
      await sb.from('projeto_pendencias').delete().eq('org_id', org).eq('id', b.id)
      return NextResponse.json({ ok: true })
    }
    if (acao === 'nota') {
      const t = (b.texto || '').toString().trim()
      if (!t) return NextResponse.json({ ok: false, error: 'escreva a nota' }, { status: 200 })
      await sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: projetoId, tipo: 'nota', observacao: t.slice(0, 2000), autor: (b.autor || '').toString() || null })
      return NextResponse.json({ ok: true })
    }

    // ── o projeto é desta empresa? (tudo abaixo grava em tabela nova)
    const { data: dono } = await sb.from('projetos').select('id').eq('org_id', org).eq('id', projetoId).maybeSingle()
    if (!dono) return NextResponse.json({ ok: false, error: 'projeto não encontrado' }, { status: 200 })

    // ── PLACAR: foto dos números numa data. O ponto A é a base de antes do trabalho.
    // ── ÁREA DO CLIENTE: o link com chave. "trocar" invalida o antigo (link vazou)
    if (acao === 'portal_link' || acao === 'portal_trocar') {
      const { data: atual } = await sb.from('projetos').select('portal_chave').eq('id', projetoId).maybeSingle()
      let chave = atual?.portal_chave as string | null
      if (!chave || acao === 'portal_trocar') {
        chave = randomBytes(12).toString('base64url')
        await sb.from('projetos').update({ portal_chave: chave, atualizado_em: new Date().toISOString() }).eq('id', projetoId)
      }
      return NextResponse.json({ ok: true, chave })
    }

    if (acao === 'placar_novo') {
      // fechamento do mês (mes = 'AAAA-MM') ou o ponto A (com data)
      const pontoA = !!b.ponto_a
      const mes = pontoA ? null : (b.mes || '').toString().slice(0, 7)
      let data = (b.data || '').toString().slice(0, 10)
      if (mes) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ ok: false, error: 'mês inválido' }, { status: 200 })
        // a linha do mês fica datada no último dia dele (ou hoje, se o mês não acabou)
        const fim = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10)
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
        data = fim > hoje ? hoje : fim
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ ok: false, error: 'informe a data' }, { status: 200 })
      const linha = {
        org_id: org, projeto_id: projetoId, data, ponto_a: pontoA, mes,
        verba: num(b.verba), conversas: num(b.conversas), leads: num(b.leads), propostas: num(b.propostas), vendas: num(b.vendas), comissao: num(b.comissao),
        fonte: mes ? (b.fonte === 'crm' ? 'crm' : 'cliente') : null, imposto_pct: mes ? num(b.imposto_pct) : null,
        observacao: (b.observacao || '').toString().slice(0, 500) || null, autor: (b.autor || '').toString() || null,
      }
      if ([linha.verba, linha.conversas, linha.leads, linha.propostas, linha.vendas, linha.comissao].every(v => v == null)) {
        return NextResponse.json({ ok: false, error: 'preencha pelo menos um número' }, { status: 200 })
      }
      // ponto A é um só, e cada mês fecha uma vez: gravar de novo substitui
      if (pontoA) await sb.from('projeto_placar').delete().eq('projeto_id', projetoId).eq('ponto_a', true)
      if (mes) await sb.from('projeto_placar').delete().eq('projeto_id', projetoId).eq('mes', mes)
      const { error } = await sb.from('projeto_placar').insert(linha)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
      return NextResponse.json({ ok: true })
    }
    if (acao === 'placar_remover') {
      await sb.from('projeto_placar').delete().eq('org_id', org).eq('projeto_id', projetoId).eq('id', b.id)
      return NextResponse.json({ ok: true })
    }

    // ── RESULTADOS e PROVAS
    if (acao === 'registro_novo') {
      const titulo = (b.titulo || '').toString().trim()
      const tipo = b.tipo === 'prova' ? 'prova' : 'marco'
      if (!titulo) return NextResponse.json({ ok: false, error: 'dá um título' }, { status: 200 })

      let arquivo_path: string | null = null, arquivo_mime: string | null = null
      if (b.arquivo_base64) {
        const mime = (b.arquivo_mime || '').toString()
        if (!MIMES.includes(mime)) return NextResponse.json({ ok: false, error: 'formato não aceito — use imagem ou PDF' }, { status: 200 })
        const buf = Buffer.from(String(b.arquivo_base64).replace(/^data:[^;]+;base64,/, ''), 'base64')
        if (buf.length > 10 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'arquivo acima de 10 MB' }, { status: 200 })
        const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]
        arquivo_path = `${org}/${projetoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: eUp } = await sb.storage.from(BUCKET).upload(arquivo_path, buf, { contentType: mime, upsert: false })
        if (eUp) return NextResponse.json({ ok: false, error: 'falha ao guardar o arquivo: ' + eUp.message }, { status: 200 })
        arquivo_mime = mime
      }

      const frente = ['trafego', 'estrategia', 'crm', 'deu_venda'].includes(b.frente) ? b.frente : null
      await sb.from('projeto_registros').insert({
        org_id: org, projeto_id: projetoId, tipo, frente, titulo: titulo.slice(0, 160),
        descricao: (b.descricao || '').toString().slice(0, 2000) || null,
        data: /^\d{4}-\d{2}-\d{2}$/.test(String(b.data || '')) ? b.data : new Date().toISOString().slice(0, 10),
        arquivo_path, arquivo_mime,
        autorizado_uso: ['sim', 'nao', 'pendente'].includes(b.autorizado_uso) ? b.autorizado_uso : 'pendente',
        dados_ocultos: !!b.dados_ocultos,
        autor: (b.autor || '').toString() || null,
      })
      await sb.from('projeto_andamentos').insert({
        org_id: org, projeto_id: projetoId, tipo: tipo === 'prova' ? 'prova' : 'resultado',
        observacao: `${tipo === 'prova' ? '📎 Prova' : '🏆 Resultado'}: ${titulo}`,
      })
      return NextResponse.json({ ok: true })
    }
    if (acao === 'registro_atualizar') {
      const patch: any = {}
      if (['sim', 'nao', 'pendente'].includes(b.autorizado_uso)) patch.autorizado_uso = b.autorizado_uso
      if (b.dados_ocultos !== undefined) patch.dados_ocultos = !!b.dados_ocultos
      await sb.from('projeto_registros').update(patch).eq('org_id', org).eq('projeto_id', projetoId).eq('id', b.id)
      return NextResponse.json({ ok: true })
    }
    if (acao === 'registro_remover') {
      const { data: x } = await sb.from('projeto_registros').select('arquivo_path').eq('org_id', org).eq('projeto_id', projetoId).eq('id', b.id).maybeSingle()
      if (x?.arquivo_path) await sb.storage.from(BUCKET).remove([x.arquivo_path])
      await sb.from('projeto_registros').delete().eq('org_id', org).eq('projeto_id', projetoId).eq('id', b.id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
