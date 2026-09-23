'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { modeloDe, type Bloco, type Pergunta } from '@/lib/implantacao-modelo'

// O QUESTIONÁRIO DE IMPLANTAÇÃO, GENÉRICO — a página que o dono da empresa abre pra responder.
//
// Substitui o `public/implantacao/dani.html`, onde as 89 perguntas estavam DENTRO do arquivo: pra
// uma empresa nova era copiar o HTML e reescrever tudo. Aqui as perguntas vêm do molde
// (lib/implantacao-modelo.ts) e o endereço decide de quem é o questionário.
//
// ⚠️ ESTA TELA NÃO USA O TEMA DO PAINEL. Quem abre é um empresário num link que a gente mandou,
// muitas vezes no celular. O painel é escuro e denso, feito pra quem passa o dia dentro dele.
//
// ⚠️ SALVA CAMPO A CAMPO, sozinho. São ~100 perguntas: ninguém responde de uma sentada. Cada
// resposta sobe sozinha e o mesmo link traz de volta de onde parou.
//
// O ÁUDIO é a peça que mais rende: o dono fala em vez de escrever, e o Deepgram transcreve no
// servidor (app/api/implantacao/anexo). Resposta falada é mais longa, mais honesta e mais rápida
// que resposta digitada — foi assim na implantação da Dani.

type Anexo = { path: string; nome: string; mime: string; tipo: string; transcricao?: string | null; url?: string | null }

