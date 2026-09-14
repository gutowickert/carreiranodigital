import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 20

// A BUSCA DO SISTEMA (⌘K) — tudo que tem nome, num lugar só.
//
// POR QUE NO SERVIDOR (14/09/2026). A busca antiga consultava `leads` direto do navegador. Dois
// defeitos, os dois achados procurando gente que existia:
//   · a regra de linha do banco escondia lead SEM DONO até do administrador ("Ricardo" não aparecia,
//     e os quatro Ricardos da escola estavam sem vendedor);
//   · só olhava o nome do LEAD. Quem existe como CONVERSA do WhatsApp ("Jair R Stulp", sem lead, ou
//     um lead cadastrado com outro nome) não aparecia — e a tela do WhatsApp achava.
// Aqui a consulta usa a chave de serviço e aplica a MESMA regra de quem enxerga quem da agenda
// (lib/quem-eu-vejo.ts), e cada tipo de resultado só vem pra quem tem aquela tela no menu.
//
// SEM ACENTO: "joao" acha "João". Cada letra vira uma classe de caracteres (a → [aáàâãä]) e a busca
// usa expressão regular sem diferenciar maiúscula (imatch) — dá o mesmo resultado de um unaccent, sem
// precisar criar função no banco.

const CLASSE: Record<string, string> = { a: '[aáàâãä]', e: '[eéèêë]', i: '[iíìîï]', o: '[oóòôõö]', u: '[uúùûü]', c: '[cç]', n: '[nñ]' }
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** "joão silva" → "j[oóòôõö][aáàâãä][oóòôõö].*s[iíìîï]lv[aáàâãä]" — as palavras na ordem, com qualquer coisa entre elas */
function padrao(termo: string): string {
  return semAcento(termo).replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map((p) => [...p].map((ch) => CLASSE[ch] || ch).join('')).join('.*')
}
function telefoneBonito(t?: string | null) {
  let d = String(t || '').replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t || ''
}
const dataBR = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

