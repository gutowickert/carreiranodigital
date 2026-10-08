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
// Corpos hoje: Deu Venda (individual), Anúncios para Negócios Locais e Imersão Deu Venda (turma, 08/10/2026).
//
// PRA INCLUIR UM PRODUTO NOVO: escreve o corpo dele aqui e registra o nome em lib/proposta-produtos.
// A lista de lá não faz a proposta existir — ela só impede de oferecer uma que ainda não foi escrita.

import type { TurmaResumo } from '@/lib/turma-da-proposta'
import { datasDaTurma, maisDias } from '@/lib/turma-da-proposta'

type Props = {
  cliente: string
  produtoNome: string | null
  vista: string | null
  parcela: string | null
  parcelas: number | null
  turma?: TurmaResumo | null
}

/**
 * O BOTÃO DE ACEITAR, DESLIGADO — o que a prévia mostra no lugar do de verdade.
 *
 * ⚠️ ANTES EU SUMIA COM ELE e deixava uma frase pequena em itálico explicando. O Nando procurou o
 * botão duas vezes e não achou; da segunda achou que ele tinha sido apagado do sistema. Esconder
 * uma coisa e explicar em letra miúda não é explicar — quem está conferindo a proposta quer ver a
 * proposta INTEIRA, do jeito que o cliente vai ver, e "não dá pra clicar" é diferente de "não
 * existe".
 */
export function AceiteDaPrevia() {
  return (
    <div>
      <button className="aceite-botao" disabled style={{ opacity: .45, cursor: 'not-allowed' }}>
        Li e aceito esta proposta
      </button>
      <p className="corpo" style={{ fontSize: 12.5, color: 'var(--tinta-fraca)', marginTop: 8 }}>
        Na prévia o botão fica desligado — pra ninguém aceitar no lugar do cliente. No link que tu
        manda pra ele, funciona normalmente.
      </p>
    </div>
  )
}

