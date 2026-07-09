import { ImageResponse } from 'next/og'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { LOGO_DATA, MEDAL_DATA } from '@/lib/cert-assets'

const RESPONSAVEL_FC = 'Luis Augusto Wickert'
const fmt = (d: string) => { if (!d) return ''; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y}` }
const tipoDe = (p: string) => { const s = (p || '').toLowerCase(); return s.includes('anúncios') || s.includes('anuncios') ? 'ANL' : s.includes('formação') || s.includes('formacao') ? 'FC' : 'GEN' }
type Tok = { t: string; b?: boolean }

export type Fontes = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800 }[]

// carrega as 4 fontes uma vez só (reuso no ZIP)
export async function carregarFontes(origin: string): Promise<Fontes> {
  const f = (u: string) => fetch(`${origin}/fonts/${u}`).then(r => r.arrayBuffer())
  const [reg, bold, xbold, script] = await Promise.all([
    f('Poppins-Regular.ttf'), f('Poppins-Bold.ttf'), f('Poppins-ExtraBold.ttf'), f('GreatVibes.ttf'),
  ])
  return [
    { name: 'Poppins', data: reg, weight: 400 },
    { name: 'Poppins', data: bold, weight: 700 },
    { name: 'Poppins', data: xbold, weight: 800 },
    { name: 'Great Vibes', data: script, weight: 400 },
  ]
}

// gera o PNG de 1 matrícula -> { buffer, nomeArq }. Retorna null se matrícula não existe.
export async function gerarCertificado(matId: string, fontes: Fontes): Promise<{ buffer: ArrayBuffer; nomeArq: string } | null> {
  const { data: mat } = await supabase.from('matriculas')
    .select('id, turma_id, alunos(nome), turmas(data_inicio, data_fim, produto_id, cidade_id)').eq('id', matId).single()
  if (!mat) return null
  const t: any = mat.turmas
  const [{ data: prod }, { data: cid }] = await Promise.all([
    supabase.from('produtos').select('nome').eq('id', t.produto_id).single(),
    supabase.from('cidades').select('nome').eq('id', t.cidade_id).single(),
  ])
  const produto = prod?.nome || '', tipo = tipoDe(produto)
  const aluno = (mat.alunos as any)?.nome || 'Aluno'
  const cidade = cid?.nome ? `${cid.nome}– RS` : ''
  const d1 = fmt(t.data_inicio), d2 = fmt(t.data_fim)
  let assinante = RESPONSAVEL_FC, cargo = 'Responsável pelo Curso'
  if (tipo !== 'FC') {
    const { data: tp } = await supabase.from('turma_professores').select('professores(nome)').eq('turma_id', mat.turma_id).limit(1).maybeSingle()
    assinante = (tp as any)?.professores?.nome || RESPONSAVEL_FC
    cargo = 'Professor do Curso'
  }

  const paras: Tok[][] = tipo === 'FC' ? [
    [{ t: 'Você concluiu com sucesso a ' }, { t: 'Formação Completa em Marketing Digital,', b: true }, { t: ` realizada entre os dias ` }, { t: `${d1} e ${d2},`, b: true }, { t: ` na cidade de ${cidade}.` }],
    [{ t: 'Durante este período, desenvolveu as competências essenciais em ' }, { t: 'Estratégia Digital, Videomaker Mobile, Design Digital e Gestão de Tráfego,', b: true }, { t: ' totalizando 50 horas de formação.' }],
    [{ t: 'Ao final do curso, ' }, { t: 'demonstrou domínio das habilidades necessárias para vender na internet e compreensão completa do funil de vendas digital.', b: true }],
  ] : [
    [{ t: 'Você concluiu com sucesso o curso ' }, { t: `${produto},`, b: true }, { t: ` realizado entre os dias ` }, { t: `${d1} e ${d2},`, b: true }, { t: ` na cidade de ${cidade}. Durante este período, demonstrou as habilidades necessárias para criar anúncios patrocinados na Plataforma Meta.` }],
  ]
  const fs = tipo === 'FC' ? 21 : 23

  const img = (
    <div style={{ display: 'flex', width: 1400, height: 990, background: '#fff', fontFamily: 'Poppins' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 384, paddingTop: 78, backgroundImage: 'linear-gradient(160deg, #9333ea 0%, #7c3aed 42%, #4338ca 100%)' }}>
        <img src={LOGO_DATA} width={258} height={94} style={{ objectFit: 'contain' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: '58px 66px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src={MEDAL_DATA} width={112} height={142} />
          <div style={{ fontFamily: 'Poppins', fontWeight: 800, fontSize: 78, color: '#5b21b6', letterSpacing: 1, marginTop: 4 }}>CERTIFICADO</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 880 }}>
          <div style={{ fontFamily: 'Poppins', fontWeight: 700, fontSize: 46, color: '#111827' }}>{aluno}</div>
          <div style={{ display: 'flex', width: 640, height: 2, background: '#111827', marginTop: 8, marginBottom: 34 }} />
          {paras.map((p, i) => (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', width: 830, fontSize: fs, lineHeight: 1.5, color: '#2b3a52', marginBottom: 20 }}>
              {p.map((tk, j) => <span key={j} style={{ fontWeight: tk.b ? 700 : 400, whiteSpace: 'pre-wrap' }}>{tk.t}</span>)}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Great Vibes', fontSize: 54, color: '#6b7280', lineHeight: 1 }}>{assinante}</div>
          <div style={{ display: 'flex', width: 360, height: 2, background: '#111827', marginTop: 2, marginBottom: 8 }} />
          <div style={{ fontFamily: 'Poppins', fontWeight: 700, fontSize: 17, color: '#111827' }}>{cargo}</div>
        </div>
      </div>
    </div>
  )

  const nomeArq = aluno.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  const resp = new ImageResponse(img, { width: 1400, height: 990, fonts: fontes as any })
  const buffer = await resp.arrayBuffer()
  return { buffer, nomeArq }
}
