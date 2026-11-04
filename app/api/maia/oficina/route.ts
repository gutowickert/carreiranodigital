// Maia: a fila da oficina (03/11). O trabalhador (maia-oficina/, com Chrome e ffmpeg, fora da Vercel) pergunta aqui o que fazer.
//   GET  → a próxima tarefa (arte ou vídeo) com tudo que precisa: a peça, a marca do negócio e o link da mídia do dono
//   POST {tarefa_id, arquivo_b64, mime} → guarda o resultado; a peça vai pra revisão da equipe.  {tarefa_id, erro} → tenta de novo (até 3)
// Chave no cabeçalho x-chave (MAIA_OFICINA_CHAVE).
import { maiaDb as db } from '@/lib/maia/db'
import { oficinaOk, naoAutorizado } from '@/lib/maia/acesso'
import { oficinaEntregou } from '@/lib/maia/pecas'

export const maxDuration = 120

export async function GET(req: Request) {
  if (!oficinaOk(req)) return naoAutorizado()
  const fila = (await db.lista('tarefas', { status: 'fila' }, { ordem: 'criado_em' })).filter(t => t.tipo === 'arte' || t.tipo === 'video')
  // tarefa presa (pegou e não devolveu em 20 min) volta pra fila
  const presas = (await db.lista('tarefas', { status: 'rodando' })).filter(t => t.pego_em && Date.now() - Date.parse(t.pego_em) > 20 * 60e3)
  for (const t of presas) await db.atualiza('tarefas', { id: t.id }, { status: 'fila', tentativas: (t.tentativas || 0) + 1 })
  const t = fila[0]
  if (!t) return Response.json({ tarefa: null })
  await db.atualiza('tarefas', { id: t.id }, { status: 'rodando', pego_em: new Date().toISOString() })
  const [peca, neg] = await Promise.all([db.um('pecas', { id: t.peca_id }), db.um('negocios', { id: t.negocio_id })])
  const midia = t.dados?.midia_id ? await db.um('midias', { id: t.dados.midia_id }) : null
  const logo = neg?.marca?.logo_path ? await db.link(neg.marca.logo_path) : null
  // onde a oficina vai deixar o resultado (envio direto pro armazenamento; no modo local não tem e vai em base64)
  const base = `${t.negocio_id}/pecas/${t.peca_id}-${Date.now()}`
  const upload = t.tipo === 'video'
    ? { video: { caminho: base + '.mp4', url: await db.linkEnvio(base + '.mp4') } }
    : { arte: { caminho: base + '.jpg', url: await db.linkEnvio(base + '.jpg') } }
  return Response.json({
    upload,
    tarefa: { id: t.id, tipo: t.tipo, ajuste: t.dados?.ajuste || null },
    peca: peca && { id: peca.id, tipo: peca.tipo, gancho: peca.gancho, texto: peca.texto, cta: peca.cta, versao: peca.versao },
    negocio: neg && { id: neg.id, nome: neg.nome, nicho: neg.nicho, cidade: neg.cidade, regiao: neg.regiao, marca: { ...(neg.marca || {}), logo_url: logo }, whatsapp: neg.contexto?.whatsapp_publico || null },
    midia: midia && { id: midia.id, tipo: midia.tipo, mime: midia.mime, url: await db.link(midia.path), legenda: midia.legenda },
  })
}

export async function POST(req: Request) {
  if (!oficinaOk(req)) return naoAutorizado()
  const b = await req.json().catch(() => ({}))
  const t = await db.um('tarefas', { id: b.tarefa_id })
  if (!t) return Response.json({ erro: 'tarefa não existe' }, { status: 404 })
  if (b.erro) { await oficinaEntregou(t, null, String(b.erro).slice(0, 500)); return Response.json({ ok: true, de_novo: true }) }
  // a oficina já mandou direto pro armazenamento: só confere que o caminho é desta tarefa
  if (b.arquivo_path) {
    if (!String(b.arquivo_path).startsWith(`${t.negocio_id}/pecas/${t.peca_id}-`)) return Response.json({ erro: 'caminho não é desta tarefa' }, { status: 400 })
    await oficinaEntregou(t, { caminho: String(b.arquivo_path), mime: b.mime || 'image/jpeg' })
    return Response.json({ ok: true })
  }
  if (!b.arquivo_b64) return Response.json({ erro: 'sem arquivo' }, { status: 400 })
  await oficinaEntregou(t, { buf: Buffer.from(b.arquivo_b64, 'base64'), mime: b.mime || 'image/png' })
  return Response.json({ ok: true })
}
