'use client'
// O PRONTUÁRIO do paciente: cabeçalho com os atalhos (registrar sessão, documento, editar) e quatro
// abas — Evoluções (linha do tempo), Prontuário (o conteúdo mínimo do CFP), Atendimentos e Arquivos.
// Abrir esta tela fica registrado na trilha de auditoria ("ver").
import { useCallback, useEffect, useState } from 'react'
import { FilePlus2, Paperclip, Pencil, Phone, Plus, Share2 } from 'lucide-react'
import { useBase } from '../App'
import { ir, link } from '../rotas'
import { Folha, Pill, Topo, useAviso, Vazio, iniciais } from '../ui'
import type { Anexo, Atendimento, DocumentoEmitido, Evolucao, Paciente } from '@/lib/psi/tipos'
import { ROTULO_DOCUMENTO, ROTULO_EVOLUCAO, ROTULO_STATUS } from '@/lib/psi/tipos'
import { DIAS, dataBR, hora5, idade } from '@/lib/psi/datas'
import { compartilhar, nomeArquivo, pdfDocumento } from '@/lib/psi/exportar'
import { MODELOS } from '@/lib/psi/documentos'

type Aba = 'evolucoes' | 'prontuario' | 'atendimentos' | 'arquivos'

export default function PacienteTela({ id, q }: { id: string; q: URLSearchParams }) {
  const { repo, locais, perfil } = useBase()
  const aviso = useAviso()
  const [p, setP] = useState<Paciente | null | undefined>(undefined)
  const [evos, setEvos] = useState<Evolucao[]>([])
  const [ats, setAts] = useState<Atendimento[]>([])
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [docs, setDocs] = useState<DocumentoEmitido[]>([])
  const [aba, setAba] = useState<Aba>((q.get('aba') as Aba) || 'evolucoes')
  const [folhaDoc, setFolhaDoc] = useState(false)
  const [verApagadas, setVerApagadas] = useState(false)
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    const [pac, e, a, an, d] = await Promise.all([repo.paciente(id), repo.evolucoes(id), repo.atendimentosDoPaciente(id), repo.anexos(id), repo.documentos(id)])
    setP(pac); setEvos(e); setAts(a); setAnexos(an); setDocs(d)
  }, [repo, id])

  useEffect(() => { carregar(); repo.registrar('ver', id) }, [carregar, repo, id])

  if (p === undefined) return <><Topo titulo="Paciente" voltarPara="#/pacientes" /><Vazio>Carregando…</Vazio></>
  if (p === null) return <><Topo titulo="Paciente" voltarPara="#/pacientes" /><Vazio>Paciente não encontrado.</Vazio></>

  const local = locais.find(l => l.id === p.local_id)
  const anos = idade(p.data_nascimento)
  const realizados = ats.filter(a => a.presenca === 'realizado').length
  const faltas = ats.filter(a => a.presenca === 'faltou').length
  const visiveis = evos.filter(e => verApagadas || !e.apagada_em)
  const apagadas = evos.filter(e => e.apagada_em).length

  async function enviarArquivo(f: File | undefined) {
    if (!f || !p) return
    setEnviando(true)
    try { await repo.enviarAnexo(p.id, f); aviso('Arquivo guardado no prontuário.'); await carregar() } catch (e) { aviso((e as Error).message) }
    setEnviando(false)
  }
  async function abrirAnexo(a: Anexo) {
    const url = await repo.linkAnexo(a)
    if (url) window.open(url, '_blank', 'noopener')
    else aviso('Não deu pra abrir o arquivo.')
  }
  async function reenviar(d: DocumentoEmitido) {
    if (!p) return
    const m = MODELOS[d.tipo as 'declaracao' | 'atestado' | 'relatorio']
    if (!m) return
    const blob = await pdfDocumento(m.montar({ ...d.campos, emitido_em: d.emitido_em }, p, perfil), perfil)
    await repo.registrar('compartilhar', p.id, d.tipo)
    await compartilhar(blob, `${nomeArquivo(d.titulo + ' ' + p.nome)}.pdf`, d.titulo)
  }

  return (
    <>
      <Topo titulo={p.nome} voltarPara="#/pacientes" direita={<a className="psi-icone-btn" href={`#/paciente/${p.id}/editar`} aria-label="Editar"><Pencil size={18} /></a>} />

      <div className="psi-cartao">
        <div className="psi-linha">
          <span className="psi-avatar" style={{ background: local?.cor || 'var(--cafe)', width: 52, height: 52, fontSize: 17 }}>{iniciais(p.nome)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{p.nome_social || p.nome}</div>
            <div className="psi-muted psi-pequeno">
              {[local?.nome, anos !== null ? `${anos} anos` : null, ROTULO_STATUS[p.status]].filter(Boolean).join(' · ')}
            </div>
            {p.recorrente && p.dia_semana !== null && p.dia_semana !== undefined && (
              <div className="psi-pequeno" style={{ color: 'var(--cafe)', fontWeight: 700 }}>Toda {DIAS[p.dia_semana]}{p.hora_fixa ? ` às ${hora5(p.hora_fixa)}` : ''}</div>
            )}
          </div>
        </div>
        {(p.responsavel_nome || p.telefone) && (
          <div className="psi-pequeno" style={{ marginTop: 10, display: 'grid', gap: 4 }}>
            {p.responsavel_nome && <div>Responsável: <b>{p.responsavel_nome}</b>{p.responsavel_parentesco ? ` (${p.responsavel_parentesco})` : ''}</div>}
            {(p.responsavel_telefone || p.telefone) && (
              <a href={`tel:${(p.responsavel_telefone || p.telefone || '').replace(/\D/g, '')}`} className="psi-linha" style={{ gap: 6, fontWeight: 700 }}>
                <Phone size={15} /> {p.responsavel_telefone || p.telefone}
              </a>
            )}
          </div>
        )}
        <div className="psi-grade-2" style={{ marginTop: 14 }}>
          <a className="psi-btn psi-btn-principal" href={link('/registrar', { pac: p.id, local: p.local_id })}><Plus size={19} />Sessão</a>
          <button className="psi-btn psi-btn-suave" onClick={() => setFolhaDoc(true)}><FilePlus2 size={19} />Documento</button>
        </div>
      </div>

      <div className="psi-abas" role="tablist">
        {([['evolucoes', 'Evoluções'], ['prontuario', 'Prontuário'], ['atendimentos', `Atendimentos (${realizados})`], ['arquivos', 'Arquivos e documentos']] as [Aba, string][]).map(([k, r]) => (
          <button key={k} role="tab" className="psi-aba" aria-selected={aba === k} onClick={() => setAba(k)}>{r}</button>
        ))}
      </div>

      {aba === 'evolucoes' && (
        <>
          <a className="psi-btn psi-btn-contorno psi-btn-bloco" href={link(`/evolucao/novo`, { pac: p.id })} style={{ marginBottom: 14 }}><Plus size={18} />Nova anotação no prontuário</a>
          {visiveis.length === 0 && <Vazio>Nenhuma evolução ainda.</Vazio>}
          <div className="psi-tl">
            {visiveis.map(e => {
              const l = locais.find(x => x.id === e.local_id)
              const aberta = abertas.has(e.id)
              return (
                <div key={e.id} className={`psi-tl-item${e.apagada_em ? ' psi-apagada' : ''}`} style={{ ['--cor' as string]: l?.cor || 'var(--cafe)' }}>
                  <div className="psi-cartao">
                    <div className="psi-linha" style={{ justifyContent: 'space-between' }}>
                      <b>{dataBR(e.data)}</b>
                      <span className="psi-muted psi-pequeno">{ROTULO_EVOLUCAO[e.tipo].split(' (')[0]}{l ? ` · ${l.nome}` : ''}</span>
                    </div>
                    {e.apagada_em
                      ? <div className="psi-pequeno psi-muted" style={{ marginTop: 6 }}>Apagada em {dataBR(e.apagada_em.slice(0, 10))}. Motivo: {e.apagada_motivo || '—'}</div>
                      : <div className="psi-tl-texto" data-curto={aberta ? '0' : '1'} onClick={() => setAbertas(s => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n })}>{e.texto}</div>}
                    <div className="psi-linha" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                      <span className="psi-muted" style={{ fontSize: 12 }}>{e.versao > 1 ? `editada · versão ${e.versao}` : ''}</span>
                      <a className="psi-pequeno" href={link(`/evolucao/${e.id}`, { pac: p.id })}>{e.apagada_em ? 'Ver histórico' : 'Abrir'}</a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {apagadas > 0 && <button className="psi-btn psi-btn-suave psi-btn-pequeno" onClick={() => setVerApagadas(!verApagadas)}>{verApagadas ? 'Esconder apagadas' : `Mostrar apagadas (${apagadas})`}</button>}
        </>
      )}

      {aba === 'prontuario' && (
        <>
          <div className="psi-cartao">
            <CampoVer r="Identificação" v={[
              p.nome_social ? `Nome social: ${p.nome_social}` : '',
              p.data_nascimento ? `Nascimento: ${dataBR(p.data_nascimento)}${anos !== null ? ` (${anos} anos)` : ''}` : '',
              p.cpf ? `CPF: ${p.cpf}` : '', p.telefone ? `Telefone: ${p.telefone}` : '', p.email ? `E-mail: ${p.email}` : '', p.endereco ? `Endereço: ${p.endereco}` : '',
              p.responsavel_nome ? `Responsável: ${p.responsavel_nome}${p.responsavel_parentesco ? ` (${p.responsavel_parentesco})` : ''}${p.responsavel_telefone ? ` · ${p.responsavel_telefone}` : ''}` : '',
              `Local: ${local?.nome || '—'} · ${p.modalidade === 'online' ? 'on-line' : 'presencial'}`,
              p.data_inicio ? `Início: ${dataBR(p.data_inicio)}` : '',
            ].filter(Boolean).join('\n')} />
            <CampoVer r="Demanda / queixa" v={p.demanda} />
            <CampoVer r="Objetivos do trabalho" v={p.objetivos} />
            <CampoVer r="Histórico" v={p.historico} />
            <CampoVer r="Procedimentos e técnicas" v={p.procedimentos} />
            {(p.status === 'alta' || p.status === 'encerrado' || p.encerramento_texto) && (
              <CampoVer r="Encaminhamento / encerramento" v={[p.encerramento_em ? `Em ${dataBR(p.encerramento_em)}` : '', p.encerramento_motivo, p.encerramento_texto].filter(Boolean).join(' — ')} />
            )}
            {p.observacoes && <CampoVer r="Observações" v={p.observacoes} />}
          </div>
          <a className="psi-btn psi-btn-contorno psi-btn-bloco" style={{ marginTop: 12 }} href={`#/paciente/${p.id}/editar`}><Pencil size={17} />Editar prontuário</a>
        </>
      )}

      {aba === 'atendimentos' && (
        <>
          <div className="psi-numeros" style={{ marginBottom: 12 }}>
            <div className="psi-numero"><b>{realizados}</b><small>realizados</small></div>
            <div className="psi-numero"><b>{faltas}</b><small>faltas</small></div>
            <div className="psi-numero"><b>{ats.length - realizados - faltas}</b><small>outros</small></div>
          </div>
          {ats.length === 0 ? <Vazio>Nenhum atendimento ainda.</Vazio> : (
            <div className="psi-lista">
              {ats.map(a => (
                <a key={a.id} className="psi-item" href={link('/registrar', { at: a.id })}>
                  <span className="psi-item-txt"><strong>{dataBR(a.data)}{a.hora ? ` · ${a.hora}` : ''}</strong><small>{locais.find(l => l.id === a.local_id)?.nome || 'sem local'}</small></span>
                  <Pill p={a.presenca} />
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {aba === 'arquivos' && (
        <>
          <div className="psi-secao"><h2>Documentos emitidos</h2><button className="psi-btn psi-btn-suave psi-btn-pequeno" onClick={() => setFolhaDoc(true)}><Plus size={16} />Novo</button></div>
          {docs.length === 0 ? <div className="psi-cartao psi-muted psi-pequeno">Nenhum documento emitido. Toda declaração, atestado ou relatório gerado aqui fica guardado com a data.</div> : (
            <div className="psi-lista">
              {docs.map(d => (
                <button key={d.id} className="psi-item" onClick={() => reenviar(d)}>
                  <span className="psi-item-txt"><strong>{d.titulo}</strong><small>Emitido em {dataBR(d.emitido_em)}{d.campos.finalidade ? ` · ${d.campos.finalidade}` : ''}</small></span>
                  <Share2 size={18} color="var(--cafe)" />
                </button>
              ))}
            </div>
          )}
          <div className="psi-secao"><h2>Arquivos</h2></div>
          <label className="psi-btn psi-btn-contorno psi-btn-bloco" style={{ marginBottom: 12 }}>
            <Paperclip size={18} />{enviando ? 'Enviando…' : 'Anexar arquivo ou foto'}
            <input type="file" hidden onChange={e => enviarArquivo(e.target.files?.[0])} accept="image/*,application/pdf,.doc,.docx" />
          </label>
          {anexos.length === 0 ? <Vazio>Nenhum arquivo.</Vazio> : (
            <div className="psi-lista">
              {anexos.map(a => (
                <button key={a.id} className="psi-item" onClick={() => abrirAnexo(a)}>
                  <Paperclip size={18} color="var(--cafe)" />
                  <span className="psi-item-txt"><strong>{a.nome}</strong><small>{dataBR(a.criado_em.slice(0, 10))}{a.tamanho ? ` · ${Math.ceil(a.tamanho / 1024)} KB` : ''}</small></span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Folha aberta={folhaDoc} fechar={() => setFolhaDoc(false)} titulo="Gerar documento">
        <div style={{ display: 'grid', gap: 10 }}>
          {(['declaracao', 'atestado', 'relatorio'] as const).map(t => (
            <button key={t} className="psi-cartao" style={{ textAlign: 'left', cursor: 'pointer', margin: 0 }} onClick={() => { setFolhaDoc(false); ir(`#/documento/${p.id}/${t}`) }}>
              <b style={{ color: 'var(--cacau)' }}>{ROTULO_DOCUMENTO[t]}</b>
              <div className="psi-muted psi-pequeno">{MODELOS[t].explicacao}</div>
            </button>
          ))}
        </div>
      </Folha>
    </>
  )
}

function CampoVer({ r, v }: { r: string; v?: string | null }) {
  return <div className="psi-campo-ver"><span>{r}</span><p className={v ? '' : 'psi-muted'}>{v || 'Não preenchido.'}</p></div>
}
