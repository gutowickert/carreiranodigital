import type { Diagnostico, Nicho } from '@/lib/maia/quiz/quiz'

// Peças visuais do quiz da Maia: a Maia como guia (o único rosto feito por IA, a exceção combinada) e os
// exemplos personalizados com o nome do negócio, feitos em HTML/CSS (não são imagem gerada):
// a conversa no WhatsApp, o anúncio no Instagram e o relatório do dia 2.

export const MAIA_ROSTO = '/maia/img/maia-rosto.webp'

export function MaiaFala({ texto, grande = false }: { texto: string; grande?: boolean }) {
  return (
    <div className={`mq-fala${grande ? ' g' : ''}`}>
      <img src={MAIA_ROSTO} alt="Maia" width={grande ? 64 : 44} height={grande ? 64 : 44} />
      <p><b>Maia</b>{texto}</p>
    </div>
  )
}

// A fala da Maia reagindo à resposta anterior (curta, uma linha, com conhecimento do nicho)
const FALAS: Record<Nicho, Record<string, Record<string, string>>> = {
  oficina: {
    tipo: {
      mecanica: 'Mecânica geral vive de confiança: quem volta pra revisão vale ouro.',
      cambio: 'Câmbio é serviço caro: aqui a retomada do orçamento faz muita diferença.',
      retifica: 'Retífica é serviço grande: o cliente pesquisa antes, e quem responde primeiro sai na frente.',
      injecao: 'Luz acesa no painel deixa o cliente aflito: ele quer resposta na hora.',
      funilaria: 'Orçamento de funilaria demora pra ser decidido: chamar de novo no 3º dia ajuda.',
    },
    resposta: {
      rapido: 'Ótimo. Só falta cobrir a noite e o domingo.',
      eu1h: 'Entre um carro e outro, 1 hora passa rápido. O cliente não espera tanto.',
      horas: 'Algumas horas é tempo de o cliente chamar outra oficina.',
      fimdia: 'No fim do dia, muita gente já resolveu em outro lugar.',
    },
    retomada: {
      nada: 'Orçamento sem retomada costuma ser dinheiro esquecido.',
      asvezes: 'Chamar quando lembra depende do seu dia. Uma rotina resolve isso.',
      rotina: 'Pouca oficina faz isso. Ponto pra você.',
    },
    base: {
      nada: 'Quem já confia em você é o cliente mais barato de trazer de volta.',
      asvezes: 'Já é um começo. Na época certa, o recado rende mais.',
      rotina: 'Muito bom. A sua base já trabalha por você.',
    },
  },
  otica: {
    tipo: {
      rua: 'Loja de rua depende de quem passa: o anúncio leva a loja pra cidade inteira.',
      shopping: 'No shopping o movimento é grande, mas a concorrência está no mesmo corredor.',
      varias: 'Com mais de uma loja, saber de onde vem cada venda faz toda a diferença.',
    },
    resposta: {
      rapido: 'Ótimo. Só falta cobrir a noite e o domingo.',
      eu1h: 'Entre um atendimento e outro, 1 hora passa rápido. O cliente não espera tanto.',
      horas: 'Algumas horas é tempo de o cliente pedir preço em outra ótica.',
      fimdia: 'No fim do dia, muita gente já comprou em outro lugar.',
    },
    retomada: {
      nada: 'Quem pede orçamento de lente costuma estar comparando. Chamar de novo traz parte de volta.',
      asvezes: 'Chamar quando lembra depende do seu dia. Uma rotina resolve isso.',
      rotina: 'Pouca ótica faz isso. Ponto pra você.',
    },
    base: {
      nada: 'Óculos têm época de troca: um lembrete na hora certa traz o cliente de volta.',
      asvezes: 'Já é um começo. Na época certa, o recado rende mais.',
      rotina: 'Muito bom. A sua base já trabalha por você.',
    },
  },
}
const COMUM: Record<string, Record<string, string>> = {
  origem: {
    indicacao: 'Indicação é ótima, mas não dá pra ligar e desligar quando o movimento cai.',
    google: 'Quem acha você no Google já chega querendo resolver: resposta rápida fecha.',
    instagram: 'Postar ajuda, mas sem anúncio quase só vê quem já segue você.',
    anuncio: 'Então você já sabe que anúncio traz gente. O próximo passo é medir qual vende.',
    passam: 'Quem passa na frente é bom, mas deixa o movimento preso à rua.',
  },
}

