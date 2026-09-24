// O MIOLO DA PROPOSTA, UM POR PRODUTO.
//
// A capa e as objeções a IA escreve pra cada cliente. Estas três folhas — o que é, como funciona e
// o investimento — são fixas e descrevem o PRODUTO. Até aqui existia só uma versão, a do Deu Venda,
// escrita direto na página.
//
// ⚠️ POR QUE ISTO VIROU ARQUIVO. Com um corpo só, vender outro produto significava trocar o nome e
// o preço e mandar um documento que se contradiz: a capa dizia "Anúncios para Negócios Locais" e o
// texto descrevia a implantação individual. Aconteceu de verdade — o Rick montou uma proposta de
// Deu Venda com o preço de R$ 797, que é o da turma de anúncios, pro Patrick, que tinha pedido as
// duas coisas separadas.
//
// PRA INCLUIR UM PRODUTO NOVO: escreve o corpo dele aqui e registra o nome em lib/proposta-produtos.
// A lista de lá não faz a proposta existir — ela só impede de oferecer uma que ainda não foi escrita.

type Props = {
  cliente: string
  produtoNome: string | null
  vista: string | null
  parcela: string | null
  parcelas: number | null
}

const ehANL = (nome: string | null) =>
  (nome || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes('anuncios para negocios locais')

/** Escolhe o corpo pelo nome do produto. Sem correspondência, cai no Deu Venda, que é o padrão da casa. */
export function CorpoDoProduto(p: Props) {
  return ehANL(p.produtoNome) ? <CorpoANL {...p} /> : <CorpoDeuVenda {...p} />
}

/**
 * OS NÚMEROS DA CAPA.
 *
 * ⚠️ ESTAVAM CRAVADOS NO DEU VENDA — "2 encontros de implantação", "3 meses acompanhado" — na
 * folha de rosto, que é a primeira coisa que o cliente lê. A proposta da turma de 3 dias abria
 * prometendo implantação e acompanhamento mensal, e só se contradizia na página seguinte.
 */
export function NumerosDaCapa({ produtoNome, vista }: { produtoNome: string | null; vista: string | null }) {
  const nums = ehANL(produtoNome)
    ? [['3', 'Dias presenciais'], ['1', 'Campanha no ar'], ['1', 'Pagamento único']]
    : [['2', 'Encontros de implantação'], ['3', 'Meses acompanhado'], ['1', 'Pagamento único']]
  return (
    <div className="numeros">
      {nums.map(([n, r]) => <div className="num" key={r}><b>{n}</b><span>{r}</span></div>)}
      {vista && <div className="num"><b style={{ color: 'var(--accent-claro)' }}>{vista}</b><span>À vista</span></div>}
    </div>
  )
}

/**
 * A LINHA MIÚDA DO ACEITE — é o que a pessoa confirma estar aceitando.
 *
 * ⚠️ TAMBÉM ERA SÓ DO DEU VENDA: prometia "3 meses de estratégia acompanhada" e "a máquina fica
 * com a contratante ao final" em qualquer proposta. Numa turma de 3 dias isso não é um texto
 * desatualizado, é um compromisso que a escola não assumiu — e fica registrado com o aceite.
 */
export function LinhaDoAceite({ produtoNome, vista, parcela, parcelas }: Omit<Props, 'cliente'>) {
  const valores = `${vista ? ` · ${vista} à vista no Pix` : ''}${parcela && parcelas ? ` ou ${parcelas}x de ${parcela}` : ''}`
  if (ehANL(produtoNome)) {
    return (
      <>
        {produtoNome || 'Anúncios para Negócios Locais'} · 3 dias de treinamento presencial{valores}
        {' '}· valor por inscrição, pagamento único · verba de anúncio por conta do aluno · a conta de anúncios
        é do aluno e continua com ele · a escola ensina e acompanha a execução durante o curso, e não garante
        volume de vendas.
      </>
    )
  }
  return (
    <>
      {produtoNome || 'Implantação'} com 3 meses de estratégia acompanhada{valores}
      {' '}· pagamento único, sem mensalidade · verba de anúncio por conta da contratante · a máquina fica com a
      contratante ao final · a escola monta o método e testa junto, e não garante volume de vendas.
    </>
  )
}

// ─────────────────────────────────────────────────────────── ANÚNCIOS PARA NEGÓCIOS LOCAIS
//
// Conteúdo tirado da página de vendas (carreiranodigital.com/anuncioslocais).
//
// ⚠️ SEM DATA DE TURMA AQUI. Data de turma e lote mudam a cada mês; cravadas no corpo fixo, a
// proposta do mês que vem sai mentindo sozinha. A turma combinada com o cliente vai na CAPA, que
// quem monta escreve e pode corrigir depois.
function CorpoANL({ cliente, produtoNome, vista, parcela, parcelas }: Props) {
  return (
    <>
      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O que é</span></div>
        <h2 className="disp">Três dias presenciais, e os anúncios do teu negócio no ar.</h2>
        <p className="corpo">
          Um treinamento de imersão em que tu aprende a criar e rodar campanhas no Meta Ads — e faz isso
          com o teu negócio de verdade, não com exemplo de aula. Sai dos três dias com campanha publicada,
          apontando pro teu WhatsApp, e com contatos já chegando.
        </p>
        <div className="destaque azul">
          <div className="rot">O que ele não é</div>
          <p className="corpo">
            Não é curso gravado pra assistir depois, e não é pra te transformar em gestor de tráfego. É pra
            tu parar de depender de agência e saber o que está sendo feito com o teu dinheiro.
          </p>
        </div>
        <div className="rodape"><span>Carreira no Digital</span><span>02</span></div>
      </section>

      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">Como funciona</span></div>
        <h2 className="disp">Três dias. Um negócio anunciando.</h2>
        <div className="passos">
          <div className="passo">
            <div className="n">Dia 1 · Estratégia e estrutura</div>
            <p className="corpo">Como o Meta Ads funciona e o que define quem aparece no feed. Estrutura de campanha, conjunto e anúncio. Formatos de criativo. A oferta, o público e o criativo do teu negócio.</p>
          </div>
          <div className="passo">
            <div className="n">Dia 2 · Mãos na massa</div>
            <p className="corpo">O gerenciador na prática, passo a passo. Tua primeira campanha criada e publicada ao vivo, apontando pro WhatsApp, com público, orçamento e posicionamento configurados.</p>
          </div>
          <div className="passo">
            <div className="n">Dia 3 · Resultados reais</div>
            <p className="corpo">Leitura de métricas: o que importa e o que ignorar. Otimização ao vivo das campanhas que já estão rodando, e como escalar o que funcionou.</p>
          </div>
        </div>
        <div className="destaque verde">
          <div className="rot">O que alunos fizeram durante o próprio curso</div>
          <p className="corpo">
            R$&nbsp;20 investidos e um apartamento de R$&nbsp;190 mil vendido · R$&nbsp;40 e R$&nbsp;12 mil em
            vendas numa loja de celular · R$&nbsp;8,53 e R$&nbsp;4.600 numa loja de pneus · 17 minutos de
            campanha e R$&nbsp;6.700 em brindes. O que separa esses números do resto não é a verba: é a campanha certa.
          </p>
        </div>
        <div className="duas">
          <ul className="lista">
            <li>Presencial, com o professor do teu lado em cada etapa</li>
            <li>Douglas Conceição, 10 anos de tráfego pago e dono de agência</li>
          </ul>
          <ul className="lista">
            <li>Turma pequena, dúvida respondida na hora</li>
            <li>Tudo implementado no teu negócio real, não em exemplo</li>
          </ul>
        </div>
        <div className="rodape"><span>Carreira no Digital</span><span>03</span></div>
      </section>

      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O investimento</span></div>
        <h2 className="disp">O que custa.</h2>
        <div className="preco">
          <div className="topo" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <span>{produtoNome || 'Anúncios para Negócios Locais'} · 3 dias presenciais</span>
          </div>
          <div className="preco-linha">
            {vista && <div className="valor"><b>{vista}</b><span>À vista, no Pix</span></div>}
            {parcela && parcelas && <div className="valor alt"><b>{parcela}</b><span>{parcelas}x sem juros</span></div>}
          </div>
          <p className="corpo"><strong>Por inscrição.</strong> Pagamento único, sem mensalidade.</p>
          <div className="duas" style={{ borderTop: '1px solid var(--linha)', paddingTop: 14 }}>
            <ul className="lista">
              <li>Os 3 dias de imersão presencial</li>
              <li>Campanha no ar ao final do treinamento</li>
            </ul>
            <ul className="lista">
              <li>Suporte durante o curso</li>
              <li>A conta de anúncios é tua e continua tua</li>
            </ul>
          </div>
        </div>
        <div className="destaque azul">
          <div className="rot">Fora do valor</div>
          <p className="corpo">
            <strong>A verba de anúncio.</strong> É o dinheiro que o Facebook cobra pra mostrar o anúncio: é teu
            e vai direto pra lá. Alunos fecharam venda com R$&nbsp;8, R$&nbsp;10, R$&nbsp;20 — começa baixo e
            sobe só no que estiver dando retorno.
          </p>
        </div>
        <p className="corpo" style={{ fontSize: 13.5 }}>
          Pra comparar: agência básica cobra a partir de R$&nbsp;1.000 por mês, R$&nbsp;12.000 no ano — e tu
          continua sem saber o que está sendo feito.
        </p>
        <div className="rodape"><span>Carreira no Digital</span><span>04</span></div>
      </section>
    </>
  )
}

// ─────────────────────────────────────────────────────────── DEU VENDA
// Texto que já estava na página, movido pra cá sem mudança de conteúdo.
function CorpoDeuVenda({ cliente, produtoNome, vista, parcela, parcelas }: Props) {
  return (
    <>
      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O que é</span></div>
        <h2 className="disp">Uma máquina de marketing montada dentro do teu negócio.</h2>
        <p className="corpo">
          Um especialista da escola senta contigo em dois encontros de um turno, em dias diferentes, e monta, com tu do lado, a máquina que
          escreve teus anúncios, tuas respostas e tuas páginas — configurada com o que tu vende, teu prazo
          e tua condição. A conta é tua, e continua tua depois.
        </p>
        <div className="destaque azul">
          <div className="rot">O que ela não faz</div>
          <p className="corpo">Ela não atende sozinha e não vende sozinha. Prepara o anúncio, a resposta e a página; quem fala com o cliente continua sendo tu.</p>
        </div>
        <div className="rodape"><span>Carreira no Digital</span><span>02</span></div>
      </section>

      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">Como funciona</span></div>
        <h2 className="disp">A implantação, e os 3 meses depois.</h2>
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
            <li>São 5 encontros: dois na implantação e um por mês, nos 3 meses</li>
            <li>Grupo de WhatsApp com o time da escola entre eles</li>
          </ul>
          <ul className="lista">
            <li>Os encontros seguintes podem ser por vídeo</li>
            <li>A máquina fica contigo ao final</li>
          </ul>
        </div>
        <div className="rodape"><span>Carreira no Digital</span><span>03</span></div>
      </section>

      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O investimento</span></div>
        <h2 className="disp">O que custa.</h2>
        <div className="preco">
          <div className="topo" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <span>{produtoNome || 'Implantação'} · com 3 meses de acompanhamento</span>
          </div>
          <div className="preco-linha">
            {vista && <div className="valor"><b>{vista}</b><span>À vista, no Pix</span></div>}
            {parcela && parcelas && <div className="valor alt"><b>{parcela}</b><span>{parcelas}x sem juros</span></div>}
          </div>
          <p className="corpo"><strong>Pagamento único.</strong> Sem mensalidade, e a máquina continua tua depois.</p>
          <div className="duas" style={{ borderTop: '1px solid var(--linha)', paddingTop: 14 }}>
            <ul className="lista">
              <li>Os dois encontros presenciais de implantação</li>
              <li>A campanha e a página no ar já na implantação</li>
              <li>Grupo de WhatsApp com a escola</li>
            </ul>
            <ul className="lista">
              <li>A máquina montada na tua conta</li>
              <li>Mais 3 encontros com o estrategista, um por mês</li>
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
    </>
  )
}
