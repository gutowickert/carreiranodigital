// Oito Posts: o motor de três marcas de nicho (12/10/2026). Cada marca tem domínio, nome e textos próprios; o motor é um só.
// O cliente nunca vê "Oito Posts" nem a escola. Pacote único: 8 posts estáticos por mês, R$ 197, sem fidelidade.
export type Marca = 'salao' | 'prato' | 'pata'

export const oitoConfig = {
  preco: 197,
  postsMes: 8,
  postsTeste: 2,
  ajustesPorMes: 4,
  marcas: {
    salao: { nome: 'Salão no Feed', dominio: 'salaonofeed.com.br', nicho: 'salões de beleza, estética, sobrancelha, cílios, unhas e cabelo', quem: 'o teu salão' },
    prato: { nome: 'Prato no Feed', dominio: 'pratonofeed.com.br', nicho: 'restaurantes, lancherias, hamburguerias, pizzarias, confeitarias e delivery', quem: 'o teu restaurante' },
    pata: { nome: 'Pata no Feed', dominio: 'patanofeed.com.br', nicho: 'pet shops, banho e tosa, clínicas veterinárias e adestramento', quem: 'o teu pet shop' },
  } as Record<Marca, { nome: string; dominio: string; nicho: string; quem: string }>,
  // enquanto o domínio da marca não aponta pra Vercel, os links saem pelo endereço da Vercel (/oito/<marca>/...)
  url(marca: Marca, caminho: string) {
    const d = process.env['OITO_DOMINIO_' + marca.toUpperCase()]
    return d ? `https://${d}/${caminho}` : `${process.env.OITO_URL_BASE || 'https://carreiranodigital.vercel.app'}/oito/${marca}/${caminho}`
  },
}
export const ehMarca = (m: any): m is Marca => m === 'salao' || m === 'prato' || m === 'pata'
// a mesma senha do painel do Recado protege o painel e o trabalhador (não precisa variável nova na Vercel)
export const senhaOk = (s: string | null) => !!s && !!process.env.RECADO_PAINEL_SENHA && s === process.env.RECADO_PAINEL_SENHA.replace(/^"|"$/g, '')
