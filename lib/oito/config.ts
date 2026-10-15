// Oito Posts: o motor das marcas de nicho (12/10/2026). Cada marca tem domínio, nome e textos próprios; o motor é um só.
// O cliente nunca vê "Oito Posts" nem a escola. Pacote único: 8 posts estáticos por mês, sem fidelidade.
// 13/10: as marcas em espanhol (Colômbia e Chile), cobradas pela Hotmart: Feed Divino, Feed Sabroso, Feed Peludo.
//   nicho = qual modelo visual/planejador usa (o mesmo das marcas brasileiras); idioma = pt ou es
export type Marca = 'salao' | 'prato' | 'pata' | 'divino' | 'sabroso' | 'peludo'
export type Nicho = 'salao' | 'prato' | 'pata'
type InfoMarca = { nome: string; dominio: string; nicho: string; quem: string; base: Nicho; idioma: 'pt' | 'es'; gateway: 'asaas' | 'hotmart'; preco: number; moeda: 'BRL' | 'USD'; email: string }

// O PREÇO DAS MARCAS BRASILEIRAS (15/10): mude só aqui. A cobrança do Asaas, o suporte, as páginas de venda
// (o build.js das páginas, na pasta Desktop/Oito Posts/site, lê este número) e os anúncios (anuncios/gera-whats.js) saem dele.
export const PRECO_BRL = 197

export const MARCAS: Marca[] = ['salao', 'prato', 'pata', 'divino', 'sabroso', 'peludo']

export const oitoConfig = {
  preco: PRECO_BRL,
  postsMes: 8,
  postsTeste: 2,
  ajustesPorMes: 4,
  marcas: {
    salao: { nome: 'Salão no Feed', dominio: 'salaonofeed.com.br', nicho: 'salões de beleza, estética, sobrancelha, cílios, unhas e cabelo', quem: 'o teu salão', base: 'salao', idioma: 'pt', gateway: 'asaas', preco: PRECO_BRL, moeda: 'BRL', email: 'contato@salaonofeed.com.br' },
    prato: { nome: 'Prato no Feed', dominio: 'pratonofeed.com.br', nicho: 'restaurantes, lancherias, hamburguerias, pizzarias, confeitarias e delivery', quem: 'o teu restaurante', base: 'prato', idioma: 'pt', gateway: 'asaas', preco: PRECO_BRL, moeda: 'BRL', email: 'contato@pratonofeed.com.br' },
    pata: { nome: 'Pata no Feed', dominio: 'patanofeed.com.br', nicho: 'pet shops, banho e tosa, clínicas veterinárias e adestramento', quem: 'o teu pet shop', base: 'pata', idioma: 'pt', gateway: 'asaas', preco: PRECO_BRL, moeda: 'BRL', email: 'contato@patanofeed.com.br' },
    divino: { nome: 'Feed Divino', dominio: 'feeddivino.com', nicho: 'salones de belleza, uñas, cejas y pestañas, estética y barberías', quem: 'tu salón', base: 'salao', idioma: 'es', gateway: 'hotmart', preco: 39, moeda: 'USD', email: 'contacto@feeddivino.com' },
    sabroso: { nome: 'Feed Sabroso', dominio: 'feedsabroso.com', nicho: 'restaurantes, comidas rápidas, hamburgueserías, pizzerías, pastelerías y domicilios', quem: 'tu restaurante', base: 'prato', idioma: 'es', gateway: 'hotmart', preco: 39, moeda: 'USD', email: 'contacto@feedsabroso.com' },
    peludo: { nome: 'Feed Peludo', dominio: 'feedpeludo.com', nicho: 'pet shops, peluquería canina, veterinarias y guarderías', quem: 'tu pet shop', base: 'pata', idioma: 'es', gateway: 'hotmart', preco: 39, moeda: 'USD', email: 'contacto@feedpeludo.com' },
  } as Record<Marca, InfoMarca>,
  // enquanto o domínio da marca não aponta pra Vercel, os links saem pelo endereço da Vercel (/oito/<marca>/...)
  url(marca: Marca, caminho: string) {
    const d = process.env['OITO_DOMINIO_' + marca.toUpperCase()]
    return d ? `https://${d}/${caminho}` : `${process.env.OITO_URL_BASE || 'https://carreiranodigital.vercel.app'}/oito/${marca}/${caminho}`
  },
}
export const ehMarca = (m: any): m is Marca => MARCAS.includes(m)
export const nichoDe = (m: Marca): Nicho => oitoConfig.marcas[m]?.base || 'salao'
export const emEspanhol = (m: Marca) => oitoConfig.marcas[m]?.idioma === 'es'
export const precoTxt = (m: Marca) => oitoConfig.marcas[m].moeda === 'USD' ? `US$ ${oitoConfig.marcas[m].preco}` : `R$ ${oitoConfig.marcas[m].preco}`
// a mesma senha do painel do Recado protege o painel e o trabalhador (não precisa variável nova na Vercel)
export const senhaOk = (s: string | null) => !!s && !!process.env.RECADO_PAINEL_SENHA && s === process.env.RECADO_PAINEL_SENHA.replace(/^"|"$/g, '')
