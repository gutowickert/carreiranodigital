// Maia: a fila da oficina (03/11). O trabalhador (maia-oficina/, com Chrome e ffmpeg, fora da Vercel) pergunta aqui o que fazer.
//   GET  → a próxima tarefa (arte ou vídeo) com tudo que precisa: a peça, a marca do negócio e o link da mídia do dono
//   POST {tarefa_id, caminho} → a oficina já mandou o arquivo direto pro armazenamento (PUT no link "upload" do GET); a peça
//        vai pra revisão da equipe. {tarefa_id, erro} → tenta de novo (até 3)
//   08/11 (T4, passo 5): o modo antigo continua valendo enquanto a oficina antiga existir: {tarefa_id, arquivo_path, mime}
//        (mesmo envio direto, nome antigo do campo) e {tarefa_id, arquivo_b64, mime} (o arquivo junto, até ~4,5 MB na Vercel)
// Chave no cabeçalho x-chave (MAIA_OFICINA_CHAVE).
import { maiaDb as db } from '@/lib/maia/db'
import { oficinaOk, naoAutorizado } from '@/lib/maia/acesso'
import { oficinaEntregou } from '@/lib/maia/pecas'

export const maxDuration = 120

export async function GET(req: Request) {
  if (!oficinaOk(req)) return naoAutorizado()
  // 06/11: a oficina está de pé (a amostra da demonstração vê isso pra avisar a equipe quando ela cair)
  await (await import('@/lib/maia/demo-amostra')).marcaOficinaViva().catch(() => null)
  const fila = (await db.lista('tarefas', { status: 'fila' }, { ordem: 'criado_em' })).filter(t => t.tipo === 'arte' || t.tipo === 'video')
  // tarefa presa (pegou e não devolveu em 20 min) volta pra fila
  const presas = (await db.lista('tarefas', { status: 'rodando' })).filter(t => t.pego_em && Date.now() - Date.parse(t.pego_em) > 20 * 60e3)
  for (const t of presas) await db.atualiza('tarefas', { id: t.id }, { status: 'fila', tentativas: (t.tentativas || 0) + 1 })
  const t = fila[0]
  // 08/11 (teste completo, 8f): sem arte nem vídeo na fila, a oficina (que tem o ffmpeg) tira 3 quadros dos vídeos do dono
  // que ainda não foram descritos. A Vercel não tem ffmpeg; a fala do vídeo já foi transcrita quando ele chegou (dono.ts)
  if (!t) {
    const v = (await db.lista('midias', { tipo: 'video' }, { ordem: 'criado_em', desc: true, limite: 30 }))
      .find(m => !/Quadros:/.test(m.descricao || '') && Date.now() - Date.parse(m.criado_em || 0) < 3 * 86400e3)
    if (!v) return Response.json({ tarefa: null })
    await db.atualiza('midias', { id: v.id }, { descricao: `${v.descricao || 'vídeo'} (Quadros: descrevendo)` })
    return Response.json({ tarefa: null, descrever: { midia_id: v.id, url: await db.link(v.path), mime: v.mime } })
  }
  await db.atualiza('tarefas', { id: t.id }, { status: 'rodando', pego_em: new Date().toISOString() })
  const [peca, neg] = await Promise.all([db.um('pecas', { id: t.peca_id }), db.um('negocios', { id: t.negocio_id })])
  const midia = t.dados?.midia_id ? await db.um('midias', { id: t.dados.midia_id }) : null
  const logo = neg?.marca?.logo_path ? await db.link(neg.marca.logo_path) : null
  // onde a oficina vai deixar o resultado (envio direto pro armazenamento; no modo local não tem e vai em base64)
  const base = `${t.negocio_id}/pecas/${t.peca_id}-${Date.now()}`
  // no modo local o link vem relativo (/api/maia/arquivo?...&envio=): ganha o endereço do sistema
  const comOrigem = (u: string | null) => (u && u.startsWith('/') ? new URL(req.url).origin + u : u)
  const upload = t.tipo === 'video'
    ? { video: { caminho: base + '.mp4', url: comOrigem(await db.linkEnvio(base + '.mp4')) } }
    : { arte: { caminho: base + '.jpg', url: comOrigem(await db.linkEnvio(base + '.jpg')) } }
  return Response.json({
    upload,
    // 08/11 (teste completo): o layout escolhido no lote (8e) e o preço da base em destaque (8d)
    tarefa: { id: t.id, tipo: t.tipo, ajuste: t.dados?.ajuste || null, layout: t.dados?.layout || null, preco: t.dados?.preco || null },
    peca: peca && { id: peca.id, tipo: peca.tipo, gancho: peca.gancho, texto: peca.texto, cta: peca.cta, versao: peca.versao },
    negocio: neg && { id: neg.id, nome: neg.nome, nicho: neg.nicho, cidade: neg.cidade, regiao: neg.regiao, marca: { ...(neg.marca || {}), logo_url: logo }, whatsapp: neg.contexto?.whatsapp_publico || null },
    midia: midia && { id: midia.id, tipo: midia.tipo, mime: midia.mime, url: await db.link(midia.path), legenda: midia.legenda },
  })
}

export async function POST(req: Request) {
  if (!oficinaOk(req)) return naoAutorizado()
  const b = await req.json().catch(() => ({}))
  // 08/11 (8f): os quadros do vídeo do dono que a oficina tirou
  if (b.midia_id && Array.isArray(b.quadros_b64)) {
    const { descreveVideo } = await import('@/lib/maia/dono')
    return Response.json(await descreveVideo(String(b.midia_id), b.quadros_b64.slice(0, 3).map(String), Number(b.duracao) || null))
  }
  const t = await db.um('tarefas', { id: b.tarefa_id })
  if (!t) return Response.json({ erro: 'tarefa não existe' }, { status: 404 })
  if (b.erro) { await oficinaEntregou(t, null, String(b.erro).slice(0, 500)); return Response.json({ ok: true, de_novo: true }) }
  // a oficina já mandou direto pro armazenamento: confere que o caminho é desta tarefa e que o arquivo chegou mesmo
  const caminho = b.caminho || b.arquivo_path
  if (caminho) {
    const c = String(caminho)
    if (!c.startsWith(`${t.negocio_id}/pecas/${t.peca_id}-`) || c.includes('..')) return Response.json({ erro: 'caminho não é desta tarefa' }, { status: 400 })
    if (!(await db.existe(c))) return Response.json({ erro: 'o arquivo não chegou no armazenamento' }, { status: 400 })
    await oficinaEntregou(t, { caminho: c, mime: b.mime || (/\.mp4$/.test(c) ? 'video/mp4' : /\.png$/.test(c) ? 'image/png' : 'image/jpeg') })
    await db.evento('oficina_entrega', t.negocio_id, { tarefa_id: t.id, como: b.caminho ? 'link' : 'link (campo antigo)' })
    return Response.json({ ok: true })
  }
  if (!b.arquivo_b64) return Response.json({ erro: 'sem arquivo' }, { status: 400 })
  await oficinaEntregou(t, { buf: Buffer.from(b.arquivo_b64, 'base64'), mime: b.mime || 'image/png' })
  await db.evento('oficina_entrega', t.negocio_id, { tarefa_id: t.id, como: 'base64 (oficina antiga)' })
  return Response.json({ ok: true })
}
