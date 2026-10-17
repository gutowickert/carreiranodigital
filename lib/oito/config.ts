// Oito Posts: o motor das marcas de nicho (12/10/2026). Cada marca tem domínio, nome e textos próprios; o motor é um só.
// O cliente nunca vê "Oito Posts" nem a escola. Pacote único: 8 posts estáticos por mês, sem fidelidade.
// 13/10: as marcas em espanhol (Colômbia e Chile), cobradas pela Hotmart: Feed Divino, Feed Sabroso, Feed Peludo.
// 15/10: o espanhol virou UMA marca, "Feed al Día", com os 3 nichos dentro (ver FEEDALDIA abaixo). Primeiro se chamou "No Feed".
//   nicho = qual modelo visual/planejador usa (o mesmo das marcas brasileiras); idioma = pt ou es
export type Marca = 'salao' | 'prato' | 'pata' | 'divino' | 'sabroso' | 'peludo'
export type Nicho = 'salao' | 'prato' | 'pata'
type InfoMarca = { nome: string; dominio: string; nicho: string; quem: string; base: Nicho; idioma: 'pt' | 'es'; gateway: 'asaas' | 'hotmart'; preco: number; moeda: 'BRL' | 'USD'; email: string; grupo?: 'feedaldia'; pasta?: string; rotulo?: string }

// O PREÇO DAS MARCAS BRASILEIRAS (15/10): mude só aqui. A cobrança do Asaas, o suporte, as páginas de venda
// (o build.js das páginas, na pasta Desktop/Oito Posts/site, lê este número) e os anúncios (anuncios/gera-whats.js) saem dele.
export const PRECO_BRL = 99 // 16/10: teste de preço pedido pelo Guto (era 197)
// O PREÇO DO FEED AL DÍA (espanhol, cobrado pela Hotmart), em dólar: mude só aqui (e no produto da Hotmart).
// As páginas (Desktop/Oito Posts/site/build-es.js) e os anúncios (anuncios/gera-feedaldia.js) leem este número.
export const PRECO_USD = 29 // 15/10: Guto baixou de 39 pra 29

// 15/10: o Feed al Día (antes "No Feed"). Um site, um Instagram, uma assinatura na Hotmart (OITO_HOTMART_LINK_FEEDALDIA),
// um pixel, um remetente (OITO_RESEND_FEEDALDIA). As chaves divino/sabroso/peludo seguem como o NICHO do cliente (o estilo dos
// posts e os clientes antigos não mudam); o que o cliente vê (nome, e-mail, links) sai daqui. Páginas: /oito/feedaldia/<pasta>/
// pela Vercel, ou https://<OITO_DOMINIO_FEEDALDIA>/<pasta>/ quando o domínio estiver ligado.
// As variáveis _NOFEED (o nome de antes) continuam valendo como reserva.
// DOMINIO_FEEDALDIA: se mudar, troque aqui e em next.config.ts.
export const DOMINIO_FEEDALDIA = 'feedaldia.com'
export const FEEDALDIA = { nome: 'Feed al Día', dominio: DOMINIO_FEEDALDIA, email: `hola@${DOMINIO_FEEDALDIA}` }
// a variável do Feed al Día, ou a do nome antigo (No Feed)
export const envFeedAlDia = (nome: string) => process.env['OITO_' + nome + '_FEEDALDIA'] || process.env['OITO_' + nome + '_NOFEED']

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
    divino: { nome: FEEDALDIA.nome, dominio: FEEDALDIA.dominio, nicho: 'salones de belleza, uñas, cejas y pestañas, estética y barberías', quem: 'tu salón', base: 'salao', idioma: 'es', gateway: 'hotmart', preco: PRECO_USD, moeda: 'USD', email: FEEDALDIA.email, grupo: 'feedaldia', pasta: 'salon', rotulo: 'Feed al Día · Salón' },
    sabroso: { nome: FEEDALDIA.nome, dominio: FEEDALDIA.dominio, nicho: 'restaurantes, comidas rápidas, hamburgueserías, pizzerías, pastelerías y domicilios', quem: 'tu restaurante', base: 'prato', idioma: 'es', gateway: 'hotmart', preco: PRECO_USD, moeda: 'USD', email: FEEDALDIA.email, grupo: 'feedaldia', pasta: 'restaurante', rotulo: 'Feed al Día · Restaurante' },
    peludo: { nome: FEEDALDIA.nome, dominio: FEEDALDIA.dominio, nicho: 'pet shops, peluquería canina, veterinarias y guarderías', quem: 'tu pet shop', base: 'pata', idioma: 'es', gateway: 'hotmart', preco: PRECO_USD, moeda: 'USD', email: FEEDALDIA.email, grupo: 'feedaldia', pasta: 'mascotas', rotulo: 'Feed al Día · Mascotas' },
  } as Record<Marca, InfoMarca>,
  // enquanto o domínio da marca não aponta pra Vercel, os links saem pelo endereço da Vercel (/oito/<marca>/...)
  url(marca: Marca, caminho: string) {
    const base = process.env.OITO_URL_BASE || 'https://carreiranodigital.vercel.app'
    const info = oitoConfig.marcas[marca]
    if (info?.grupo === 'feedaldia') {
      const dn = envFeedAlDia('DOMINIO')
      return dn ? `https://${dn}/${info.pasta}/${caminho}` : `${base}/oito/feedaldia/${info.pasta}/${caminho}`
    }
    const d = process.env['OITO_DOMINIO_' + marca.toUpperCase()]
    return d ? `https://${d}/${caminho}` : `${base}/oito/${marca}/${caminho}`
  },
}
export const ehMarca = (m: any): m is Marca => MARCAS.includes(m)
export const nichoDe = (m: Marca): Nicho => oitoConfig.marcas[m]?.base || 'salao'
export const emEspanhol = (m: Marca) => oitoConfig.marcas[m]?.idioma === 'es'

