import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const RESPONSAVEL_FC = 'Luis Augusto Wickert'
const fmt = (d: string) => { if (!d) return ''; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y}` }
const tipoDe = (p: string) => { const s = (p || '').toLowerCase(); return s.includes('anúncios') || s.includes('anuncios') ? 'ANL' : s.includes('formação') || s.includes('formacao') ? 'FC' : 'GEN' }

async function fonte(url: string) { const r = await fetch(url); return r.arrayBuffer() }

export async function GET(req: NextRequest) {
  const matId = req.nextUrl.searchParams.get('matricula')
  if (!matId) return new Response('falta matricula', { status: 400 })

  const { data: mat } = await supabase.from('matriculas')
    .select('id, turma_id, alunos(nome), turmas(data_inicio, data_fim, produto_id, cidade_id)').eq('id', matId).single()
  if (!mat) return new Response('matrícula não encontrada', { status: 404 })
  const t: any = mat.turmas
  const [{ data: prod }, { data: cid }] = await Promise.all([
    supabase.from('produtos').select('nome').eq('id', t.produto_id).single(),
    supabase.from('cidades').select('nome').eq('id', t.cidade_id).single(),
  ])
  const produto = prod?.nome || '', tipo = tipoDe(produto)
  const aluno = (mat.alunos as any)?.nome || 'Aluno'
  const cidade = cid?.nome ? `${cid.nome} – RS` : ''
  let assinante = RESPONSAVEL_FC, cargo = 'Responsável pelo Curso'
  if (tipo !== 'FC') {
    const { data: tp } = await supabase.from('turma_professores').select('professores(nome)').eq('turma_id', mat.turma_id).limit(1).maybeSingle()
    assinante = (tp as any)?.professores?.nome || RESPONSAVEL_FC
    cargo = 'Professor do Curso'
  }

  const origin = req.nextUrl.origin
  try {
  const [poppins, poppinsBold, bebas, pacifico] = await Promise.all([
    fonte(`${origin}/fonts/Poppins-Regular.ttf`),
    fonte(`${origin}/fonts/Poppins-Bold.ttf`),
    fonte(`${origin}/fonts/BebasNeue-Regular.ttf`),
    fonte(`${origin}/fonts/Pacifico-Regular.ttf`),
  ])

  const linhas = tipo === 'FC' ? [
    `Você concluiu com sucesso a Formação Completa em Marketing Digital, realizada entre ${fmt(t.data_inicio)} e ${fmt(t.data_fim)}, em ${cidade}.`,
    `Desenvolveu as competências essenciais em Estratégia Digital, Videomaker Mobile, Design Digital e Gestão de Tráfego, totalizando 50 horas de formação.`,
    `Ao final, demonstrou domínio das habilidades para vender na internet e compreensão completa do funil de vendas digital.`,
  ] : [
    `Você concluiu com sucesso o curso ${produto}, realizado entre ${fmt(t.data_inicio)} e ${fmt(t.data_fim)}, em ${cidade}.`,
    `Durante este período, demonstrou as habilidades necessárias para criar anúncios patrocinados na Plataforma Meta.`,
  ]

  const img = (
    <div style={{ display: 'flex', width: 1400, height: 990, background: '#fff', fontFamily: 'Poppins' }}>
      {/* faixa lateral */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 372, backgroundImage: 'linear-gradient(160deg, #8b3fd6 0%, #4c1d95 55%, #3730a3 100%)', padding: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 56, color: '#fff', letterSpacing: 2, lineHeight: 1 }}>CARREIRA</div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#e9d5ff', lineHeight: 1 }}>no</div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 56, color: '#fff', letterSpacing: 2, lineHeight: 1 }}>DIGITAL</div>
        </div>
      </div>
      {/* conteúdo */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: '70px 60px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', width: 78, height: 78, borderRadius: 39, backgroundImage: 'linear-gradient(135deg,#7c3aed,#5b21b6)', marginBottom: 14 }} />
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 74, color: '#5b21b6', letterSpacing: 3 }}>CERTIFICADO</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 840 }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: '#111' }}>{aluno}</div>
          <div style={{ display: 'flex', width: 560, height: 2, background: '#111', marginTop: 8, marginBottom: 28 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 820 }}>
            {linhas.map((l, i) => <div key={i} style={{ fontSize: tipo === 'FC' ? 20 : 23, color: '#374151', textAlign: 'center', lineHeight: 1.5, marginBottom: 14 }}>{l}</div>)}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Pacifico', fontSize: 42, color: '#4b5563' }}>{assinante}</div>
          <div style={{ display: 'flex', width: 320, height: 2, background: '#111', marginTop: 4, marginBottom: 6 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>{cargo}</div>
        </div>
      </div>
    </div>
  )

  const nomeArq = aluno.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  return new ImageResponse(img, {
    width: 1400, height: 990,
    fonts: [
      { name: 'Poppins', data: poppins, weight: 400 as const },
      { name: 'Poppins', data: poppinsBold, weight: 700 as const },
      { name: 'Bebas Neue', data: bebas, weight: 400 as const },
      { name: 'Pacifico', data: pacifico, weight: 400 as const },
    ],
    headers: { 'Content-Disposition': `attachment; filename="certificado-${nomeArq}.png"` },
  })
  } catch (e: any) {
    return new Response('ERRO PNG: ' + (e?.stack || e?.message || String(e)), { status: 500 })
  }
}
