// Seu 2027: depois do pagamento confirmado, gera o mapa (contas + texto da IA), guarda no pedido e manda o link por e-mail.
import { db } from './db'
import { calcular } from './calculos'
import { escreverMapa } from './ia'
import { seu2027 } from './config'

const FOCOS = ['amor', 'trabalho', 'dinheiro', 'emocional', 'familia']
export const focoOk = (f: any) => (FOCOS.includes(String(f)) ? String(f) : null)

// gera o mapa de um pedido pago. Seguro chamar mais de uma vez: só uma geração por vez (trava "gerando" de 3 minutos).
export async function liberar(codigo: string) {
  const p = await db.porCodigo(codigo)
  if (!p || !['pago', 'gerando', 'erro'].includes(p.status)) return p
  if (!p.nascimento) { await db.atualiza(`id=eq.${p.id}`, { status: 'falta_dados' }); return p }
  if (p.status === 'gerando' && p.gerando_desde && Date.now() - Date.parse(p.gerando_desde) < 3 * 60e3) return p
  // trava: só passa quem conseguir trocar o status (evita duas gerações ao mesmo tempo)
  const trava = await db.atualiza(`id=eq.${p.id}&status=eq.${p.status}`, { status: 'gerando', gerando_desde: new Date().toISOString() })
  if (!trava?.length) return p
  try {
    const numeros = calcular(p.nascimento)
    const r = await escreverMapa(p.nome, numeros, p.foco)
    await db.atualiza(`id=eq.${p.id}`, { status: 'pronto', numeros, textos: r.textos, modelo: r.modelo, uso_ia: r.uso, pronto_em: new Date().toISOString(), erro: null })
    // ÁUDIO NARRADO (fica pra depois): com SEU2027_AUDIO=1, gerarAudio() entra aqui e guarda audio_path no pedido
    if (seu2027.audio()) await gerarAudio(p.codigo).catch(() => null)
    if (!p.email_enviado_em) {
      const em = await enviaEmail(p.email, `${p.nome.split(' ')[0]}, o seu mapa de 2027 está pronto`, emailMapa(p.nome, p.codigo))
      if (em.enviado) await db.atualiza(`id=eq.${p.id}`, { email_enviado_em: new Date().toISOString() })
    }
  } catch (e: any) {
    console.error('seu2027/liberar', e)
    await db.atualiza(`id=eq.${p.id}`, { status: 'erro', erro: String(e?.message || e).slice(0, 400) })
  }
  return db.porCodigo(codigo)
}

// gancho do áudio narrado (não implementado em 24/11)
export async function gerarAudio(_codigo: string): Promise<void> { /* depois: texto do mapa -> voz (ElevenLabs) -> storage -> audio_path */ }

// ── e-mail (Resend, a mesma chave do Recado; remetente SEU2027_EMAIL_DE) ──
export function emailMapa(nome: string, codigo: string) {
  return moldura(`${nome.split(' ')[0]}, o seu 2027 chegou`, 'O seu mapa do ano está pronto: o ano pessoal, o arcano que acompanha você, os 12 meses e os meses mais favoráveis. Guarde este e-mail: o botão abre sempre o seu mapa, e lá tem o PDF para baixar.', 'Abrir o meu mapa', seu2027.linkMapa(codigo))
}
export function emailCompletar(nome: string, codigo: string) {
  return moldura('Falta só um dado', `${nome ? nome.split(' ')[0] + ', o' : 'O'} seu pagamento foi confirmado. Para montar o seu mapa de 2027 precisamos da sua data de nascimento. Leva menos de um minuto.`, 'Completar e ver o meu mapa', seu2027.linkMapa(codigo))
}
function moldura(titulo: string, texto: string, botao: string, link: string) {
  return `<div style="background:#f6f1e7;padding:28px 12px;font-family:Georgia,serif"><div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e6dcc8;border-radius:16px;padding:30px 26px;color:#2b2540">
<div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:3px;color:#b08d57">SEU 2027</div>
<h1 style="font-size:26px;font-weight:normal;margin:12px 0 10px">${titulo}</h1>
<p style="font-family:Arial,sans-serif;font-size:16px;line-height:1.55;margin:0 0 22px;color:#3d3654">${texto}</p>
<a href="${link}" style="display:inline-block;background:#2b2540;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:16px;padding:14px 26px;border-radius:999px">${botao}</a>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#6c6480;margin-top:24px">Conteúdo de autoconhecimento e entretenimento.</p>
</div></div>`
}
export async function enviaEmail(para: string, assunto: string, html: string) {
  const chave = process.env.RESEND_API_KEY
  if (!chave || !para) return { enviado: false, motivo: 'e-mail não configurado' }
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.SEU2027_EMAIL_DE || 'Seu 2027 <seu2027@recadoencantando.com.br>', to: [para], subject: assunto, html }) })
    const j: any = await r.json().catch(() => ({}))
    return r.ok ? { enviado: true, id: j.id } : { enviado: false, motivo: 'Resend ' + r.status + ': ' + JSON.stringify(j).slice(0, 160) }
  } catch (e: any) { return { enviado: false, motivo: e.message } }
}