export function falaDepois(nicho: Nicho, id: string, v: string | undefined, unidade: string): string | null {
  if (!v) return null
  if (id === 'volume') return `Anotado. Com esse movimento, cada ${unidade} a mais pesa no mês.`
  if (id === 'ticket') return 'Vou usar esse valor na conta, sempre pelo lado mais baixo da faixa.'
  if (id === 'anuncio') return 'Pronto, já fiz as contas. Só falta saber pra quem é o diagnóstico.'
  return FALAS[nicho][id]?.[v] || COMUM[id]?.[v] || null
}

const iniciais = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'M'

// ---------- a conversa no WhatsApp (o cliente do dono, às 22:47) ----------
const CONVERSA_OFICINA: Record<string, [string, string, string]> = {
  cambio: ['Boa noite. Meu carro está dando tranco quando troca de marcha. Vocês olham câmbio automático?', 'Corolla 2016', 'Esse tranco pode ter mais de uma causa, então o certo é fazer o diagnóstico aqui. Amanhã às 8h ou às 10h, qual fica melhor pra você?'],
  injecao: ['Boa noite. Acendeu a luz da injeção no painel. Vocês conseguem ver?', 'Onix 2019', 'Dá pra ver sim: a gente passa o scanner e te fala o que é antes de mexer. Amanhã às 8h ou às 10h, qual fica melhor?'],
  retifica: ['Boa noite. Meu motor está perdendo força e gastando óleo. Vocês fazem retífica?', 'Gol 2012, motor 1.6', 'Fazemos sim. O primeiro passo é a avaliação do motor, aí te passamos o orçamento certinho. Amanhã às 8h ou às 10h, qual fica melhor?'],
  funilaria: ['Boa noite. Bati de leve e amassou o para-choque. Quanto fica pra arrumar?', 'HB20 2020, prata', 'Pode mandar uma foto do amassado que já te dou uma ideia. O valor certo a gente passa vendo o carro. Amanhã às 8h ou às 10h, qual fica melhor?'],
  mecanica: ['Boa noite. Meu carro está fazendo um barulho na frente quando passo em lombada. Vocês olham?', 'Fiesta 2015', 'Olhamos sim. Pode ser suspensão, mas o certo é ver no elevador. Amanhã às 8h ou às 10h, qual fica melhor pra você?'],
}

export function CelularWhats({ nicho, negocio, tipo }: { nicho: Nicho; negocio: string; tipo: string }) {
  const nome = negocio || (nicho === 'oficina' ? 'Sua oficina' : 'Sua ótica')
  const msgs: { de: 'c' | 'n' | 'foto'; t: string; h: string }[] = nicho === 'oficina'
    ? (() => {
      const [a, b, c] = CONVERSA_OFICINA[tipo] || CONVERSA_OFICINA.mecanica
      return [
        { de: 'c', t: a, h: '22:47' },
        { de: 'n', t: `Boa noite! Aqui é da ${nome}. Olhamos sim. Me diz o modelo e o ano do carro?`, h: '22:47' },
        { de: 'c', t: b, h: '22:48' },
        { de: 'n', t: c, h: '22:48' },
      ]
    })()
    : [
      { de: 'c', t: 'Oi, boa noite. Quanto fica um óculos multifocal? Tenho a receita aqui.', h: '22:47' },
      { de: 'n', t: `Boa noite! Aqui é da ${nome}. Pode mandar a foto da receita que eu te passo as opções de lente.`, h: '22:47' },
      { de: 'foto', t: 'Foto da receita', h: '22:48' },
      { de: 'n', t: 'Recebi. Pra essa receita temos lentes multifocais em mais de uma faixa de preço. Quer passar amanhã pra escolher a armação? Abrimos às 9h.', h: '22:48' },
    ]
  return (
    <figure className="mq-mock">
      <div className="mq-cel">
        <div className="mq-cel-topo">
          <span className="mq-av">{iniciais(nome)}</span>
          <div><b>{nome}</b><small>online</small></div>
        </div>
        <div className="mq-cel-chat">
          <span className="mq-cel-dia">Hoje</span>
          {msgs.map((m, i) => m.de === 'foto'
            ? <div key={i} className="mq-msg c foto"><span className="mq-foto-receita">{m.t}</span><i>{m.h}</i></div>
            : <div key={i} className={`mq-msg ${m.de}`}>{m.t}<i>{m.h}</i></div>)}
        </div>
      </div>
      <figcaption>Exemplo de como a Maia atenderia o seu cliente às 22:47, com o nome da {nicho === 'oficina' ? 'sua oficina' : 'sua ótica'}.</figcaption>
    </figure>
  )
}