const semAcento = (nome: string | null) => (nome || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const ehANL = (nome: string | null) => semAcento(nome).includes('anuncios para negocios locais')
// ⚠️ A IMERSÃO VEM ANTES DO DEU VENDA EM TODA ESCOLHA: "Imersão Deu Venda" contém "Deu Venda", e o
// corpo do individual (implantação, 3 meses, 5 encontros) numa proposta de turma é o mesmo erro do
// Patrick ao contrário (08/10/2026)
const ehImersaoDV = (nome: string | null) => semAcento(nome).includes('imersao deu venda')

/** Escolhe o corpo pelo nome do produto. Sem correspondência, cai no Deu Venda, que é o padrão da casa. */
export function CorpoDoProduto(p: Props) {
  if (ehImersaoDV(p.produtoNome)) return <CorpoImersaoDV {...p} />
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
  const nums = ehImersaoDV(produtoNome)
    ? [['3', 'Encontros presenciais'], ['1', 'Encontro de resultado'], ['1', 'Pagamento único']]
    : ehANL(produtoNome)
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
export function LinhaDoAceite({ produtoNome, vista, parcela, parcelas, turma }: Omit<Props, 'cliente'>) {
  const valores = `${vista ? ` · ${vista} à vista no Pix` : ''}${parcela && parcelas ? ` ou ${parcelas}x de ${parcela} no cartão de crédito` : ''}`
  if (ehImersaoDV(produtoNome)) {
    const quando = turma ? ` · encontros ${datasDaTurma(turma.data_inicio, maisDias(turma.data_inicio, 2))} e encontro de resultado em ${diaEMes(turma.data_fim)}, em ${turma.cidade}${turma.turno ? ` (${turma.turno})` : ''}` : ''
    return (
      <>
        {produtoNome || 'Imersão Deu Venda'} · 3 encontros presenciais de 3 horas e 1 encontro de resultado{quando}{valores}
        {' '}· valor por inscrição, pagamento único · verba de anúncio por conta do aluno, direto pra Meta · a máquina de IA
        e as contas são do aluno e continuam com ele · a escola faz junto nos encontros e acompanha 30 dias no grupo da
        turma, e não garante volume de vendas.
      </>
    )
  }
  if (ehANL(produtoNome)) {
    // a DATA entra no que a pessoa confirma: aceitar um curso sem saber quando é não é aceite
    const quando = turma ? ` · ${datasDaTurma(turma.data_inicio, turma.data_fim)}, em ${turma.cidade}${turma.turno ? ` (${turma.turno})` : ''}` : ''
    return (
      <>
        {produtoNome || 'Anúncios para Negócios Locais'} · 3 dias de treinamento presencial{quando}{valores}
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
// ⚠️ NADA DE DATA ESCRITA À MÃO AQUI. Data de turma muda todo mês; cravada no texto fixo, a
// proposta do mês que vem mentiria sozinha. Ela vem do CADASTRO DA TURMA escolhida na tela
// (`turma`), que é obrigatória pra este produto — o texto não sabe nem precisa saber a data.
/**
 * QUANDO E ONDE — a folha que faltava.
 *
 * ⚠️ NÃO É DETALHE: é a pergunta que o cliente faz antes do preço. A data vinha digitada na capa
 * pelo vendedor, ou simplesmente não vinha. Agora sai do cadastro da turma escolhida, então não
 * tem como estar desatualizada — se a turma mudar, a proposta muda junto.
 */
function QuandoEOnde({ turma }: { turma: TurmaResumo }) {
  const horario = turma.turno
    ? `${turma.turno.charAt(0).toUpperCase()}${turma.turno.slice(1)}${turma.horario ? `, das ${turma.horario}` : ''}`
    : null
  return (
    <div className="destaque verde">
      <div className="rot">Quando e onde</div>
      <p className="corpo">
        <strong>{datasDaTurma(turma.data_inicio, turma.data_fim)}</strong>, em {turma.cidade}.
        {horario ? ` ${horario}.` : ''}
        {/* ⚠️ SÓ O ENDEREÇO, NUNCA O NOME DA SALA. "Sala 1" é nome interno e não diz nada a quem
            vai se deslocar — imprimir isso no lugar do endereço seria trocar uma informação que
            falta por uma que não serve.
            E a frase do fim muda conforme o que temos: prometer que "o endereço chega depois"
            logo abaixo do endereço completo faz o cliente duvidar do que acabou de ler. */}
        {turma.endereco ? ` ${turma.endereco}.` : ''}
        {turma.endereco
          ? ' Turma pequena — os detalhes finais chegam por WhatsApp na confirmação.'
          : ' Turma pequena — o endereço e os detalhes chegam por WhatsApp na confirmação.'}
      </p>
    </div>
  )
}

function CorpoANL({ cliente, produtoNome, vista, parcela, parcelas, turma }: Props) {
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
        {turma && <QuandoEOnde turma={turma} />}
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
            {parcela && parcelas && <div className="valor alt"><b>{parcela}</b><span>{parcelas}x no cartão de crédito</span></div>}
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

// ─────────────────────────────────────────────────────────── IMERSÃO DEU VENDA (turma)
//
// Conteúdo tirado das páginas carreiranodigital.com/imersaolajeado e /imersaopoa (08/10/2026, pedido
// do Nando). É o Deu Venda EM TURMA: 3 encontros de 3 horas seguidos e um de resultado uns 20 dias
// depois. Não tem implantação individual nem os 3 meses do Deu Venda.
//
// ⚠️ AS DATAS SAEM DA TURMA, nunca escritas aqui. No cadastro, `data_inicio` é o 1º encontro e
// `data_fim` é o ENCONTRO DE RESULTADO (não o 3º encontro): os 3 encontros são dias seguidos a
// partir do início (terça a quinta). Usar data_inicio→data_fim como período escreveria "20 de
// outubro a 3 de novembro", como se fossem duas semanas de aula.
const diaEMes = (iso: string) => datasDaTurma(iso, iso)

function QuandoEOndeImersao({ turma }: { turma: TurmaResumo }) {
  const horario = turma.turno
    ? `${turma.turno.charAt(0).toUpperCase()}${turma.turno.slice(1)}${turma.horario ? `, das ${turma.horario}` : ''}`
    : null
  return (
    <div className="destaque verde">
      <div className="rot">Quando e onde</div>
      <p className="corpo">
        Encontros em <strong>{datasDaTurma(turma.data_inicio, maisDias(turma.data_inicio, 2))}</strong>, em {turma.cidade}.
        {horario ? ` ${horario}.` : ''} Encontro de resultado em <strong>{diaEMes(turma.data_fim)}</strong>.
        {turma.endereco ? ` ${turma.endereco}.` : ''}
        {turma.endereco
          ? ' Turma pequena, vagas limitadas. Os detalhes finais chegam por WhatsApp na confirmação.'
          : ' Turma pequena, vagas limitadas. O endereço e os detalhes chegam por WhatsApp na confirmação.'}
      </p>
    </div>
  )
}

function CorpoImersaoDV({ cliente, produtoNome, vista, parcela, parcelas, turma }: Props) {
  return (
    <>
      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O que é</span></div>
        <h2 className="disp">Em 3 encontros, o teu negócio com anúncio rodando e vídeo editado pela IA.</h2>
        <p className="corpo">
          Uma imersão presencial, em turma pequena. Tu grava no celular e a inteligência artificial edita. A gente
          monta contigo a estratégia, as artes e a campanha, e uns 20 dias depois senta de novo pra olhar os números.
        </p>
        <div className="destaque azul">
          <div className="rot">Não é aula pra assistir</div>
          <p className="corpo">
            Tu traz o teu notebook, o celular com o WhatsApp Business e o acesso ao Facebook e ao Instagram do teu
            negócio, e a gente faz junto. Cada encontro termina com algo pronto no teu negócio.
          </p>
        </div>
        <div className="destaque verde">
          <div className="rot">A novidade</div>
          <p className="corpo">
            A parte em que quase todo negócio trava é o vídeo. Agora tu grava do teu jeito no celular, e a máquina deixa
            pronto pra anunciar: corta as pausas, põe legenda no tempo da fala e as tuas cores e a tua marca.
          </p>
        </div>
        <div className="rodape"><span>Carreira no Digital</span><span>02</span></div>
      </section>

      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">Como funciona</span></div>
        <h2 className="disp">Três encontros. Um negócio anunciando.</h2>
        <div className="passos">
          <div className="passo"><div className="n">Encontro 1 · Estratégia</div><p className="corpo">O contexto do teu negócio, o teu mercado, a tua oferta e pra quem falar. É o que faz a IA trabalhar pro teu negócio, e não um texto genérico. Sai com a estratégia e os roteiros dos vídeos.</p></div>
          <div className="passo"><div className="n">Encontro 2 · Arte, vídeo e campanha</div><p className="corpo">As artes, as imagens e os vídeos que tu gravou, editados pela IA. E a campanha no Facebook e no Instagram, montada direto pelo Claude, contigo do lado. Sai com os anúncios no ar.</p></div>
          <div className="passo"><div className="n">Encontro 3 · Ajuste e atendimento</div><p className="corpo">Os primeiros contatos chegando, o ajuste da campanha com dado de verdade, o atendimento no WhatsApp e o site da tua empresa feito com a IA. Sai com a campanha ajustada, o atendimento organizado e o site no ar.</p></div>
          <div className="passo"><div className="n">Encontro de resultado · uns 20 dias depois</div><p className="corpo">A turma volta com os números na mão: quantas pessoas chamaram, quanto custou cada conversa, o que vendeu. E o que fazer daqui pra frente.</p></div>
        </div>
        {turma && <QuandoEOndeImersao turma={turma} />}
        <div className="duas">
          <ul className="lista">
            <li>Conduzida pelo Guto Wickert, idealizador da Carreira no Digital, 16 anos de empresa física antes do digital</li>
            <li>O que tu faz na imersão é o que a escola usa todo dia no próprio negócio</li>
          </ul>
          <ul className="lista">
            <li>Turma pequena, presencial, encontros de 3 horas</li>
            <li>30 dias no grupo da turma, com o time da escola no WhatsApp</li>
          </ul>
        </div>
        <div className="rodape"><span>Carreira no Digital</span><span>03</span></div>
      </section>

      <section className="folha">
        <div className="topo"><span>{cliente} · Proposta</span><span className="secao">O investimento</span></div>
        <h2 className="disp">O que custa.</h2>
        <div className="preco">
          <div className="topo" style={{ borderBottom: 0, paddingBottom: 0 }}>
            <span>{produtoNome || 'Imersão Deu Venda'} · 3 encontros e o encontro de resultado</span>
          </div>
          <div className="preco-linha">
            {vista && <div className="valor"><b>{vista}</b><span>À vista, no Pix</span></div>}
            {parcela && parcelas && <div className="valor alt"><b>{parcela}</b><span>{parcelas}x no cartão de crédito</span></div>}
          </div>
          <p className="corpo"><strong>Por inscrição.</strong> Pagamento único, sem mensalidade.</p>
          <div className="duas" style={{ borderTop: '1px solid var(--linha)', paddingTop: 14 }}>
            <ul className="lista">
              <li>A tua estratégia e o teu padrão de marca</li>
              <li>A máquina de IA configurada no Claude, que é tua</li>
              <li>A edição dos teus vídeos, instalada no teu computador</li>
              <li>Artes, posts, roteiros e legendas no teu padrão</li>
            </ul>
            <ul className="lista">
              <li>A campanha no Facebook e no Instagram, no ar desde o 2º encontro</li>
              <li>O atendimento no WhatsApp Business organizado</li>
              <li>O site da tua empresa no ar</li>
              <li>O encontro de resultado e 30 dias no grupo da turma</li>
            </ul>
          </div>
        </div>
        <div className="destaque azul">
          <div className="rot">Fora do valor</div>
          <p className="corpo">
            <strong>A verba dos anúncios.</strong> É tua e vai direto pra Meta. Quanto investir, a gente define contigo
            no 1º encontro.
          </p>
        </div>
        <p className="corpo" style={{ fontSize: 13.5 }}>
          Pra levar: notebook, celular com o WhatsApp Business e o acesso à página do Facebook e ao Instagram do teu
          negócio. A gente te manda o passo a passo antes.
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
            {parcela && parcelas && <div className="valor alt"><b>{parcela}</b><span>{parcelas}x no cartão de crédito</span></div>}
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
