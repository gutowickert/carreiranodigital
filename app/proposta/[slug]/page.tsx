import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import Abertura from './Abertura'
import Aceite from './Aceite'

// O CARTÃO QUE O WHATSAPP MOSTRA antes de a pessoa clicar: logo da escola, "Proposta para <nome>" e
// uma linha do que é. Link pelado, com endereço estranho, é o que faz o cliente achar que é golpe —
// e proposta comercial não pode chegar com cara de vírus.
// `robots: noindex` porque proposta de cliente não é pra aparecer no Google.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { data: orc } = await sb.from('orcamentos')
    .select('lead_id, capa, produto_nome').eq('slug', slug).eq('situacao', 'publicado').maybeSingle()
  if (!orc) return { title: 'Proposta · Carreira no Digital', robots: { index: false, follow: false } }

  const { data: lead } = await sb.from('leads').select('nome').eq('id', orc.lead_id).maybeSingle()
  const primeiro = (lead?.nome || '').split(' ')[0]
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  const base = host ? `${h.get('x-forwarded-proto') || 'https'}://${host}` : ''

  const titulo = primeiro ? `Proposta para ${primeiro} · Carreira no Digital` : 'Proposta · Carreira no Digital'
  const descricao = orc.capa?.titulo || `${orc.produto_nome || 'Proposta comercial'} — Carreira no Digital`

  return {
    title: titulo,
    description: descricao,
    robots: { index: false, follow: false },
    openGraph: {
      title: titulo, description: descricao, siteName: 'Carreira no Digital', type: 'article',
      // logo leve (69 kB): o de 505 kB era ignorado por alguns aplicativos e o cartão saía sem imagem
      ...(base ? { url: `${base}/proposta/${slug}`, images: [{ url: `${base}/logo-proposta.png`, width: 512, height: 186, alt: 'Carreira no Digital' }] } : {}),
    },
    twitter: { card: 'summary', title: titulo, description: descricao, ...(base ? { images: [`${base}/logo-proposta.png`] } : {}) },
  }
}

// A PROPOSTA que o cliente abre. Link aberto, sem login (decisão do Nando em 18/09/2026): quem tem o
// endereço, lê. O endereço é sorteado com 10 caracteres, então não se adivinha na mão.
//
// Página de servidor: busca o orçamento aqui dentro e manda o HTML pronto. Não existe rota pública de
// leitura, então não dá pra varrer a tabela por fora.
//
// ⚠️ O MIOLO FIXO É DO "DEU VENDA". "O que é", "Como funciona" e o que está incluso descrevem esse
// produto. Publicar proposta de outro produto com este modelo sai errado — falta um modelo por produto.

export const dynamic = 'force-dynamic'

