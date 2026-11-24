import type { Diagnostico, Nicho } from '@/lib/maia/quiz/quiz'
import { MAIA_ROSTO } from './visual'

// O visual das páginas da Maia por nicho (branch maia-nichos, gera-visual.mjs) dentro do quiz: a abertura escura com foto
// real + o cartão da Maia com as frentes em chips, e os 9 blocos da agência, agora com o nome do negócio e os números do
// diagnóstico. O CSS vem portado em ../nicho-visual.css (classes dentro de .mq-v). Fotos reais licenciadas
// (public/maia/img/quiz/FOTOS-LICENCA.md); IA só no rosto da Maia.

const IMG = (n: Nicho, f: string) => `/maia/img/quiz/${n}/${f}.jpg`
const sigla = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'M'
const arroba = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '') || 'seunegocio'
const R = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')

const Zap = () => <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" /></svg>
const Ok = () => <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
const Tk = () => <svg className="tk" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 6.5 4.5 10 11 2M7 10l.5.5L15 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
const Play = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M10 8.5v7l6-3.5z" fill="currentColor" /></svg>
const Foto = () => <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="m21 17-5-5-8 8" /></svg>

const CHIPS = ['Estratégia', 'Anúncios', 'WhatsApp 24 h', 'Retomada', 'Conteúdo', 'Relatório']