export default function Questionario() {
  const { slug } = useParams<{ slug: string }>()
  const k = useSearchParams().get('k') || ''
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [R, setR] = useState<Record<string, string>>({})
  const [anexos, setAnexos] = useState<Record<string, Anexo[]>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [gravando, setGravando] = useState<string | null>(null)
  const [subindo, setSubindo] = useState<string | null>(null)
  const blocos = modeloDe(String(slug))
  const timers = useRef<Record<string, any>>({})
  const rec = useRef<{ mr: MediaRecorder; pedacos: Blob[] } | null>(null)

  useEffect(() => {
    if (!k) { setErro('Este link está incompleto — pede o link inteiro pra quem te mandou.'); setCarregando(false); return }
    fetch(`/api/implantacao?slug=${encodeURIComponent(String(slug))}&k=${encodeURIComponent(k)}`)
      .then(r => r.json()).then(j => {
        setCarregando(false)
        if (!j?.ok) { setErro('Link inválido ou expirado.'); return }
        setNome(j.nome || '')
        const v: Record<string, string> = {}
        for (const r of j.respostas || []) if (!r.campo.endsWith('__anexos')) v[r.campo] = r.valor
        setR(v)
      }).catch(() => { setCarregando(false); setErro('Não consegui abrir agora.') })
    fetch(`/api/implantacao/anexo?slug=${encodeURIComponent(String(slug))}&k=${encodeURIComponent(k)}`)
      .then(r => r.json()).then(j => { if (j?.ok) setAnexos(j.anexos || {}) }).catch(() => {})
  }, [slug, k])

  // guarda uma resposta. Espera 900ms de silêncio pra não mandar a cada tecla.
  function guardar(campo: string, valor: string, meta: any, jaVai = false) {
    setR(x => ({ ...x, [campo]: valor }))
    clearTimeout(timers.current[campo])
    const manda = async () => {
      setSalvando(campo)
      await fetch('/api/implantacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, k, campo, valor, meta }),
      }).catch(() => {})
      setSalvando(s => s === campo ? null : s)
    }
    if (jaVai) manda(); else timers.current[campo] = setTimeout(manda, 900)
  }

  // ───────────────────────────────────────────────────────────── áudio
  async function gravar(campo: string) {
    if (gravando === campo) {
      rec.current?.mr.stop()
      return
    }
    if (rec.current) { rec.current.mr.stop(); return }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(fluxo)
      const pedacos: Blob[] = []
      mr.ondataavailable = e => { if (e.data.size) pedacos.push(e.data) }
      mr.onstop = async () => {
        fluxo.getTracks().forEach(t => t.stop())
        rec.current = null; setGravando(null)
        const blob = new Blob(pedacos, { type: mr.mimeType || 'audio/webm' })
        if (blob.size > 1000) await subir(campo, blob, `audio-${Date.now()}.${(mr.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm'}`)
      }
      rec.current = { mr, pedacos }
      mr.start(); setGravando(campo)
    } catch {
      setErro('Não consegui usar o microfone. Libera nas permissões do navegador, ou digita a resposta.')
      setTimeout(() => setErro(''), 7000)
    }
  }

  // sobe direto pro balde com URL assinada (não passa pelo limite de corpo da função) e confirma,
  // que é quando o áudio vira texto
  async function subir(campo: string, arquivo: Blob, nomeArq: string) {
    setSubindo(campo)
    try {
      const prep = await fetch('/api/implantacao/anexo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, k, campo, acao: 'preparar', nome: nomeArq, mime: arquivo.type || 'application/octet-stream', tamanho: arquivo.size }),
      }).then(r => r.json())
      if (!prep?.ok) throw new Error(prep?.error || 'falhou')
      const env = await fetch(prep.url, { method: 'PUT', body: arquivo, headers: { 'Content-Type': arquivo.type || 'application/octet-stream' } })
      if (!env.ok) throw new Error('não subiu')
      const conf = await fetch('/api/implantacao/anexo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, k, campo, acao: 'confirmar', path: prep.path, nome: nomeArq, mime: arquivo.type, tamanho: arquivo.size }),
      }).then(r => r.json())
      if (conf?.ok) setAnexos(a => ({ ...a, [campo]: conf.anexos }))
    } catch {
      setErro('Não consegui enviar o arquivo. Tenta de novo, ou manda por WhatsApp.')
      setTimeout(() => setErro(''), 7000)
    }
    setSubindo(null)
  }

  async function remover(campo: string, path: string) {
    const j = await fetch('/api/implantacao/anexo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, k, campo, acao: 'remover', path }),
    }).then(r => r.json()).catch(() => null)
    if (j?.ok) setAnexos(a => ({ ...a, [campo]: j.anexos }))
  }

  const todas = blocos.flatMap(b => b.perguntas)
  const respondida = (q: Pergunta) => {
    const v = R[q.id] || (q.tipo === 'valida' ? R[q.id + '__status'] : '')
    return !!(v && String(v).trim()) || (anexos[q.id]?.length || 0) > 0
  }
  const feitas = todas.filter(respondida).length

  if (carregando) return <Moldura><p style={txt}>Abrindo…</p></Moldura>
  if (erro && !todas.length) return <Moldura><h1 style={disp}>Ops</h1><p style={txt}>{erro}</p></Moldura>

  return (
    <Moldura>
      <div style={{ padding: '10px 0 4px' }}>
        <div style={marca}>Implantação do CRM</div>
        <h1 style={disp}>{nome ? `Conhecendo a ${nome.split(' ')[0]}` : 'Conhecendo teu negócio'}</h1>
        <p style={txt}>
          Antes de montar o CRM, a gente precisa entender como a tua empresa vende de verdade — com as
          tuas palavras. É isto que faz o sistema já nascer com a cara do teu negócio, e a IA falar
          como vocês falam.
        </p>
        <p style={txt}>Não tem resposta errada. Onde estiver em dúvida, escreve o que acontece hoje, mesmo que seja bagunçado.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {['salva sozinho', 'pode responder falando', 'volta por este mesmo link'].map(f => <span key={f} style={chip}>{f}</span>)}
        </div>
        <div style={{ ...cartao, marginTop: 16, borderColor: '#cfc8e3' }}>
          <b style={{ color: '#17122a' }}>Uma parte já vem montada.</b> Onde tiver um bloco roxo, é uma proposta
          nossa a partir do que já sabemos do teu negócio — tu só marca <b>Aprovado</b>, <b>Ajustar</b> ou
          <b> Tirar</b>. É mais rápido que responder do zero, e o que tu mudar vira informação de verdade.
        </div>
      </div>

      {erro && <div style={{ ...cartao, borderColor: '#b91c1c', color: '#b91c1c' }}>{erro}</div>}

      {blocos.map((b, i) => (
        <div key={b.id} style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={numero}>{i + 1}</span>
            <h2 style={{ ...disp, fontSize: 21, margin: 0 }}>{b.titulo}</h2>
          </div>
          <p style={{ ...txt, fontSize: 14, color: '#6e6885', margin: '4px 0 12px' }}>{b.intro}</p>
          {b.perguntas.map(q => (
            <Campo key={q.id} q={q} R={R} anexos={anexos[q.id] || []} salvando={salvando === q.id}
              gravando={gravando === q.id} subindo={subindo === q.id}
              onGuardar={guardar} onGravar={() => gravar(q.id)} onArquivo={f => subir(q.id, f, f.name)} onRemover={p => remover(q.id, p)} />
          ))}
        </div>
      ))}

      <div style={{ ...cartao, marginTop: 28, textAlign: 'center' }}>
        <h2 style={{ ...disp, fontSize: 20 }}>{feitas} de {todas.length} respondidas</h2>
        <p style={{ ...txt, fontSize: 14 }}>
          Tudo o que tu escreveu já está salvo — não tem botão de enviar. Pode fechar e voltar por este
          mesmo link quando quiser.
        </p>
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: '#9891ad', margin: '16px 0 0' }}>
        CarreiraNoDigital · o que tu responder aqui é usado só pra montar o teu sistema
      </p>
    </Moldura>
  )
}

