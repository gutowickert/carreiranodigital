// Oito Posts: o motor das marcas de nicho (12/10/2026). Cada marca tem domínio, nome e textos próprios; o motor é um só.
// O cliente nunca vê "Oito Posts" nem a escola. Pacote único: 8 posts estáticos por mês, sem fidelidade.
// 13/10: as marcas em espanhol (Colômbia e Chile), cobradas pela Hotmart: Feed Divino, Feed Sabroso, Feed Peludo.
// 15/10: o espanhol virou UMA marca, "No Feed", com os 3 nichos dentro (ver NOFEED abaixo).
//   nicho = qual modelo visual/planejador usa (o mesmo das marcas brasileiras); idioma = pt ou es
export type Marca = 'salao' | 'prato' | 'pata' | 'divino' | 'sabroso' | 'peludo'
export type Nicho = 'salao' | 'prato' | 'pata'
type InfoMarca = { nome: string; dominio: string; nicho: string; quem: string; base: Nicho; idioma: 'pt' | 'es'; gateway: 'asaas' | 'hotmart'; preco: number; moeda: 'BRL' | 'USD'; email: string; grupo?: 'nofeed'; pasta?: string; rotulo?: string }

// O PREÇO DAS MARCAS BRASILEIRAS (15/10): mude só aqui. A cobrança do Asaas, o suporte, as páginas de venda
// (o build.js das páginas, na pasta Desktop/Oito Posts/site, lê este número) e os anúncios (anuncios/gera-whats.js) saem dele.
export const PRECO_BRL = 197
// O PREÇO DO NO FEED (espanhol, cobrado pela Hotmart), em dólar: mude só aqui (e no produto da Hotmart).
// As páginas (Desktop/Oito Posts/site/build-es.js) e os anúncios (anuncios/gera-nofeed.js) leem este número.
export const PRECO_USD = 39

// 15/10: o No Feed. Um site, um Instagram, uma assinatura na Hotmart (OITO_HOTMART_LINK_NOFEED), um pixel, um remetente
// (OITO_RESEND_NOFEED). As chaves divino/sabroso/peludo seguem como o NICHO do cliente (o estilo dos posts e os clientes
// antigos não mudam); o que o cliente vê (nome, e-mail, links) sai daqui. Páginas: /oito/nofeed/<pasta>/ pela Vercel,
// ou https://<OITO_DOMINIO_NOFEED>/<pasta>/ quando o domínio estiver ligado.
// DOMINIO_NOFEED é o domínio sugerido, AINDA NÃO COMPRADO: se comprar outro, troque aqui e em next.config.ts.
export const DOMINIO_NOFEED = 'nofeed.lat'
export const NOFEED = { nome: 'No Feed', dominio: DOMINIO_NOFEED, email: `hola@${DOMINIO_NOFEED}` }

export const MARCAS: Marca[] = ['salao', 'prato', 'pata', 'divino', 'sabroso', 'peludo']

export const oitoConfig = {
  preco: PRECO_BRL,
  postsMes: 8,
  postsTeste: 2,
  ajustesPorMes: 10, // 15/10: limite interno, não é anunciado na oferta (antes 4)
  marcas: {
    salao: { nome: 'Salão no Feed', dominio: 'salaonofeed.com.br', nicho: 'salões de beleza, estética, sobrancelha, cílios, unhas e cabelo', quem: 'o teu salão', base: 'salao', idioma: 'pt', gateway: 'asaas', preco: PRECO_BRL, moeda: 'BRL', email: 'contato@salaonofeed.com.br' },
    prato: { nome: 'Prato no Feed', dominio: 'pratonofeed.com.br', nicho: 'restaurantes, lancherias, hamburguerias, pizzarias, confeitarias e delivery', quem: 'o teu restaurante', base: 'prato', idioma: 'pt', gateway: 'asaas', preco: PRECO_BRL, moeda: 'BRL', email: 'contato@pratonofeed.com.br' },
    pata: { nome: 'Pata no Feed', dominio: 'patanofeed.com.br', nicho: 'pet shops, banho e tosa, clínicas veterinárias e adestramento', quem: 'o teu pet shop', base: 'pata', idioma: 'pt', gateway: 'asaas', preco: PRECO_BRL, moeda: 'BRL', email: 'contato@patanofeed.com.br' },
    divino: { nome: NOFEED.nome, dominio: NOFEED.dominio, nicho: 'salones de belleza, uñas, cejas y pestañas, estética y barberías', quem: 'tu salón', base: 'salao', idioma: 'es', gateway: 'hotmart', preco: PRECO_USD, moeda: 'USD', email: NOFEED.email, grupo: 'nofeed', pasta: 'salon', rotulo: 'No Feed · Salón' },
    sabroso: { nome: NOFEED.nome, dominio: NOFEED.dominio, nicho: 'restaurantes, comidas rápidas, hamburgueserías, pizzerías, pastelerías y domicilios', quem: 'tu restaurante', base: 'prato', idioma: 'es', gateway: 'hotmart', preco: PRECO_USD, moeda: 'USD', email: NOFEED.email, grupo: 'nofeed', pasta: 'restaurante', rotulo: 'No Feed · Restaurante' },
    peludo: { nome: NOFEED.nome, dominio: NOFEED.dominio, nicho: 'pet shops, peluquería canina, veterinarias y guarderías', quem: 'tu pet shop', base: 'pata', idioma: 'es', gateway: 'hotmart', preco: PRECO_USD, moeda: 'USD', email: NOFEED.email, grupo: 'nofeed', pasta: 'mascotas', rotulo: 'No Feed · Mascotas' },
  } as Record<Marca, InfoMarca>,
  // enquanto o domínio da marca não aponta pra Vercel, os links saem pelo endereço da Vercel (/oito/<marca>/...)
  url(marca: Marca, caminho: string) {
    const base = process.env.OITO_URL_BASE || 'https://carreiranodigital.vercel.app'
    const info = oitoConfig.marcas[marca]
    if (info?.grupo === 'nofeed') {
      const dn = process.env.OITO_DOMINIO_NOFEED
      return dn ? `https://${dn}/${info.pasta}/${caminho}` : `${base}/oito/nofeed/${info.pasta}/${caminho}`
    }
    const d = process.env['OITO_DOMINIO_' + marca.toUpperCase()]
    return d ? `https://${d}/${caminho}` : `${base}/oito/${marca}/${caminho}`
  },
}
export const ehMarca = (m: any): m is Marca => MARCAS.includes(m)
export const nichoDe = (m: Marca): Nicho => oitoConfig.marcas[m]?.base || 'salao'
export const emEspanhol = (m: Marca) => oitoConfig.marcas[m]?.idioma === 'es'
export const noFeed = (m: Marca) => oitoConfig.marcas[m]?.grupo === 'nofeed'
// o nome pra listas internas (painel, avisos): "No Feed · Salón" em vez de três "No Feed"
export const rotuloMarca = (m: Marca) => oitoConfig.marcas[m]?.rotulo || oitoConfig.marcas[m]?.nome || m
export const precoTxt = (m: Marca) => oitoConfig.marcas[m].moeda === 'USD' ? `US$ ${oitoConfig.marcas[m].preco}` : `R$ ${oitoConfig.marcas[m].preco}`
// a mesma senha do painel do Recado protege o painel e o trabalhador (não precisa variável nova na Vercel)
export const senhaOk = (s: string | null) => !!s && !!process.env.RECADO_PAINEL_SENHA && s === process.env.RECADO_PAINEL_SENHA.replace(/^"|"$/g, '')
