'use client'
// DOCUMENTO em poucos toques: o formulário já vem preenchido com o que o sistema sabe (último
// atendimento, demanda, número de sessões). "Gerar e compartilhar" faz o PDF com nome e CRP dela,
// guarda a cópia no prontuário (exigência do CFP) e abre o Compartilhar do celular.
import { useEffect, useMemo, useState } from 'react'
import { Share2 } from 'lucide-react'
import { useBase } from '../App'
import { Campo, Chips, Topo, useAviso, Vazio } from '../ui'
import type { Paciente } from '@/lib/psi/tipos'
import { MODELOS, textoDoConteudo } from '@/lib/psi/documentos'
import { compartilhar, nomeArquivo, pdfDocumento } from '@/lib/psi/exportar'
import { dataBR, hojeBR } from '@/lib/psi/datas'

const maisMinutos = (h: string, min: number) => {
  const [a, b] = h.split(':').map(Number); const t = a * 60 + b + min
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export default function DocumentoTela({ pacienteId, tipo }: { pacienteId: string; tipo: string }) {
  const { repo, perfil } = useBase()
  const aviso = useAviso()
  const modelo = MODELOS[tipo as keyof typeof MODELOS]
  const [p, setP] = useState<Paciente | null>(null)
  const [v, setV] = useState<Record<string, string>>({ emitido_em: hojeBR(), modo: 'comparecimento' })
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [pac, ats] = await Promise.all([repo.paciente(pacienteId), repo.atendimentosDoPaciente(pacienteId)])
      setP(pac)
      const feitos = ats.filter(a => a.presenca === 'realizado')
      const ultimo = feitos[0]
      const pre: Record<string, string> = {}
      if (ultimo) { pre.data = ultimo.data; if (ultimo.hora) { pre.hora_inicio = ultimo.hora; pre.hora_fim = maisMinutos(ultimo.hora, ultimo.duracao_min || 50) } }
      if (pac?.demanda) pre.demanda = pac.demanda
      if (feitos.length) pre.procedimento = `${pac?.procedimentos ? pac.procedimentos + '\n' : ''}Foram realizados ${feitos.length} atendimento${feitos.length === 1 ? '' : 's'}, entre ${dataBR(feitos[feitos.length - 1].data)} e ${dataBR(feitos[0].data)}.`
      if (pac?.responsavel_nome) pre.acompanhante = ''
      setV(x => ({ ...pre, ...x }))
    })()
  }, [pacienteId, repo])

  const conteudo = useMemo(() => p && modelo ? modelo.montar(v, p, perfil) : null, [p, modelo, v, perfil])
  if (!modelo) return <><Topo titulo="Documento" voltarPara={`#/paciente/${pacienteId}`} /><Vazio>Modelo não encontrado.</Vazio></>
  if (!p) return <><Topo titulo={modelo.titulo} voltarPara={`#/paciente/${pacienteId}`} /><Vazio>Carregando…</Vazio></>

  const faltando = modelo.campos.filter(c => c.obrigatorio && !v[c.chave]?.trim())
  const campos = modelo.campos.filter(c => tipo !== 'declaracao' || (v.modo === 'acompanhamento' ? !['data', 'hora_inicio', 'hora_fim'].includes(c.chave) : c.chave !== 'frequencia'))

  async function gerar() {
    if (!conteudo || !p) return
    if (!perfil.crp) aviso('Dica: preencha o seu CRP em Mais > Meus dados.')
    setGerando(true)
    try {
      const blob = await pdfDocumento(conteudo, perfil)
      const campos = Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'emitido_em'))
      await repo.salvarDocumento({ paciente_id: p.id, tipo: modelo.tipo, titulo: modelo.titulo, campos, texto: textoDoConteudo(conteudo), emitido_em: v.emitido_em })
      await repo.registrar('documento', p.id, modelo.tipo)
      const r = await compartilhar(blob, `${nomeArquivo(modelo.titulo + ' ' + p.nome)}.pdf`, modelo.titulo)
      aviso(r === 'baixado' ? 'PDF baixado. A cópia ficou no prontuário.' : 'Pronto. A cópia ficou no prontuário.')
    } catch (e) { aviso((e as Error).message) }
    setGerando(false)
  }

  return (
    <>
      <Topo titulo={modelo.titulo} voltarPara={`#/paciente/${pacienteId}`} />
      <p className="psi-muted psi-pequeno" style={{ marginTop: -4 }}>{p.nome} · {modelo.explicacao}</p>

      {campos.map(c => (
        <Campo key={c.chave} rotulo={c.rotulo + (c.obrigatorio ? '' : '')} ajuda={c.ajuda}>
          {c.tipo === 'escolha'
            ? <Chips opcoes={(c.opcoes || []).map(([valor, rotulo]) => ({ valor, rotulo }))} valor={v[c.chave]} mudar={x => setV({ ...v, [c.chave]: x })} />
            : c.tipo === 'area'
              ? <textarea className="psi-input" value={v[c.chave] || ''} onChange={e => setV({ ...v, [c.chave]: e.target.value })} />
              : <input className="psi-input" type={c.tipo === 'data' ? 'date' : c.tipo === 'hora' ? 'time' : 'text'} value={v[c.chave] || ''} onChange={e => setV({ ...v, [c.chave]: e.target.value })} />}
        </Campo>
      ))}
      <Campo rotulo="Data do documento"><input className="psi-input" type="date" value={v.emitido_em} onChange={e => setV({ ...v, emitido_em: e.target.value })} /></Campo>

      <div className="psi-secao"><h2>Prévia</h2></div>
      <div className="psi-cartao" style={{ fontSize: 14 }}>
        {conteudo && <>
          <div style={{ textAlign: 'center', fontWeight: 800, color: 'var(--cacau)', letterSpacing: '.04em' }}>{conteudo.titulo.toUpperCase()}</div>
          {conteudo.blocos.map((b, i) => <div key={i} style={{ marginTop: 10 }}>{b.subtitulo && <b>{b.subtitulo}</b>}<div style={{ whiteSpace: 'pre-wrap' }}>{b.texto}</div></div>)}
          <div style={{ textAlign: 'right', marginTop: 12 }}>{perfil.cidade ? `${perfil.cidade}, ` : ''}{dataBR(conteudo.data)}</div>
          <div style={{ textAlign: 'center', marginTop: 16 }}>____________________<br />{perfil.nome}<br />Psicóloga{perfil.crp ? ` — CRP ${perfil.crp}` : ' — CRP (preencha em Meus dados)'}</div>
        </>}
      </div>

      <button className="psi-btn psi-btn-principal psi-btn-bloco" style={{ marginTop: 16 }} disabled={gerando || faltando.length > 0} onClick={gerar}>
        <Share2 size={19} />{gerando ? 'Gerando…' : faltando.length ? `Falta: ${faltando[0].rotulo.toLowerCase()}` : 'Gerar PDF e compartilhar'}
      </button>
    </>
  )
}
