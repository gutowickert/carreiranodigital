// Maia: o link assinado que a equipe manda pro dono conectar o WhatsApp (05/11). Vale 14 dias.
import { createHmac, timingSafeEqual } from 'crypto'

// 07/11 (segurança): a senha do Recado não assina mais o link (quem tem a senha do Recado não pode gerar link de conexão da Maia)
const SEGREDO = () => process.env.MAIA_CONECTAR_SEGREDO || process.env.MAIA_PAINEL_SENHA || ''
const VALIDADE_DIAS = 14

export function assinaLink(negocio_id: string, ate = Date.now() + VALIDADE_DIAS * 86400e3) {
  const exp = Math.floor(ate / 1000)
  const sig = createHmac('sha256', SEGREDO()).update(`${negocio_id}.${exp}`).digest('base64url').slice(0, 32)
  return `${exp}.${sig}`
}
export function linkOk(negocio_id: string, t: string) {
  const [exp, sig] = String(t || '').split('.')
  if (!negocio_id || !exp || !sig || !SEGREDO()) return false
  if (Number(exp) * 1000 < Date.now()) return false
  const certo = createHmac('sha256', SEGREDO()).update(`${negocio_id}.${exp}`).digest('base64url').slice(0, 32)
  const a = Buffer.from(sig), b = Buffer.from(certo)
  return a.length === b.length && timingSafeEqual(a, b)
}


// 23/11 (teste do Nando com o Instagram da escola): "Error validating verification code. Please make sure your redirect_uri is
// identical to the one you used in the OAuth dialog request". O code que o login do SDK do Facebook devolve (FB.login com
// response_type 'code') às vezes fica amarrado a um redirect_uri: sem ele, a Meta recusa. Tenta, na ordem: sem redirect_uri
// (o jeito do cadastro incorporado), redirect_uri vazio e o endereço da página que fez o login (o navegador manda). Para no 1º
// que der certo; erro que não é de redirect_uri (code vencido, segredo errado) não tenta de novo. Devolve qual jeito funcionou.
export async function trocaCode(code: string, appId: string, segredo: string, paginas: string[] = []) {
  const base = `https://graph.facebook.com/v25.0/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(segredo)}&code=${encodeURIComponent(code)}`
  const daqui = (u: string) => /^https:\/\/(www\.)?carreiranodigital\.com\//.test(u) || /^http:\/\/localhost(:\d+)?\//.test(u)
  const tentativas: (string | null)[] = [null, '', ...[...new Set(paginas.map(p => String(p || '').split('#')[0]).filter(daqui))]]
  let ultimo: any = null
  for (const r of tentativas) {
    const j: any = await fetch(r === null ? base : base + '&redirect_uri=' + encodeURIComponent(r)).then(x => x.json()).catch(() => null)
    if (j?.access_token) return { ok: true as const, token: String(j.access_token), como: r === null ? 'sem_redirect' : r === '' ? 'redirect_vazio' : 'redirect_pagina:' + r.replace(/[?].*$/, '') }
    ultimo = j
    if (!/redirect_uri/i.test(String(j?.error?.message || ''))) break
  }
  return { ok: false as const, erro: String(ultimo?.error?.message || 'sem resposta') }
}