/* ─────────────────────────────────────────────────────────────────── um campo */

function Campo({ q, R, anexos, salvando, gravando, subindo, onGuardar, onGravar, onArquivo, onRemover }: {
  q: Pergunta; R: Record<string, string>; anexos: Anexo[]; salvando: boolean; gravando: boolean; subindo: boolean
  onGuardar: (campo: string, valor: string, meta: any, ja?: boolean) => void
  onGravar: () => void; onArquivo: (f: File) => void; onRemover: (path: string) => void
}) {
  const meta = { tipo: q.tipo || 'longo', pergunta: q.p, entra_em: q.entra || '' }
  const v = R[q.id] || ''
  const valida = q.tipo === 'valida'
  const st = R[q.id + '__status'] || ''

  return (
    <div style={{ ...cartao, marginBottom: 10, ...(valida ? { borderLeft: '4px solid #6d28d9' } : {}) }}>
      {q.tipo !== 'teste' && <div style={{ fontSize: 15.5, fontWeight: 700, color: '#17122a', lineHeight: 1.4 }}>{q.p}{q.req && <span style={{ color: '#6d28d9' }}> ✱</span>}</div>}
      {q.porque && <p style={{ fontSize: 13, color: '#6e6885', margin: '4px 0 0', lineHeight: 1.5 }}>{q.porque}</p>}

      {valida && (q.toques
        ? <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {q.toques.map((t, n) => (
              <li key={n} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 10, fontSize: 14, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 800, color: '#5b21b6' }}>{t.quando}</span>
                <span style={{ color: '#3d3654' }}>{t.acao}{t.marca && <span style={{ fontSize: 11, color: '#9891ad', marginLeft: 6 }}>{t.marca === 'tpl' ? 'mensagem aprovada pela Meta' : 'tarefa pra uma pessoa'}</span>}</span>
              </li>
            ))}
          </ul>
        : <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 10, background: '#ede7fb', fontSize: 14.5, color: '#17122a' }} dangerouslySetInnerHTML={{ __html: q.prop || '' }} />)}

      {q.tipo === 'teste' && <div style={{ marginTop: 2, padding: '12px 14px', borderRadius: '14px 14px 14px 4px', background: '#d6f5e0', fontSize: 15, fontWeight: 600, color: '#17122a', maxWidth: '85%' }}>{q.p}</div>}

      <div style={{ marginTop: 10 }}>
        {valida ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['ok', 'Aprovado'], ['ajustar', 'Ajustar'], ['tirar', 'Tirar']].map(([kk, rot]) => (
                <button key={kk} type="button" onClick={() => onGuardar(q.id + '__status', kk, meta, true)}
                  style={{ ...opcao, ...(st === kk ? escolhida(kk) : {}) }}>{rot}</button>
              ))}
            </div>
            <textarea value={v} onChange={e => onGuardar(q.id, e.target.value, meta)} placeholder={st === 'ok' ? 'algum comentário? (opcional)' : 'o que muda?'}
              style={{ ...campo, minHeight: 58, marginTop: 8 }} />
          </>
        ) : q.tipo === 'escolha' || q.tipo === 'multi' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(q.o || []).map(o => {
              const sel = q.tipo === 'multi' ? (v || '').split(' · ').includes(o) : v === o
              return (
                <button key={o} type="button" style={{ ...opcao, ...(sel ? escolhida('ok2') : {}) }}
                  onClick={() => {
                    if (q.tipo !== 'multi') { onGuardar(q.id, o, meta, true); return }
                    const atual = (v || '').split(' · ').filter(Boolean)
                    const nova = atual.includes(o) ? atual.filter(x => x !== o) : [...atual, o]
                    onGuardar(q.id, nova.join(' · '), meta, true)
                  }}>{sel ? '✓ ' : ''}{o}</button>
              )
            })}
          </div>
        ) : q.tipo === 'texto' ? (
          <input value={v} onChange={e => onGuardar(q.id, e.target.value, meta)} placeholder={q.ph || ''} style={campo} />
        ) : (
          <textarea value={v} onChange={e => onGuardar(q.id, e.target.value, meta)} placeholder={q.ph || ''} style={{ ...campo, minHeight: 92 }} />
        )}
      </div>

      {q.tipo !== 'escolha' && q.tipo !== 'multi' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 9 }}>
          <button type="button" onClick={onGravar} style={{ ...botaoMini, ...(gravando ? { background: '#fde4e4', color: '#b91c1c', borderColor: '#b91c1c' } : {}) }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: gravando ? '#b91c1c' : '#5b21b6', display: 'inline-block' }} />
            {gravando ? 'Gravando… toca pra parar' : 'Responder falando'}
          </button>
          <label style={{ ...botaoMini, cursor: 'pointer' }}>
            <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onArquivo(f); e.currentTarget.value = '' }} />
            Anexar arquivo
          </label>
          {subindo && <span style={{ fontSize: 12.5, color: '#6e6885' }}>enviando…</span>}
          {salvando && <span style={{ fontSize: 12.5, color: '#15803d' }}>salvo ✓</span>}
        </div>
      )}

      {anexos.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {anexos.map(a => (
            <div key={a.path} style={{ background: '#f1eef8', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#3d3654', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.tipo === 'audio' ? '🎤' : a.tipo === 'imagem' ? '🖼️' : '📄'} {a.nome}
                </span>
                <button type="button" onClick={() => onRemover(a.path)} style={{ background: 'none', border: 'none', color: '#9891ad', cursor: 'pointer', fontSize: 16 }} aria-label="Remover">×</button>
              </div>
              {a.tipo === 'audio' && a.url && <audio controls src={a.url} style={{ width: '100%', height: 34, marginTop: 6 }} />}
              {a.transcricao && <p style={{ fontSize: 13.5, color: '#3d3654', margin: '8px 0 0', lineHeight: 1.55, fontStyle: 'italic' }}>&ldquo;{a.transcricao}&rdquo;</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── as peças */

const cartao: React.CSSProperties = { background: '#fff', border: '1px solid #e4dff0', borderRadius: 14, padding: '16px 18px', fontSize: 14.5, color: '#3d3654', lineHeight: 1.6 }
const disp: React.CSSProperties = { fontFamily: 'var(--f-bricolage), var(--f-manrope), sans-serif', fontSize: 'clamp(1.7rem,5.5vw,2.4rem)', fontWeight: 800, color: '#17122a', margin: '10px 0 8px', lineHeight: 1.08, letterSpacing: '-.02em' }
const txt: React.CSSProperties = { fontSize: 15.5, color: '#3d3654', lineHeight: 1.6, margin: '0 0 10px', maxWidth: '62ch' }
const marca: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#6d28d9' }
const chip: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: '#3d3654', background: '#fff', border: '1px solid #e4dff0', borderRadius: 999, padding: '6px 12px' }
const numero: React.CSSProperties = { fontFamily: 'var(--f-bricolage), var(--f-manrope), sans-serif', fontSize: 13, fontWeight: 800, color: '#5b21b6', background: '#ede7fb', borderRadius: 8, padding: '3px 9px' }
const campo: React.CSSProperties = { width: '100%', font: 'inherit', fontSize: 15.5, color: '#17122a', background: '#f6f4fb', border: '1.5px solid #e4dff0', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', lineHeight: 1.5 }
const opcao: React.CSSProperties = { border: '1.5px solid #cfc8e3', background: '#fff', color: '#3d3654', borderRadius: 999, padding: '9px 15px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', font: 'inherit', textAlign: 'left' }
const botaoMini: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, border: '1.5px solid transparent', background: '#ede7fb', color: '#5b21b6', borderRadius: 999, padding: '8px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', font: 'inherit' }
const escolhida = (k: string): React.CSSProperties =>
  k === 'ok' ? { background: '#d6f5e0', borderColor: '#15803d', color: '#15803d', fontWeight: 800 }
    : k === 'ajustar' ? { background: '#fdeecb', borderColor: '#b45309', color: '#b45309', fontWeight: 800 }
      : k === 'tirar' ? { background: '#fde4e4', borderColor: '#b91c1c', color: '#b91c1c', fontWeight: 800 }
        : { background: '#ede7fb', borderColor: '#6d28d9', color: '#5b21b6', fontWeight: 800 }

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#f6f4fb', padding: '24px 16px 70px', fontFamily: 'var(--f-manrope), system-ui, sans-serif' }}>
      {/* o painel é escuro por padrão (html,body no globals.css); aqui é tela de cliente */}
      <style>{`html, body { background: #f6f4fb !important; color: #17122a; color-scheme: light; }`}</style>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(135deg, #7c3aed, #c026d3)', zIndex: 2 }} />
      <div style={{ maxWidth: 700, margin: '0 auto' }}>{children}</div>
    </div>
  )
}
