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
  const [poppins, poppinsBold, bebas, pacifico] = await Promise.all([
    fonte(`${origin}/fonts/Poppins-Regular.ttf`),
    fonte(`${origin}/fonts/Poppins-Bold.ttf`),
    fonte(`${origin}/fonts/BebasNeue-Regular.ttf`),
    fonte(`${origin}/fonts/Pacifico-Regular.ttf`),
  ])

  const B = (s: string) => <span style={{ fontWeight: 700 }}>{s}</span>
  const corpo = tipo === 'FC' ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 19, color: '#374151', maxWidth: 760, textAlign: 'center', lineHeight: 1.5 }}>
      <div>Você concluiu com sucesso a {B('Formação Completa em Marketing Digital')}, realizada entre os dias {B(fmt(t.data_inicio))} e {B(fmt(t.data_fim))}, na cidade de {B(cidade)}.</div>
      <div>Desenvolveu as competências essenciais em {B('Estratégia Digital, Videomaker Mobile, Design Digital e Gestão de Tráfego')}, totalizando 50 horas de formação.</div>
      <div>Ao final, demonstrou domínio das habilidades necessárias para vender na internet e compreensão completa do funil de vendas digital.</div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 21, color: '#374151', maxWidth: 760, textAlign: 'center', lineHeight: 1.55 }}>
      <div>Você concluiu com sucesso o curso {B(produto)}, realizado entre os dias {B(fmt(t.data_inicio))} e {B(fmt(t.data_fim))}, na cidade de {B(cidade)}.</div>
      <div>Durante este período, demonstrou as habilidades necessárias para criar anúncios patrocinados na Plataforma Meta.</div>
    </div>
  )

  const img = (
    <div style={{ display: 'flex', width: 1400, height: 990, background: '#fff', fontFamily: 'Poppins' }}>
      {/* faixa lateral */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', width: 372, backgroundImage: 'linear-gradient(160deg, #8b3fd6 0%, #4c1d95 55%, #3730a3 100%)', paddingTop: 90 }}>
        <img src={`${origin}/logo.png`} width={260} height={88} style={{ objectFit: 'contain' }} />
      </div>
      {/* conteúdo */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: '60px 70px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', width: 90, height: 90, borderRadius: 45, backgroundImage: 'linear-gradient(135deg,#7c3aed,#5b21b6)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <svg width="46" height="46" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z" /></svg>
          </div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 72, color: '#5b21b6', letterSpacing: 3 }}>CERTIFICADO</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: '#111' }}>{aluno}</div>
          <div style={{ display: 'flex', width: 560, height: 2, background: '#111', marginTop: 6, marginBottom: 30 }} />
          {corpo}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Pacifico', fontSize: 40, color: '#4b5563' }}>{assinante}</div>
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
}