type Item = { chave: string; nome: string; sub: string; href: string }

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const org = await orgDaRequest(auth)
  const quem = await quemEuVejo(auth, org)
  if (!quem) return NextResponse.json({ ok: false, error: 'sem sessão' }, { status: 401 })

  const termo = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 60)
  if (termo.length < 2) return NextResponse.json({ ok: true, grupos: [] })
  const re = padrao(termo)
  const dig = termo.replace(/\D/g, '')
  // TELEFONE SEM SER EXIGENTE (14/09/2026): "981260498" tem que achar quem foi salvo sem o 9 da frente
  // ("5181260498") — e o contrário. Com 8 dígitos ou mais vale só o FINAL de 8 (o número sem o nono
  // dígito, sem DDD e sem 55); e entre um dígito e outro aceita qualquer coisa, pra achar também
  // "(51) 8126-0498". Com menos de 8, procura o pedaço digitado.
  const telefoneBase = dig.length >= 8 ? dig.slice(-8) : dig
  const telPadrao = [...telefoneBase].join('[^0-9]*')

  // cláusula OR: texto por expressão regular nas colunas de nome; telefone/CPF por dígitos (a partir de 4)
  const ou = (texto: string[], numeros: string[] = []) => [
    ...(re ? texto.map((c) => `${c}.imatch."${re}"`) : []),
    ...(dig.length >= 4 ? numeros.map((c) => `${c}.imatch."${telPadrao}"`) : []),
  ].join(',')

  // A escola tem uma empresa só e nem toda tabela antiga tem org_id: tenta com o filtro da empresa e,
  // se a coluna não existir, repete sem ele (em vez de devolver vazio calado).
  async function consulta(montar: (qb: any) => any, tabela: string, colunas: string, filtro: string): Promise<any[]> {
    if (!filtro) return []
    const base = () => sb.from(tabela).select(colunas).or(filtro)
    const r = await montar(base().eq('org_id', org))
    if (r.error && /org_id/.test(r.error.message || '')) return ((await montar(base())).data || []) as any[]
    return (r.data || []) as any[]
  }

  const { data: perfil } = await sb.from('usuarios_perfil').select('papel, leads_escopo, crm_interno, crm_externo, wa_caixa').eq('id', quem.eu.id).maybeSingle()
  const admin = quem.souDono
  const gestor = perfil?.papel === 'gestor'
  const veTodos = admin || perfil?.leads_escopo === 'todos'
  const visivel = (dono: string | null) => veTodos || (!!dono && quem.visiveis.has(dono))
  // o mesmo corte do menu (components/Layout.tsx → itemPermitido)
  const pode = {
    leads: admin || gestor || !!perfil?.crm_interno,
    conversas: admin || !!perfil?.wa_caixa,
    alunos: true,
    turmas: true,
    produtos: admin || gestor,
    prospeccoes: admin || !!perfil?.crm_externo,
    usuarios: admin,
  }

  const [etapas, leads, conversas, alunos, prospeccoes, turmas, produtos, usuarios] = await Promise.all([
    consulta((q) => q.limit(200), 'etapas', 'chave, label', 'chave.neq.__nada__'),
    pode.leads ? consulta((q) => q.order('atualizado_em', { ascending: false }).limit(60), 'leads', 'id, nome, whatsapp, email, etapa, vendedor_id', ou(['nome', 'email'], ['whatsapp'])) : [],
    pode.conversas ? consulta((q) => q.order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(25), 'wa_conversas', 'id, nome, telefone, lead_id', ou(['nome'], ['telefone'])) : [],
    pode.alunos ? consulta((q) => q.order('nome').limit(8), 'alunos', 'id, nome, whatsapp, email, cidade', ou(['nome', 'email'], ['whatsapp', 'cpf'])) : [],
    pode.prospeccoes ? consulta((q) => q.limit(30), 'prospeccoes_externas', 'id, nome_contato, empresa, whatsapp, cidade, vendedor_id', ou(['nome_contato', 'empresa'], ['whatsapp'])) : [],
    pode.turmas ? consulta((q) => q.order('data_inicio', { ascending: false }).limit(6), 'turmas', 'id, codigo, data_inicio, produtos(nome), cidades(nome)', ou(['codigo'])) : [],
    pode.produtos ? consulta((q) => q.order('nome').limit(5), 'produtos', 'id, nome', ou(['nome'])) : [],
    pode.usuarios ? consulta((q) => q.order('nome').limit(5), 'usuarios_perfil', 'id, nome, email, ativo', ou(['nome', 'email'])) : [],
  ])

  const nomeEtapa = Object.fromEntries(etapas.map((e: any) => [e.chave, e.label]))
  const itensLeads: Item[] = leads.filter((l: any) => visivel(l.vendedor_id)).slice(0, 8).map((l: any) => ({
    chave: 'lead:' + l.id, nome: l.nome || telefoneBonito(l.whatsapp) || 'Lead sem nome',
    sub: [telefoneBonito(l.whatsapp), nomeEtapa[l.etapa]].filter(Boolean).join(' · '),
    href: `/dashboard/crm?lead=${l.id}`,
  }))
  // conversa que já apareceu como lead não repete
  const leadsMostrados = new Set(leads.map((l: any) => l.id))
  const itensConversas: Item[] = conversas.filter((c: any) => !c.lead_id || !leadsMostrados.has(c.lead_id)).slice(0, 6).map((c: any) => ({
    chave: 'conversa:' + c.id, nome: c.nome || telefoneBonito(c.telefone),
    sub: [telefoneBonito(c.telefone), c.lead_id ? 'tem lead' : 'sem lead'].filter(Boolean).join(' · '),
    href: `/dashboard/whatsapp?conversa=${c.id}`,
  }))
  const itensAlunos: Item[] = alunos.map((a: any) => ({
    chave: 'aluno:' + a.id, nome: a.nome, sub: [a.cidade, telefoneBonito(a.whatsapp) || a.email].filter(Boolean).join(' · '),
    href: `/dashboard/alunos?busca=${encodeURIComponent(a.nome || '')}`,
  }))
  const itensProspeccoes: Item[] = prospeccoes.filter((p: any) => visivel(p.vendedor_id)).slice(0, 6).map((p: any) => ({
    chave: 'prospeccao:' + p.id, nome: p.nome_contato || p.empresa || telefoneBonito(p.whatsapp),
    sub: [p.nome_contato ? p.empresa : '', p.cidade].filter(Boolean).join(' · '),
    href: `/dashboard/crm-externo?abrir=${p.id}`,
  }))
  const itensTurmas: Item[] = turmas.map((t: any) => ({
    chave: 'turma:' + t.id, nome: t.codigo, sub: [t.produtos?.nome, t.cidades?.nome, dataBR(t.data_inicio)].filter(Boolean).join(' · '),
    href: `/dashboard/turmas/${t.id}`,
  }))
  const itensProdutos: Item[] = produtos.map((p: any) => ({ chave: 'produto:' + p.id, nome: p.nome, sub: '', href: '/dashboard/produtos' }))
  const itensUsuarios: Item[] = usuarios.map((u: any) => ({ chave: 'usuario:' + u.id, nome: u.nome, sub: [u.email, u.ativo === false ? 'inativo' : ''].filter(Boolean).join(' · '), href: '/dashboard/usuarios' }))

  const grupos = [
    { tipo: 'leads', rotulo: 'Leads', itens: itensLeads },
    { tipo: 'conversas', rotulo: 'Conversas do WhatsApp', itens: itensConversas },
    { tipo: 'alunos', rotulo: 'Alunos', itens: itensAlunos },
    { tipo: 'prospeccoes', rotulo: 'Prospecções', itens: itensProspeccoes },
    { tipo: 'turmas', rotulo: 'Turmas', itens: itensTurmas },
    { tipo: 'produtos', rotulo: 'Produtos', itens: itensProdutos },
    { tipo: 'usuarios', rotulo: 'Usuários', itens: itensUsuarios },
  ].filter((g) => g.itens.length)

  return NextResponse.json({ ok: true, grupos })
}