// 17/10: o Feed al Día passou a anunciar pra toda a América Latina (antes só Colômbia e Chile).
// país: nome, código do WhatsApp, dígitos do celular (sem o 0 de longa distância), começo válido, fuso.
// A mesma tabela está no formulário (public/oito/comum-es/form.js). Argentina: no WhatsApp vai 54 + 9 + o número.
export const PAISES_ES: Record<string, { nome: string; ddi: string; largo: number; inicio: string; fuso: string }> = {
  AR: { nome: 'Argentina', ddi: '54', largo: 10, inicio: '', fuso: 'America/Argentina/Buenos_Aires' },
  BO: { nome: 'Bolivia', ddi: '591', largo: 8, inicio: '6|7', fuso: 'America/La_Paz' },
  CL: { nome: 'Chile', ddi: '56', largo: 9, inicio: '9', fuso: 'America/Santiago' },
  CO: { nome: 'Colombia', ddi: '57', largo: 10, inicio: '3', fuso: 'America/Bogota' },
  CR: { nome: 'Costa Rica', ddi: '506', largo: 8, inicio: '', fuso: 'America/Costa_Rica' },
  EC: { nome: 'Ecuador', ddi: '593', largo: 9, inicio: '9', fuso: 'America/Guayaquil' },
  SV: { nome: 'El Salvador', ddi: '503', largo: 8, inicio: '6|7', fuso: 'America/El_Salvador' },
  GT: { nome: 'Guatemala', ddi: '502', largo: 8, inicio: '', fuso: 'America/Guatemala' },
  HN: { nome: 'Honduras', ddi: '504', largo: 8, inicio: '', fuso: 'America/Tegucigalpa' },
  MX: { nome: 'México', ddi: '52', largo: 10, inicio: '', fuso: 'America/Mexico_City' },
  NI: { nome: 'Nicaragua', ddi: '505', largo: 8, inicio: '', fuso: 'America/Managua' },
  PA: { nome: 'Panamá', ddi: '507', largo: 8, inicio: '6', fuso: 'America/Panama' },
  PY: { nome: 'Paraguay', ddi: '595', largo: 9, inicio: '9', fuso: 'America/Asuncion' },
  PE: { nome: 'Perú', ddi: '51', largo: 9, inicio: '9', fuso: 'America/Lima' },
  PR: { nome: 'Puerto Rico', ddi: '1', largo: 10, inicio: '787|939', fuso: 'America/Puerto_Rico' },
  DO: { nome: 'República Dominicana', ddi: '1', largo: 10, inicio: '809|829|849', fuso: 'America/Santo_Domingo' },
  UY: { nome: 'Uruguay', ddi: '598', largo: 8, inicio: '9', fuso: 'America/Montevideo' },
  VE: { nome: 'Venezuela', ddi: '58', largo: 10, inicio: '4', fuso: 'America/Caracas' },
}
// o WhatsApp completo (código do país + número, só dígitos) ou '' se não fecha com o país
export function whatsDoPais(pais: string, raw: string) {
  const p = PAISES_ES[pais]; if (!p) return ''
  let d = String(raw || '').replace(/\D/g, '')
  const certo = (n: string) => n.length === p.largo && (!p.inicio || new RegExp('^(' + p.inicio + ')').test(n))
  const ddi = p.ddi + (pais === 'AR' ? '9' : '')
  if (d.startsWith(ddi) && certo(d.slice(ddi.length))) return d
  if (d.length > p.largo && d.startsWith(p.ddi)) d = d.slice(p.ddi.length)
  if (pais === 'AR' && d.length > p.largo && d[0] === '9') d = d.slice(1)
  if (pais === 'MX' && d.length > p.largo && d[0] === '1') d = d.slice(1)
  while (d.length > p.largo && d[0] === '0') d = d.slice(1)
  return certo(d) ? ddi + d : ''
}
export const feedAlDia = (m: Marca) => oitoConfig.marcas[m]?.grupo === 'feedaldia'
// o nome pra listas internas (painel, avisos): "Feed al Día · Salón" em vez de três "Feed al Día"
export const rotuloMarca = (m: Marca) => oitoConfig.marcas[m]?.rotulo || oitoConfig.marcas[m]?.nome || m
// 15/10: o painel separado em duas regiões: br = Salão/Prato/Pata no Feed (R$, Asaas), latam = Feed al Día (US$, Hotmart).
// Registro sem marca (ou com marca desconhecida) fica no Brasil. As rotas do painel aceitam ?regiao=br|latam.
export type Regiao = 'br' | 'latam'
export const regiaoDe = (m: any): Regiao => oitoConfig.marcas[m as Marca]?.idioma === 'es' ? 'latam' : 'br'
export const lerRegiao = (v: string | null): Regiao | null => v === 'br' || v === 'latam' ? v : null
export const precoTxt =(m: Marca) => oitoConfig.marcas[m].moeda === 'USD' ? `US$ ${oitoConfig.marcas[m].preco}` : `R$ ${oitoConfig.marcas[m].preco}`
// a mesma senha do painel do Recado protege o painel e o trabalhador (não precisa variável nova na Vercel)
export const senhaOk = (s: string | null) => !!s && !!process.env.RECADO_PAINEL_SENHA && s === process.env.RECADO_PAINEL_SENHA.replace(/^"|"$/g, '')
