'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import Image from 'next/image'
import { Bebas_Neue, Barlow, Dancing_Script } from 'next/font/google'

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'] })
const barlow = Barlow({ weight: ['400', '600', '700'], subsets: ['latin'] })
const script = Dancing_Script({ weight: ['600', '700'], subsets: ['latin'] })

const ROXO = '#5b21b6'
const fmt = (d: string) => { if (!d) return ''; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y}` }

export default function Certificado({ params }: { params: Promise<{ matriculaId: string }> }) {
  const { matriculaId } = use(params)
  const [d, setD] = useState<any>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch(`/api/certificado?matricula=${matriculaId}`).then(r => r.json()).then(j => { if (j.ok) setD(j); else setErro(j.error || 'erro') })
  }, [matriculaId])

  if (erro) return <div style={{ padding: 40, fontFamily: 'system-ui' }}>Não foi possível carregar o certificado: {erro}</div>
  if (!d) return <div style={{ padding: 40, fontFamily: 'system-ui', color: '#666' }}>Carregando certificado...</div>

  const cidade = d.cidade ? `${d.cidade} – RS` : ''
  const corpo = d.tipo === 'FC' ? (
    <>Você concluiu com sucesso a <b>Formação Completa em Marketing Digital</b>, realizada entre os dias <b>{fmt(d.data_inicio)}</b> e <b>{fmt(d.data_fim)}</b>, na cidade de <b>{cidade}</b>.<br /><br />
      Durante este período, desenvolveu as competências essenciais em <b>Estratégia Digital, Videomaker Mobile, Design Digital e Gestão de Tráfego</b>, totalizando 50 horas de formação.<br /><br />
      Ao final do curso, demonstrou domínio das habilidades necessárias para vender na internet e compreensão completa do funil de vendas digital.</>
  ) : (
    <>Você concluiu com sucesso o curso <b>{d.produto}</b>, realizado entre os dias <b>{fmt(d.data_inicio)}</b> e <b>{fmt(d.data_fim)}</b>, na cidade de <b>{cidade}</b>.<br /><br />
      Durante este período, demonstrou as habilidades necessárias para criar anúncios patrocinados na Plataforma Meta.</>
  )

  return (
    <div className={barlow.className} style={{ minHeight: '100vh', background: '#e9e7f2', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 12px' }}>
      <style>{`@media print { .noprint{display:none!important} body{background:#fff!important} .cert{box-shadow:none!important;margin:0!important} @page{size:landscape;margin:0} }`}</style>

      <button className="noprint" onClick={() => window.print()} style={{ marginBottom: 18, background: `linear-gradient(135deg,#7b2fbe,#a78bfa)`, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 18px rgba(123,47,190,0.4)' }}>
        ⬇️ Baixar / Imprimir (salvar como PDF)
      </button>

      <div className="cert" style={{ width: 'min(96vw, 1050px)', aspectRatio: '1.414 / 1', background: '#fff', borderRadius: 8, overflow: 'hidden', display: 'flex', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        {/* faixa lateral */}
        <div style={{ width: '26%', background: `linear-gradient(160deg, #8b3fd6 0%, #4c1d95 55%, #3730a3 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '8% 6%', position: 'relative' }}>
          <Image src="/logo.png" alt="Carreira no Digital" width={200} height={68} style={{ width: '85%', height: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
        </div>
        {/* conteúdo */}
        <div style={{ flex: 1, padding: '5% 6%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative' }}>
          {/* medalha */}
          <div style={{ width: 74, height: 74, borderRadius: '50%', background: `linear-gradient(135deg,#7c3aed,#5b21b6)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 34, marginBottom: 6 }}>★</div>
          <div className={bebas.className} style={{ fontSize: 'clamp(34px, 5vw, 58px)', color: ROXO, letterSpacing: 2, lineHeight: 1 }}>CERTIFICADO</div>

          <div style={{ marginTop: 'auto', marginBottom: 'auto', width: '100%' }}>
            <div style={{ fontSize: 'clamp(24px, 3.4vw, 40px)', fontWeight: 700, color: '#111', margin: '10px 0 6px' }}>{d.aluno}</div>
            <div style={{ height: 2, background: '#111', width: '70%', margin: '0 auto 22px' }} />
            <p style={{ fontSize: 'clamp(12px, 1.5vw, 17px)', color: '#374151', lineHeight: 1.6, maxWidth: '88%', margin: '0 auto' }}>{corpo}</p>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div className={script.className} style={{ fontSize: 'clamp(26px, 3.2vw, 40px)', color: '#4b5563', lineHeight: 1 }}>{d.assinante}</div>
            <div style={{ height: 2, background: '#111', width: 260, maxWidth: '80%', margin: '2px auto 4px' }} />
            <div style={{ fontSize: 'clamp(11px, 1.3vw, 14px)', fontWeight: 700, color: '#111' }}>{d.cargo}</div>
          </div>
        </div>
      </div>

      <p className="noprint" style={{ marginTop: 14, fontSize: 12, color: '#666' }}>Dica: no “Salvar como PDF”, escolha orientação <b>paisagem</b> e margens “nenhuma”.</p>
    </div>
  )
}
