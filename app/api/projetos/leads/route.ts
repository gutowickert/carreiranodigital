import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'

// Achar o lead que deu origem a uma entrega, pra ligar os dois.
//
// SÓ LEITURA. Esta rota não grava nada.
//
// POR QUE ELA EXISTE: `projetos.lead_id` já existia, a criação já gravava e a ficha já mostrava o
// botão "Lead de origem" — mas a tela nunca mandava o lead, porque não havia onde escolher. O nome
// do cliente era digitado na mão e o vínculo com a venda se perdia.
//
// ⚠️ NUNCA CASAR SOZINHO. Nos 9 projetos que existiam quando isto foi escrito, o nome do projeto
// quase nunca batia com o do lead ("Cristina Velrangieri Miller" no projeto, "Cris Miller" no lead),
// e um cliente tinha DOIS leads — um em ganho e outro em deu_venda. Adivinhar acertaria às vezes e
// erraria calado nas outras. Por isso aqui a busca só devolve candidatos, com etapa e data, e quem
// escolhe é a pessoa.
//
// QUEM VÊ O QUÊ: só exige estar logado, como o resto das rotas de entrega — e não a regra de
// "quem eu vejo" do funil. É de propósito: quem entrega não é quem vendeu, e um vendedor com escopo
// "próprios" faria o cliente sumir da busca de quem precisa montar a entrega dele.

const LIMITE = 10
const MIN_TERMO = 3

// O rótulo da etapa vem do banco: cada instalação nomeia o funil do jeito dela.
async function rotulosDasEtapas(org: string): Promise<Record<string, string>> {
  const { data } = await sb.from('etapas').select('chave, label').eq('org_id', org)
  return Object.fromEntries((data || []).map((e: any) => [e.chave, e.label]))
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)

    const termo = (new URL(req.url).searchParams.get('q') || '').trim()
    if (termo.length < MIN_TERMO) return NextResponse.json({ ok: true, leads: [] })

    // vírgula, parênteses e asterisco são sintaxe do filtro do banco: saem antes de virar busca
    const limpo = termo.replace(/[(),*]/g, ' ').trim()
    const digitos = termo.replace(/\D/g, '')
    if (!limpo && !digitos) return NextResponse.json({ ok: true, leads: [] })

    // ⚠️ TELEFONE AQUI NÃO É SÓ DÍGITO. A base tem número gravado de todo jeito: "51997269525",
    // "555192549004" e também "(54) 98465-3430". Procurar pelos dígitos que a pessoa digitou não
    // acha os formatados — o traço no meio quebra a comparação de texto, e a busca voltava vazia
    // pra um lead que existe.
    //
    // Então a consulta pede pouco e a conferência é feita aqui: filtra pelos ÚLTIMOS 4 dígitos (que
    // ficam juntos em qualquer formatação) e depois compara, já sem pontuação, os últimos 8.
    const fim4 = digitos.length >= 4 ? digitos.slice(-4) : ''
    const porTelefone = fim4 ? `whatsapp.ilike.*${fim4}*` : ''
    const porNome = limpo.length >= MIN_TERMO ? `nome.ilike.*${limpo}*` : ''
    const filtro = [porNome, porTelefone].filter(Boolean).join(',')
    if (!filtro) return NextResponse.json({ ok: true, leads: [] })

    const { data: crus, error } = await sb.from('leads')
      .select('id, nome, whatsapp, etapa, criado_em')
      .eq('org_id', org).or(filtro)
      .order('criado_em', { ascending: false }).limit(LIMITE * 6)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

    const so = (t: string | null) => (t || '').replace(/\D/g, '')
    const fim8 = digitos.length >= 8 ? digitos.slice(-8) : ''
    const leads = (crus || []).filter(l => {
      const bateNome = porNome && (l.nome || '').toLowerCase().includes(limpo.toLowerCase())
      // com 8 dígitos ou mais, exige o número mesmo; com menos, o "termina em" já serve
      const bateTel = fim4 && (fim8 ? so(l.whatsapp).endsWith(fim8) : so(l.whatsapp).endsWith(fim4))
      return bateNome || bateTel
    }).slice(0, LIMITE)
    if (!leads.length) return NextResponse.json({ ok: true, leads: [] })

    // Lead que já está em outro projeto: não impede, mas a tela avisa antes. Cliente que compra de
    // novo costuma virar OUTRO lead neste sistema, então o mesmo lead em dois projetos é quase
    // sempre engano de quem está montando.
    const { data: jaUsados } = await sb.from('projetos')
      .select('lead_id, cliente, status').eq('org_id', org).in('lead_id', leads.map(l => l.id))
    const usado: Record<string, string> = {}
    for (const p of jaUsados || []) if (p.lead_id) usado[p.lead_id] = p.cliente

    const rotulo = await rotulosDasEtapas(org)
    return NextResponse.json({
      ok: true,
      leads: leads.map(l => ({
        id: l.id,
        nome: l.nome,
        whatsapp: l.whatsapp,
        etapa: rotulo[l.etapa] || l.etapa,
        criado_em: l.criado_em,
        ja_em_projeto: usado[l.id] || null,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