// ---------- o anúncio no Instagram ----------
const GANCHO_OFICINA: Record<string, string> = {
  cambio: 'Câmbio dando tranco', injecao: 'Luz da injeção acesa', retifica: 'Motor perdendo força',
  funilaria: 'Amassou o carro', mecanica: 'Carro fazendo barulho',
}
export function AnuncioInsta({ nicho, negocio, tipo, cidade, img }: { nicho: Nicho; negocio: string; tipo: string; cidade: string; img: string }) {
  const nome = negocio || (nicho === 'oficina' ? 'Sua oficina' : 'Sua ótica')
  const gancho = nicho === 'oficina' ? `${GANCHO_OFICINA[tipo] || GANCHO_OFICINA.mecanica} em ${cidade || 'sua cidade'}?` : `Precisando de óculos novos em ${cidade || 'sua cidade'}?`
  const corpo = nicho === 'oficina'
    ? `A ${nome} responde no WhatsApp na hora, até à noite. Manda o modelo do carro e o que está acontecendo.`
    : `A ${nome} responde no WhatsApp na hora, até à noite. Manda a foto da receita e veja as opções.`
  return (
    <figure className="mq-mock">
      <div className="mq-ig">
        <div className="mq-ig-topo"><span className="mq-av">{iniciais(nome)}</span><div><b>{nome}</b><small>Patrocinado</small></div></div>
        <div className="mq-ig-foto"><img src={img} alt="" loading="lazy" /><span>{gancho}</span></div>
        <div className="mq-ig-cta"><span>Enviar mensagem</span><i>›</i></div>
        <p><b>{nome}</b> {gancho} {corpo}</p>
      </div>
      <figcaption>Exemplo de anúncio, com o nome {nicho === 'oficina' ? 'da sua oficina' : 'da sua ótica'} e a sua cidade. Na Maia, as fotos e vídeos são os seus.</figcaption>
    </figure>
  )
}

// ---------- o relatório do dia 2, com os números do diagnóstico ----------
export function RelatorioDono({ d, unidade }: { d: Diagnostico; unidade: [string, string] }) {
  const g = d.ganho
  const n = Math.floor(g.vendas_maia_mes)
  const r = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
  const ret = 'R$ ' + g.retorno.toLocaleString('pt-BR', { minimumFractionDigits: g.retorno % 1 ? 2 : 0, maximumFractionDigits: 2 })
  return (
    <figure className="mq-mock">
      <div className="mq-rel">
        <div className="mq-rel-topo"><img src={MAIA_ROSTO} alt="Maia" width={40} height={40} /><div><b>Maia</b><small>Relatório do mês · dia 2</small></div></div>
        <p className="mq-rel-oi">Bom dia! Aqui está o mês da {d.negocio || 'sua empresa'}:</p>
        <div className="mq-rel-num">
          <div><b>{g.conversas}</b><span>conversas vindas do anúncio</span></div>
          <div><b>{n} {n === 1 ? unidade[0] : unidade[1]}</b><span>{d.nicho === 'oficina' ? 'fechados e ligados ao anúncio' : 'vendidos e ligados ao anúncio'}</span></div>
          <div><b>{r(g.valor_maia_mes)}</b><span>em {d.nicho === 'oficina' ? 'serviços medidos' : 'vendas medidas'}</span></div>
          <div><b>{ret}</b><span>a cada R$ 1 de anúncio</span></div>
        </div>
        <p className="mq-rel-txt">O anúncio que mais vendeu foi o de vídeo. Pausei os 2 que só traziam curioso e criei 3 novos no mesmo estilo do que vendeu. Pro próximo mês: manter {r(g.verba)} de verba.</p>
      </div>
      <figcaption>Exemplo com os seus números: é o tipo de relatório que a Maia manda no seu WhatsApp todo dia 2.</figcaption>
    </figure>
  )
}