const dinheiro = (n: number | null) =>
  n == null ? null : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function Proposta({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // ⚠️ Nada de junção embutida aqui (`select('*, leads(nome)')`): não existe ligação declarada entre
  // `orcamentos` e `leads`, e junção que não resolve derruba a consulta INTEIRA — a proposta virava
  // 404 com o link certo (18/09/2026). Duas consultas simples, e o nome do lead é opcional.
  const { data: orc } = await sb.from('orcamentos')
    .select('*')
    .eq('slug', slug).eq('situacao', 'publicado').maybeSingle()
  if (!orc) notFound()

  const { data: lead } = await sb.from('leads').select('nome').eq('id', orc.lead_id).maybeSingle()
  // O NOME QUE SAI NA PROPOSTA. O cadastro do lead traz o apelido do WhatsApp — "Jose Poa 2" — e era
  // isso que aparecia na capa, no topo de toda página e no endereço do link. Quem monta a proposta
  // escolhe o nome; em branco, cai no do lead, como antes.
  const cliente = orc.cliente_nome || lead?.nome || 'você'
  const objecoes = ((orc.objecoes as any[]) || []).filter(o => o.situacao !== 'fora')
  const vista = dinheiro(orc.preco_vista)
  const parcela = dinheiro(orc.preco_parcelado)
  const validade = orc.validade_dias || 15

  return (
    <div className="folhas">
      <Abertura slug={slug} />
      <style>{`
        :root{
          --ink:#0f0c17;--paper:#f5f4f9;--paper-2:#ffffff;
          --tinta:#17132a;--tinta-2:#3c3555;--tinta-fraca:#6f6889;
          --accent:#7c3aed;--accent-claro:#b39bff;--linha:#e2dfec;
          --grad:linear-gradient(135deg,#7c3aed,#c026d3);
          --verde:#e8f7ef;--verde-borda:#9ddfba;--verde-tinta:#136b45;
          --azul:#e9f0fd;--azul-borda:#a9c5f4;--azul-tinta:#1c4e9c;
          --grid:rgba(255,255,255,.035);
        }
        body{margin:0;background:var(--paper);color:var(--tinta);font-family:'Manrope',system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6}
        .folhas{display:flex;flex-direction:column;align-items:center;gap:18px;padding-block:18px;padding-left:16px;padding-right:16px}
        .folha{width:100%;max-width:860px;background:var(--paper-2);border:1px solid var(--linha);border-radius:14px;padding:clamp(24px,5vw,52px);display:flex;flex-direction:column;gap:20px}
        .disp{font-family:'Bricolage Grotesque','Manrope',system-ui,sans-serif;font-weight:700;letter-spacing:-.02em;line-height:1.06;text-wrap:balance;margin:0}
        .capa{position:relative;overflow:hidden;background:var(--ink);border-color:#241c38;color:#f4f1fb;min-height:min(70vh,700px);justify-content:space-between}
        .capa .luz{position:absolute;inset:0;pointer-events:none;background:
          radial-gradient(42% 46% at 12% 4%,rgba(139,92,246,.55),transparent 70%),
          radial-gradient(34% 36% at 92% 94%,rgba(217,70,239,.38),transparent 70%),
          repeating-linear-gradient(90deg,var(--grid) 0 1px,transparent 1px 44px),
          repeating-linear-gradient(0deg,var(--grid) 0 1px,transparent 1px 44px)}
        .capa>*{position:relative;z-index:1}
        .chapa{align-self:flex-start;border-radius:10px;padding:10px 14px;background:linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.04) 42%,rgba(0,0,0,.18)),#150a2b;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 0 0 1px rgba(124,58,237,.45);font-family:'Bricolage Grotesque','Manrope',sans-serif;font-weight:800;font-size:15px}
        .chapa span{color:var(--accent-claro)}
        .eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-claro)}
        h1{font-size:clamp(2rem,5.4vw,3.4rem)}
        .lede{font-size:clamp(15px,1.7vw,17px);line-height:1.7;color:#c9c2da;max-width:56ch;margin:0}
        .para{border-top:1px solid rgba(255,255,255,.14);padding-top:18px}
        .para .rot{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9a93ae}
        .para .nome{font-size:1.4rem;font-family:'Bricolage Grotesque','Manrope',sans-serif;font-weight:700}
        .numeros{border-top:1px solid rgba(255,255,255,.14);padding-top:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px}
        .num b{display:block;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.9rem;line-height:1}
        .num span{display:block;margin-top:6px;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9a93ae}
        .topo{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--linha);padding-bottom:12px;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--tinta-fraca)}
        .topo .secao{color:var(--accent)}
        h2{font-size:clamp(1.5rem,3.2vw,2.1rem)}
        .corpo{font-size:15px;line-height:1.68;color:var(--tinta-2);max-width:68ch;margin:0}
        .objecao{border-top:1px solid var(--linha);padding-top:18px;display:flex;gap:14px}
        .objecao .n{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.4rem;color:var(--linha);flex:none;width:32px}
        .objecao .fala{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;margin:0 0 8px}
        .passos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:13px}
        .passo{background:#f4efff;border:1px solid #ddd0fb;border-radius:12px;padding:16px}
        .passo .n{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:12px;color:var(--accent);margin-bottom:6px}
        .destaque{border-radius:12px;padding:18px}
        .destaque.verde{background:var(--verde);border:1px solid var(--verde-borda)}
        .destaque.azul{background:var(--azul);border:1px solid var(--azul-borda)}
        .destaque .rot{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}
        .destaque.verde .rot{color:var(--verde-tinta)}
        .destaque.azul .rot{color:var(--azul-tinta)}
        .preco{border:1px solid var(--linha);border-radius:14px;padding:22px;background:var(--paper);display:flex;flex-direction:column;gap:16px}
        .preco-linha{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-end}
        .valor b{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(2rem,5vw,2.9rem);line-height:1;color:var(--accent);font-variant-numeric:tabular-nums}
        .valor.alt b{font-size:clamp(1.5rem,3.4vw,2rem);color:var(--tinta)}
        .valor span{display:block;margin-top:6px;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tinta-fraca)}
        .lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
        .lista li{display:flex;gap:9px;font-size:14.5px;color:var(--tinta-2)}
        .lista li::before{content:"✓";color:var(--verde-tinta);font-weight:800}
        .duas{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:12px 26px}
        /* ⚠️ SÓ AS CORES DESTA PÁGINA. A primeira versão usava --marca, --cartao, --papel e
           --linha-forte, que são de OUTRA tela: variável que não existe torna a regra inválida, e o
           botão ficou branco (color:#fff) com fundo transparente sobre papel branco — invisível.
           As que valem aqui estão no :root logo acima: --accent, --paper, --paper-2, --linha. */
        .aceite-caixa{margin-top:26px;padding:20px;border:1px solid var(--linha);border-radius:12px;background:var(--paper);display:flex;flex-direction:column;gap:10px}
        .aceite-rot{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tinta-fraca)}
        .aceite-campo{font:inherit;font-size:15px;color:var(--tinta);background:var(--paper-2);border:1px solid var(--linha);border-radius:8px;padding:11px 12px;width:100%}
        .aceite-campo:focus{outline:2px solid var(--accent);outline-offset:1px}
        .aceite-botao{font:inherit;font-size:15.5px;font-weight:700;color:#fff;background:var(--grad);border:none;border-radius:8px;padding:14px 18px;cursor:pointer;box-shadow:0 2px 10px rgba(124,58,237,.28)}
        .aceite-botao[disabled]{opacity:.6;cursor:default;box-shadow:none}
        .aceite-erro{margin:0;font-size:13px;color:#b42318}
        .aceite-aviso{margin:0;font-size:12px;line-height:1.5;color:var(--tinta-fraca)}
        .aceite-feito{margin-top:26px;padding:20px;border:1px solid var(--verde-borda);border-radius:12px;background:var(--verde);display:flex;flex-direction:column;gap:8px}
        .aceite-selo{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--verde-tinta)}
        @media print{.aceite-botao{display:none}}
        .rodape{border-top:1px solid var(--linha);padding-top:12px;display:flex;justify-content:space-between;font-size:11px;color:var(--tinta-fraca)}
        .imprimir{position:fixed;right:16px;bottom:16px;background:var(--grad);color:#fff;border:0;border-radius:999px;padding:12px 20px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 14px 26px -14px rgba(124,58,237,.8)}
        @media print{
          body{background:#fff}
          .folhas{gap:0;padding:0}
          .folha{max-width:none;border:0;border-radius:0;break-after:page;min-height:auto;padding:14mm}
          .capa{-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .imprimir{display:none}
        }
      `}</style>

      {/* ───── capa */}
      <section className="folha capa">
        <div className="luz" />
        <div className="chapa">CARREIRA <span>no</span> DIGITAL</div>
        <div style={{ paddingBlock: 40, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="eyebrow">Carreira no Digital · Proposta comercial</div>
          <h1 className="disp">{orc.capa?.titulo}</h1>
          {orc.capa?.subtitulo && <p className="lede">{orc.capa.subtitulo}</p>}
          <div className="para">
            <div className="rot">Proposta para</div>
            <div className="nome">{cliente}</div>
          </div>
        </div>
        <div className="numeros">
          <div className="num"><b>1</b><span>Sessão presencial</span></div>
          <div className="num"><b>3</b><span>Meses acompanhado</span></div>
          <div className="num"><b>1</b><span>Pagamento único</span></div>
          {vista && <div className="num"><b style={{ color: 'var(--accent-claro)' }}>{vista}</b><span>À vista</span></div>}
        </div>
      </section>

      {/* ───── objeções: a parte escrita a partir da conversa */}
      {!!objecoes.length && (
        <section className="folha">
          <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O que tu levantou</span></div>
          <h2 className="disp">Tu levantou {objecoes.length === 1 ? 'um ponto' : `${objecoes.length} pontos`}. Aqui estão as respostas.</h2>
          {objecoes.map((o, i) => (
            <div className="objecao" key={o.ordem ?? i}>
              <div className="n">{String(i + 1).padStart(2, '0')}</div>
              <div>
                <p className="fala">{o.titulo}</p>
                <p className="corpo">{o.texto_final || o.texto_ia}</p>
              </div>
            </div>
          ))}
          <div className="rodape"><span>Carreira no Digital</span><span>01</span></div>
        </section>
      )}

      {/* ───── o que é (modelo fixo) */}
      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O que é</span></div>
        <h2 className="disp">Uma máquina de marketing montada dentro do teu negócio.</h2>
        <p className="corpo">
          Um especialista da escola senta contigo por um turno e monta, com tu do lado, a máquina que
          escreve teus anúncios, tuas respostas e tuas páginas — configurada com o que tu vende, teu prazo
          e tua condição. A conta é tua, e continua tua depois.
        </p>
        <div className="destaque azul">
          <div className="rot">O que ela não faz</div>
          <p className="corpo">Ela não atende sozinha e não vende sozinha. Prepara o anúncio, a resposta e a página; quem fala com o cliente continua sendo tu.</p>
        </div>
        <div className="rodape"><span>Carreira no Digital</span><span>02</span></div>
      </section>

      {/* ───── como funciona (modelo fixo) */}
      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">Como funciona</span></div>
        <h2 className="disp">O dia da implantação, e os 3 meses depois.</h2>
        <div className="passos">
          <div className="passo"><div className="n">1 · A estratégia</div><p className="corpo">O que vale anunciar, pra quem e em qual raio de quilômetros. Decidido contigo.</p></div>
          <div className="passo"><div className="n">2 · A máquina</div><p className="corpo">Configurada com o que tu vende, teu prazo e o que responder nas perguntas que mais chegam.</p></div>
          <div className="passo"><div className="n">3 · A campanha</div><p className="corpo">No ar antes de o especialista ir embora, com tu autorizando.</p></div>
        </div>
        <div className="destaque verde">
          <div className="rot">E esta é a parte que mais vale</div>
          <p className="corpo">
            Campanha que acerta de primeira é exceção. Por isso existem os 3 meses: a cada encontro a gente lê
            os teus números e as conversas que chegaram, e decide o próximo teste. Funcionou, aumenta a verba.
            Não funcionou, troca o caminho e roda de novo, ainda dentro dos 3 meses e sem custo a mais.
          </p>
        </div>
        <div className="duas">
          <ul className="lista">
            <li>São 4 encontros: a implantação e mais três nos 3 meses</li>
            <li>Grupo de WhatsApp com o time da escola entre eles</li>
          </ul>
          <ul className="lista">
            <li>Os encontros seguintes podem ser por vídeo</li>
            <li>A máquina fica contigo ao final</li>
          </ul>
        </div>
        <div className="rodape"><span>Carreira no Digital</span><span>03</span></div>
      </section>

      {/* ───── investimento */}
      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O investimento</span></div>
        <h2 className="disp">O que custa.</h2>
        <div className="preco">
          <div className="topo" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <span>{orc.produto_nome || 'Implantação'} · com 3 meses de acompanhamento</span>
          </div>
          <div className="preco-linha">
            {vista && <div className="valor"><b>{vista}</b><span>À vista, no Pix</span></div>}
            {parcela && orc.parcelas && (
              <div className="valor alt"><b>{parcela}</b><span>{orc.parcelas}x sem juros</span></div>
            )}
          </div>
          <p className="corpo"><strong>Pagamento único.</strong> Sem mensalidade, e a máquina continua tua depois.</p>
          <div className="duas" style={{ borderTop: '1px solid var(--linha)', paddingTop: 14 }}>
            <ul className="lista">
              <li>A sessão presencial de implantação</li>
              <li>A campanha e a página no ar no mesmo dia</li>
              <li>Grupo de WhatsApp com a escola</li>
            </ul>
            <ul className="lista">
              <li>A máquina montada na tua conta</li>
              <li>Mais 3 encontros com o estrategista</li>
              <li>Troca de caminho quantas vezes precisar nos 3 meses</li>
            </ul>
          </div>
        </div>
        <div className="destaque azul">
          <div className="rot">Fora do valor</div>
          <p className="corpo">
            <strong>A verba de anúncio.</strong> É o dinheiro que o Facebook cobra pra mostrar o anúncio: é teu e
            vai direto pra lá. Começa baixo e sobe só no que estiver dando retorno.
          </p>
        </div>
        <div className="rodape"><span>Carreira no Digital</span><span>04</span></div>
      </section>

      {/* ───── aceite */}
      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O aceite</span></div>
        <h2 className="disp">Fechado?</h2>
        <p className="corpo">É só confirmar abaixo. Depois disso a escola entra em contato pra marcar a data.</p>
        <p className="corpo" style={{ fontSize: 13.5 }}>
          {orc.produto_nome || 'Implantação'} com 3 meses de estratégia acompanhada
          {vista ? ` · ${vista} à vista no Pix` : ''}
          {parcela && orc.parcelas ? ` ou ${orc.parcelas}x de ${parcela}` : ''}
          {' '}· pagamento único, sem mensalidade · verba de anúncio por conta da contratante · a máquina fica com a
          contratante ao final · a escola monta o método e testa junto, e não garante volume de vendas.
        </p>
        <Aceite slug={slug} nomeSugerido={cliente} aceitoEm={orc.aceito_em || null} aceitoNome={orc.aceito_nome || null} />
        <p className="corpo" style={{ fontSize: 12.5, color: 'var(--tinta-fraca)', marginTop: 14 }}>
          Escola Carreira no Digital · CNPJ 62.512.432/0001-39
        </p>
        <p className="corpo" style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--tinta-fraca)', marginTop: 20 }}>
          Proposta válida por {validade} dias · carreiranodigital.com
        </p>
        <div className="rodape"><span>Carreira no Digital</span><span>05</span></div>
      </section>
    </div>
  )
}
