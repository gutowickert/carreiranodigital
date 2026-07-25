import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Edita o CONTEÚDO de templates que já existem no Meta (POST no id do template).
// Usa quando o texto/categoria mudou e o criar-templates só diria "já existe".
const GRAPH = 'https://graph.facebook.com/v25.0'

const EXEMPLO: Record<string, string> = {
  nome: 'Maria', vendedor: 'Ricardo', cidade: 'Porto Alegre', curso: 'Anúncios para Negócios Locais',
  datas: '11, 12 e 13/08', preco_pix: 'R$797', preco_parcelado: '10x de R$99,70',
  prazo: '28/07', condicao_bolsa: 'R$717,30 no Pix (10% de desconto)',
}

function paraMeta(corpo: string): { texto: string; exemplos: string[] } {
  const ordem: string[] = []
  const texto = (corpo || '').replace(/\{\{(\w+)\}\}/g, (_m, nome) => {
    let i = ordem.indexOf(nome)
    if (i < 0) { ordem.push(nome); i = ordem.length - 1 }
    return `{{${i + 1}}}`
  })
  return { texto, exemplos: ordem.map(n => EXEMPLO[n] || n) }
}

// mapa nome_meta -> { id, status } paginando a lista do Meta
async function mapaTemplates(WABA: string, TOKEN: string) {
  const mapa = new Map<string, { id: string; status: string }>()
  let url = `${GRAPH}/${WABA}/message_templates?fields=name,id,status,language&limit=200`
  for (let i = 0; i < 20 && url; i++) {
    const r: any = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } }).then(x => x.json()).catch(() => null)
    for (const t of (r?.data || [])) if (t.language === 'pt_BR') mapa.set(t.name, { id: t.id, status: t.status })
    url = r?.paging?.next || ''
  }
  return mapa
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data: conta } = await sb.from('wa_oficial_config').select('waba_id, token').eq('org_id', org).eq('ativo', true).not('waba_id', 'is', null).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    const WABA = conta?.waba_id || process.env.WA_OFICIAL_WABA_ID || ''
    const TOKEN = conta?.token || process.env.WA_OFICIAL_TOKEN || ''
    if (!WABA || !TOKEN) return NextResponse.json({ ok: false, error: 'Falta WABA/token oficial.' }, { status: 200 })

    const b = await req.json().catch(() => ({} as any))
    const ids: string[] | null = Array.isArray(b?.ids) ? b.ids.filter(Boolean) : null
    let q = sb.from('followup_templates').select('*').eq('org_id', org).eq('ativo', true)
    q = (ids && ids.length) ? q.in('id', ids) : q.eq('status', 'rascunho')
    const { data: temps } = await q.order('ordem')
    if (!temps?.length) return NextResponse.json({ ok: true, editados: 0, msg: 'Nenhum template rascunho pra editar.' })

    const mapa = await mapaTemplates(WABA, TOKEN)
    const resultados: any[] = []
    for (const t of temps) {
      const meta = mapa.get(t.nome_meta)
      const { texto, exemplos } = paraMeta(t.corpo || '')
      const components = [{ type: 'BODY', text: texto, ...(exemplos.length ? { example: { body_text: [exemplos] } } : {}) }]

      let r: any = null, modo = ''
      if (meta?.id) {
        // edita conteúdo + categoria do template existente
        modo = 'editado'
        r = await fetch(`${GRAPH}/${meta.id}`, {
          method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: (t.categoria || 'marketing').toUpperCase(), components }),
        }).then(x => x.json()).catch(() => null)
      } else {
        // não existe no Meta → cria
        modo = 'criado'
        r = await fetch(`${GRAPH}/${WABA}/message_templates`, {
          method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: t.nome_meta, language: 'pt_BR', category: (t.categoria || 'marketing').toUpperCase(), components }),
        }).then(x => x.json()).catch(() => null)
      }

      const ok = !!(r && (r.success === true || r.id))
      if (ok) await sb.from('followup_templates').update({ status: 'submetido', atualizado_em: new Date().toISOString() }).eq('id', t.id)
      resultados.push({ nome: t.nome_meta, modo, ok, statusAntes: meta?.status || 'inexistente', erro: ok ? null : (r?.error?.error_user_msg || r?.error?.message || JSON.stringify(r?.error || 'falha')) })
    }
    const editados = resultados.filter(r => r.ok).length
    return NextResponse.json({ ok: true, editados, total: resultados.length, resultados })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