// ---------- a abertura ----------
export function Abertura({ nicho, hero, titulo, destaque, sub, botao, mini, onComecar }: { nicho: Nicho; hero: string; titulo: string; destaque: string; sub: string; botao: string; mini: string; onComecar: () => void }) {
  const k = destaque ? titulo.indexOf(destaque) : -1
  const antes = k >= 0 ? titulo.slice(0, k) : titulo, depois = k >= 0 ? destaque : '', resto = k >= 0 ? titulo.slice(k + destaque.length) : ''
  return (
    <section className="hero">
      <div className="ct">
        <div className="hero-foto">
          <img src={hero} alt="" fetchPriority="high" />
          <div className="maia-card">
            <img src={MAIA_ROSTO} alt="Maia" width={56} height={56} />
            <div><b>Oi, eu sou a Maia. Em 1 minuto eu te mostro quanto a sua {nicho === 'oficina' ? 'oficina' : 'ótica'} pode ganhar a mais.</b><div className="chips">{CHIPS.map(c => <span key={c}>{c}</span>)}</div></div>
          </div>
        </div>
        <div className="tx">
          <h1>{antes}{depois && <em>{depois}</em>}{resto}</h1>
          <p className="lead">{sub}</p>
          <div className="acoes">
            <button className="mq-btn" onClick={onComecar}>{botao}</button>
            <span className="mq-mini-esc">{mini}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------- os dados de cada nicho (curtos, como na página) ----------
const DADOS = {
  oficina: {
    cal: [['Dezembro, janeiro e julho', 'Vai pegar a estrada com a família?'], ['Verão', 'Ar do carro só soprando quente?'], ['Época de chuva', 'Carro puxando pro lado quando freia na chuva?'], ['Inverno', 'Carro custando a pegar de manhã?'], ['Fevereiro', 'O carro do vai e vem da escola está em dia?'], ['Fim de ano e 13º', 'Recebeu o 13º? Hora de resolver aquele barulho.']],
    ads: [['cambio-elevador', 'Câmbio', 'Dando tranco na troca de marcha?'], ['elevador-oficina-ampla', 'Férias', 'Vai pegar a estrada com a família?'], ['injecao-scanner', 'Painel', 'Acendeu a luz da injeção?'], ['mecanica-geral', 'Revisão', 'O óleo do seu carro venceu?'], ['embaixo-do-carro', 'Freio', 'Barulho quando freia?'], ['mecanico-tablet', 'Verão', 'Ar do carro só soprando quente?']],
    raio: '15 km',
    chat: {
      cambio: ['Boa noite. Meu carro está dando tranco quando troca de marcha. Vocês olham câmbio automático?', 'Corolla 2016', 'Esse tranco pode ter mais de uma causa, então o certo é fazer o diagnóstico aqui. Amanhã às 8h ou às 10h, qual fica melhor?'],
      injecao: ['Boa noite. Acendeu a luz da injeção no painel. Vocês conseguem ver?', 'Onix 2019', 'Dá pra ver sim: a gente passa o scanner e te fala o que é antes de mexer. Amanhã às 8h ou às 10h, qual fica melhor?'],
      retifica: ['Boa noite. Meu motor está perdendo força e gastando óleo. Vocês fazem retífica?', 'Gol 2012, motor 1.6', 'Fazemos sim. O primeiro passo é a avaliação do motor, aí te passamos o orçamento certinho. Amanhã às 8h ou às 10h?'],
      funilaria: ['Boa noite. Bati de leve e amassou o para-choque. Quanto fica pra arrumar?', 'HB20 2020, prata', 'Pode mandar uma foto do amassado que já te dou uma ideia. O valor certo a gente passa vendo o carro. Amanhã às 8h ou às 10h?'],
      mecanica: ['Boa noite. Meu carro está fazendo um barulho na frente quando passo em lombada. Vocês olham?', 'Fiesta 2015', 'Olhamos sim. Pode ser suspensão, mas o certo é ver no elevador. Amanhã às 8h ou às 10h, qual fica melhor?'],
    } as Record<string, string[]>,
    pergunta: 'Olhamos sim. Me diz o modelo e o ano do carro?',
    retomada: [['1 dia depois', 'Conseguiu ver o melhor dia pra trazer o carro?'], ['3 dias depois', 'Quer que eu te explique como funciona o diagnóstico?'], ['6 dias depois', 'Vou parar por aqui pra não incomodar. Quando quiser, é só chamar.']],
    fechar: 'Carlos quer trazer o carro amanhã às 8h. Corolla 2016, 98 mil km.',
    feed: ['elevador-oficina-ampla', 'retifica-cabecote', 'mecanica-geral', 'injecao-scanner', 'embaixo-do-carro', 'mecanico-capo', 'comando-valvulas', 'anuncio-motor', 'mecanico-tablet'],
    recadoFoto: 'elevador-oficina-ampla',
    recado: (n: string) => `Oi Carlos, aqui é da ${n}. A troca de óleo do seu carro vence este mês. Vejo um horário pra essa semana?`,
    vendas: 'Serviços fechados', repete: 'Repete: "câmbio dando tranco"', corta: 'Corta: "ar soprando quente"',
    proximo: 'Próximo mês: mais do que vendeu, menos do que só trouxe curioso.',
    analise: 'Análise de 2 dias: o anúncio do câmbio é o que mais traz conversa. Sigo com ele.',
    aprovar: '2 anúncios novos prontos: câmbio e revisão de férias. Aprova?',
  },
  otica: {
    cal: [['Janeiro e fevereiro', 'Lista de material pronta. E o óculos?'], ['Dezembro a março', 'Óculos de sol com o seu grau. Dá pra fazer?'], ['Maio', 'Um presente que ela usa todo dia.'], ['Agosto', 'Pro pai que afasta o celular pra conseguir ler.'], ['Novembro', 'Armação e lente com condição de Black.'], ['Dezembro', 'Óculos de sol de presente, com troca na loja.']],
    ads: [['oculos-de-sol', 'Verão', 'Óculos de sol com o seu grau?'], ['menina-oculos-rosa', 'Volta às aulas', 'Lista pronta. E o óculos?'], ['comparando-armacoes', 'Multifocal', 'Cansou de tirar o óculos pra ler?'], ['parafuso-oculos', 'Conserto', 'Óculos torto ou frouxo?'], ['mae-e-filha', 'Dia das Mães', 'Um presente que ela usa todo dia.'], ['cliente-na-parede', '1 ano', 'Faz 1 ano do seu óculos?']],
    raio: '10 km',
    chat: { _: ['Oi, boa noite. Quanto fica um óculos multifocal? Tenho a receita aqui.', 'FOTO', 'Recebi. Pra essa receita temos lentes multifocais em mais de uma faixa de preço. Quer passar amanhã pra escolher a armação? Abrimos às 9h.'] } as Record<string, string[]>,
    pergunta: 'Pode mandar a foto da receita que eu te passo as opções de lente.',
    retomada: [['1 dia depois', 'Separei 4 armações leves pra você. Quer que eu mande as fotos?'], ['3 dias depois', 'Quer que eu explique a diferença entre as lentes multifocais?'], ['6 dias depois', 'Vou parar por aqui pra não incomodar. Quando quiser, é só chamar.']],
    fechar: 'Ana quer provar armações de metal leve no sábado de manhã. Multifocal, receita em dia.',
    feed: ['cliente-na-parede', 'oculos-de-sol', 'parede-armacoes', 'mae-e-filha', 'comparando-armacoes', 'vitrine-armacoes', 'menina-oculos-rosa', 'parafuso-oculos', 'provando-oculos'],
    recadoFoto: 'parede-armacoes',
    recado: (n: string) => `Oi Ana, aqui é da ${n}. Faz 1 ano do seu óculos. Quer passar aqui pra um ajuste e ver as armações novas?`,
    vendas: 'Óculos vendidos', repete: 'Repete: "óculos de sol com o seu grau"', corta: 'Corta: "conserto na hora"',
    proximo: 'Próximo mês: volta às aulas e óculos infantil.',
    analise: 'Análise de 2 dias: o anúncio de óculos de sol com grau é o que mais traz receita. Sigo com ele.',
    aprovar: '2 anúncios novos prontos: óculos de sol com grau e volta às aulas. Aprova?',
  },
}

function Bloco({ i, rotulo, titulo, linha, children }: { i: number; rotulo: string; titulo: string; linha: string; children: React.ReactNode }) {
  return (
    <article className="bl">
      <div className="tx"><div className="k"><i>{i}</i><span>{rotulo}</span></div><h3>{titulo}</h3><p>{linha}</p></div>
      <div className="vis">{children}</div>
    </article>
  )
}

// ---------- os 9 blocos da agência, com o nome e os números do diagnóstico ----------
export function Agencia({ d, nicho, tipo }: { d: Diagnostico; nicho: Nicho; tipo: string }) {
  const D = DADOS[nicho]
  const g = d.ganho
  const nome = d.negocio || (nicho === 'oficina' ? 'Sua oficina' : 'Sua ótica')
  const sua = nicho === 'oficina' ? 'sua oficina' : 'sua ótica'
  const sg = sigla(nome)
  const chat = nicho === 'oficina' ? (D.chat[tipo] || D.chat.mecanica) : D.chat._
  const vendas = Math.floor(g.vendas_maia_mes)
  const ret = 'R$ ' + g.retorno.toLocaleString('pt-BR', { minimumFractionDigits: g.retorno % 1 ? 2 : 0, maximumFractionDigits: 2 })
  return (
    <div className="blocos">
      <Bloco i={1} rotulo="Estratégia" titulo="Sabe o que anunciar em cada época" linha={`Monta o calendário do ano da ${sua} e escolhe por onde começar. Revisa a cada 15 dias.`}>
        <div className="calv">{D.cal.map(([e, t]) => <div key={e}><small>{e}</small><b>&quot;{t}&quot;</b></div>)}</div>
      </Bloco>

      <Bloco i={2} rotulo="Criação" titulo="Cria os anúncios do mês" linha="Uns 6 vídeos e 6 imagens por mês, com as fotos reais do seu trabalho.">
        <div className="ads">{D.ads.map(([f, o, t]) => <div className="ad" key={f}><img src={IMG(nicho, f)} alt="" loading="lazy" /><div><small>{o}</small><b>{t}</b></div></div>)}</div>
        <p className="ex">Exemplos com fotos de banco · na sua conta, as fotos são suas</p>
      </Bloco>

      <Bloco i={3} rotulo="Tráfego" titulo="Coloca no ar pra sua cidade" linha={`Facebook e Instagram, só pra quem está perto da ${sua}.`}>
        <div className="mapa" role="img" aria-label={`Mapa com a ${nome} no centro e um raio de ${D.raio}`}><span className="rede">Facebook · Instagram</span><span className="raio" /><span className="nomep">{nome}</span><span className="pino" /><span className="rot">Raio de {D.raio}</span></div>
        <div className="nums"><div><b>{R(g.verba)}</b><span>de verba por mês{g.verba_sugerida ? ' (sugerida)' : ''}</span></div><div><b>{g.conversas}</b><span>conversas no WhatsApp</span></div></div>
        <p className="ex">Com os números do seu diagnóstico</p>
      </Bloco>

      <Bloco i={4} rotulo="Atendimento" titulo="Atende o WhatsApp 24 h" linha={`Com o nome da ${sua}, até de noite e no domingo.`}>
        <div className="cel" role="img" aria-label={`Conversa de exemplo no WhatsApp da ${nome}`}>
          <span className="selo1"><Ok />Respondeu em 1 min</span>
          <div className="tela">
            <div className="wa-top"><span className="av">{sg}</span><div><b>{nome}</b><small>online</small></div></div>
            <div className="wa-msgs">
              <div className="bal c">{chat[0]}<div className="h">22:47</div></div>
              <div className="bal e">Boa noite! Aqui é da {nome}. {D.pergunta}<div className="h">22:47<Tk /></div></div>
              {chat[1] === 'FOTO'
                ? <div className="bal c foto"><div className="anexo"><Foto />Foto da receita</div><div className="h">22:48</div></div>
                : <div className="bal c">{chat[1]}<div className="h">22:48</div></div>}
              <div className="bal e">{chat[2]}<div className="h">22:48<Tk /></div></div>
            </div>
          </div>
        </div>
        <p className="ex">Exemplo com o nome da {sua}</p>
      </Bloco>

      <Bloco i={5} rotulo="Retomada" titulo="Traz de volta quem sumiu" linha="Três lembretes educados. Quem quer fechar vai pra você ou pra sua equipe, com o resumo pronto.">
        <ol className="linha">
          {D.retomada.map(([q, t]) => <li key={q}><span className="pt" /><div><small>{q}</small><div className="notif"><span className="app"><Zap /></span><div><b>{nome}</b><span>{t}</span></div></div></div></li>)}
          <li className="pra-equipe"><span className="pt" /><div><small>Quer fechar</small><div className="notif"><span className="app"><Ok /></span><div><b>Pra sua equipe</b><span>{D.fechar}</span></div></div></div></li>
        </ol>
      </Bloco>

      <Bloco i={6} rotulo="Conteúdo" titulo="Mantém o seu Instagram vivo" linha="Uns 8 posts e 4 vídeos por mês, pra quem vê o anúncio achar um perfil confiável.">
        <div className="ig" role="img" aria-label="Exemplo de perfil no Instagram com 9 posts">
          <div className="ig-top"><span className="av">{sg}</span><div><b>{arroba(nome)}</b><span>3 posts por semana · Instagram e Facebook</span></div></div>
          <div className="ig-grade">{D.feed.map((f, i) => <div key={i}><img src={IMG(nicho, f)} alt="" loading="lazy" />{[1, 5, 8].includes(i) && <span className="rl" aria-label="vídeo"><Play /></span>}</div>)}</div>
        </div>
        <p className="ex">Exemplo com fotos de banco · na sua conta, as fotos e os vídeos são seus</p>
      </Bloco>

      <Bloco i={7} rotulo="Recado pra base" titulo="Chama o cliente antigo na hora certa" linha="Ela avisa quem já comprou, antes de ele lembrar sozinho.">
        <div className="rec"><img src={IMG(nicho, D.recadoFoto)} alt="" loading="lazy" /><div className="hora">09:30</div><div className="notif"><span className="app"><Zap /></span><div><b>{nome}</b><span>{D.recado(nome)}</span></div></div><div className="bt"><span>Quero</span><span>Não quero receber</span></div></div>
      </Bloco>

      <Bloco i={8} rotulo="Medição" titulo="Sabe o que vende de verdade" linha="Liga cada venda ao anúncio, devolve a venda pra Meta achar mais gente que compra e repete o que vende.">
        <div className="funil">
          <div><span>Verba do mês</span><b>{R(g.verba)}</b></div>
          <div><span>Conversas no WhatsApp</span><b>{g.conversas}</b></div>
          <div><span>{D.vendas}</span><b>{vendas}</b></div>
          <div><span>Em vendas medidas</span><b>{R(g.valor_maia_mes)}</b></div>
        </div>
        <div className="decide"><span className="sim">{D.repete}</span><span className="nao">{D.corta}</span></div>
        <div className="relat" style={{ marginTop: 12 }}><small>Relatório todo dia 2</small><dl><div><dt>Conversas</dt><dd>{g.conversas}</dd></div><div><dt>{D.vendas}</dt><dd>{vendas}</dd></div><div><dt>A cada R$ 1</dt><dd>{ret}</dd></div></dl><p>{D.proximo}</p></div>
        <p className="ex">Exemplo com os números do seu diagnóstico</p>
      </Bloco>

      <Bloco i={9} rotulo="Você no comando" titulo="Você só aprova, pelo celular" linha="Análise a cada 2 dias no seu WhatsApp. Um toque e vai pro ar. Sem reunião.">
        <div className="cmd1"><div className="mini"><div className="wa-top"><span className="av"><img src={MAIA_ROSTO} alt="" width={34} height={34} /></span><div><b>Maia</b><small>sua agência</small></div></div><div className="wa-msgs"><div className="bal c">{D.analise}<div className="h">08:10</div></div><div className="bal c">{D.aprovar}<div className="h">08:12</div></div></div><div className="bts"><span>Aprovar</span><span>Ajustar</span></div></div></div>
        <p className="ex">Exemplo</p>
      </Bloco>
    </div>
  )
}
