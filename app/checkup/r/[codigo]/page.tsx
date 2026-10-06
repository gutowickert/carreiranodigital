import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import type { Conta } from '@/lib/checkup/conta'
import type { Texto } from '@/lib/checkup/diagnostico'

// Relatório do Check-up de IA: /checkup/r/<código>. Quem tem o link vê (o código é curto e aleatório;
// fora do Google). O botão leva pro WhatsApp do comercial com o código na mensagem; o lead já existe
// com esse telefone, então a conversa cai no card certo.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Teu diagnóstico · Check-up de IA · teunegócio OS',
  robots: { index: false, follow: false },
}

const WA = (process.env.WA_NUMERO_CENTRAL || '').replace(/\D/g, '')
const fmt = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const h = (n: number) => String(n).replace('.', ',')
const ETAPAS: [string, string][] = [['atrair', 'Atrair'], ['atender', 'Atender'], ['vender', 'Vender'], ['entregar', 'Entregar'], ['fazer_voltar', 'Fazer voltar'], ['administrar', 'Administrar']]
const corNota = (n: number) => n < 40 ? 'var(--ruim)' : n < 70 ? 'var(--meio)' : 'var(--bom)'
const POS: Record<string, [string, string]> = {
  abaixo: ['abaixo do setor', 'var(--ruim)'], acima: ['acima do setor', 'var(--ruim)'],
  'na média': ['na média', 'var(--meio)'], melhor: ['melhor que o setor', 'var(--bom)'],
}

const Marca = () => <span className="marca"><span className="teu">teu</span><span className="neg">negócio</span><i>OS</i></span>

export default async function Relatorio({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const cod = String(codigo || '').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 6)
  if (cod.length !== 6) notFound()
  const { data } = await sb.from('checkup_diagnosticos').select('codigo, nome, nicho, conta, texto, respostas, aberto_em, criado_em').eq('codigo', cod).maybeSingle()
  if (!data) notFound()
  if (!data.aberto_em) await sb.from('checkup_diagnosticos').update({ aberto_em: new Date().toISOString() }).eq('codigo', cod)

  const c = data.conta as Conta, t = data.texto as Texto
  const primeiro = String(data.nome || '').split(' ')[0]
  const msg = `Oi! Fiz o Check-up de IA do teunegócio OS (código ${cod}) e quero conversar com o especialista sobre o meu diagnóstico.`
  const linkWa = WA ? `https://wa.me/${WA}?text=${encodeURIComponent(msg)}` : null
  const data_ = new Date(data.criado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const temReceita = c.receita_mes[1] > 0

  return (
    <main className="ck-rel">
      <div className="ck-rel-topo"><Marca /><small>Check-up {cod} · {data_}</small></div>

      <p className="ck-eyebrow">Check-up de IA</p>
      <h1>{primeiro ? `${primeiro}, aqui está o teu diagnóstico` : 'Aqui está o teu diagnóstico'}</h1>
      <p className="ck-resumo">{t.resumo}</p>

      <div className="ck-num">
        <div>
          <span>Horas por semana que a IA pode assumir</span>
          <b><em>{h(c.horas_semana[0])} a {h(c.horas_semana[1])} h</em></b>
          <small>{fmt(c.horas_mes_em_reais[0])} a {fmt(c.horas_mes_em_reais[1])} por mês em tempo de trabalho</small>
        </div>
        <div>
          <span>Faturamento a mais por mês</span>
          <b>{temReceita ? <em>{fmt(c.receita_mes[0])} a {fmt(c.receita_mes[1])}</em> : 'A avaliar'}</b>
          <small>{temReceita ? `Estimativa, sobre cerca de ${fmt(c.base.faturamento_mes)} por mês hoje` : 'O especialista calcula contigo na conversa'}</small>
        </div>
      </div>

      <section className="ck-sec">
        <h2>Como está cada parte do negócio</h2>
        <p className="ck-sub">De 0 a 100, pelas tuas respostas. Quanto mais baixo, mais espaço pra IA ajudar.</p>
        <div className="ck-etapas">
          {ETAPAS.filter(([k]) => c.notas[k] != null).map(([k, nome]) => {
            const n = c.notas[k] as number
            return <div className="ck-etapa" key={k}><span>{nome}</span><div className="ck-trilho"><i style={{ width: `${Math.max(4, n)}%`, background: corNota(n) }} /></div><b>{n}</b></div>
          })}
        </div>
      </section>

      {c.comparativos.length > 0 && (
        <section className="ck-sec">
          <h2>Tu e a média do teu setor</h2>
          <div className="ck-cmp">
            {c.comparativos.map(x => {
              const [rot, cor] = POS[x.posicao] || [x.posicao, 'var(--suave)']
              return <div key={x.nome}><span>{x.nome}: <b>{x.teu}</b> <em>(setor: {x.setor})</em></span><span className="ck-pill" style={{ color: cor, background: 'rgba(255,255,255,.06)' }}>{rot}</span></div>
            })}
          </div>
        </section>
      )}

      <section className="ck-sec">
        <h2>As maiores oportunidades, em ordem</h2>
        <p className="ck-sub">Primeiro o que mais devolve tempo e dinheiro pro teu caso.</p>
        <div className="ck-opps">
          {t.oportunidades.map((o, i) => (
            <article className="ck-opp" key={i}>
              <header><span>{i + 1}</span><h3>{o.titulo}</h3></header>
              <dl><dt>Hoje</dt><dd>{o.hoje}</dd><dt>Com IA</dt><dd>{o.com_ia}</dd></dl>
              {o.impacto && <div className="ck-impacto">{o.impacto}</div>}
            </article>
          ))}
        </div>
      </section>

      {t.extras.length > 0 && (
        <section className="ck-sec">
          <h2>Específico do teu negócio</h2>
          <p className="ck-sub">Pontos pra avaliar com o especialista.</p>
          {t.extras.map((x, i) => <div className="ck-extra" key={i}><b>{x.titulo}</b><p>{x.porque}</p></div>)}
        </section>
      )}

      {t.comece_hoje.length > 0 && (
        <section className="ck-sec">
          <h2>Pra começar hoje, de graça</h2>
          <ul className="ck-hoje">{t.comece_hoje.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}

      <section className="ck-convite">
        <h2>Quer ver isso funcionando no teu negócio?</h2>
        <p>{t.convite}</p>
        {linkWa && <a className="ck-btn ck-btn-wa" href={linkWa} target="_blank" rel="noopener">Falar com o especialista no WhatsApp</a>}
      </section>

      <section className="ck-sec">
        <h2 style={{ fontSize: 16 }}>Como a conta foi feita</h2>
        <ul className="ck-prem">
          {c.premissas.map((x, i) => <li key={i}>{x}</li>)}
          <li>Estimativas a partir das tuas respostas e de médias do teu setor. Não é promessa de resultado.</li>
        </ul>
      </section>

      {linkWa && <div className="ck-fixo"><a className="ck-btn ck-btn-wa" href={linkWa} target="_blank" rel="noopener">Falar com o especialista</a></div>}
    </main>
  )
}
