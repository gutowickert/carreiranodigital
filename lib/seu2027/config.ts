// Seu 2027: o mapa do ano personalizado (produto novo, 24/11/2026). Mexer aqui muda o preço e os endereços.
// Variáveis na Vercel (lista completa em docs/seu2027/LEIA-ME.md):
//   KIWIFY_CHECKOUT_URL   link do checkout do produto na Kiwify (R$ 37)
//   KIWIFY_WEBHOOK_TOKEN  token do webhook da Kiwify (confere a assinatura de cada aviso de compra)
//   SEU2027_PIXEL_ID      pixel da Meta do produto (sem ele, as páginas não carregam pixel)
//   SEU2027_CAPI_TOKEN    token da API de Conversões desse pixel (sem ele usa FB_CAPI_TOKEN; sem os dois, só o pixel do navegador)
//   SEU2027_URL_SITE      endereço público (padrão https://carreiranodigital.com); com domínio próprio, também SEU2027_DOMINIO
//   SEU2027_EMAIL_DE      remetente do e-mail (domínio verificado no Resend; padrão: domínio do Recado)
//   SEU2027_TESTE_CHAVE   chave do modo de teste (gera mapa sem pagamento e sem banco: /api/seu2027/teste)
//   SEU2027_MODELO        modelo da IA (padrão claude-sonnet-5-5)
//   Já existentes e reaproveitadas: ANTHROPIC_API_KEY, RESEND_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
export const PRECO = 37
export const seu2027 = {
  marca: 'Seu 2027',
  preco: PRECO,
  urlSite: () => (process.env.SEU2027_URL_SITE || 'https://carreiranodigital.com').replace(/\/$/, ''),
  // a página do mapa (o link único que a pessoa guarda)
  linkMapa: (codigo: string) => `${seu2027.urlSite()}/seu2027/mapa?c=${encodeURIComponent(codigo)}`,
  modelo: () => process.env.SEU2027_MODELO || 'claude-sonnet-5-5',
  pixel: () => process.env.SEU2027_PIXEL_ID || '',
  // ÁUDIO NARRADO (fica pra depois): quando existir, ligar com SEU2027_AUDIO=1 e preencher gerarAudio() em lib/seu2027/entrega.ts
  audio: () => process.env.SEU2027_AUDIO === '1',
}
