'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import CalendarioBase, { EventoCalendario } from '@/components/CalendarioBase'
import ModalEvento from '@/components/ModalEvento'
import { supabase } from '@/lib/supabase'

const coresPorTipo: Record<string, string> = {
  reuniao: 'var(--accent)',
  ligacao: 'var(--blue)',
  tarefa: 'var(--green)',
}

export default function AgendaPessoal() {
  const [eventos, setEventos] = useState<EventoCalendario[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [eventoEditando, setEventoEditando] = useState<any>(null)
  const [inicioSugerido, setInicioSugerido] = useState<Date>()
  const [fimSugerido, setFimSugerido] = useState<Date>()

  async function carregar() {
    const { data } = await supabase.from('agenda_eventos').select('*').order('inicio')
    if (data) {
      setEventos(data.map(e => ({
        id: e.id,
        title: e.titulo,
        start: new Date(e.inicio),
        end: new Date(e.fim),
        color: coresPorTipo[e.tipo] || 'var(--accent)',
        resource: e,
      })))
    }
  }

  useEffect(() => { carregar() }, [])

  async function salvar(form: any) {
    if (form.id) {
      await supabase.from('agenda_eventos').update({
        titulo: form.titulo, tipo: form.tipo,
        inicio: form.inicio, fim: form.fim, descricao: form.descricao,
      }).eq('id', form.id)
    } else {
      await supabase.from('agenda_eventos').insert({
        titulo: form.titulo, tipo: form.tipo,
        inicio: form.inicio, fim: form.fim, descricao: form.descricao,
      })
    }
    setModalAberto(false)
    setEventoEditando(null)
    carregar()
  }

  async function excluir(id: string) {
    await supabase.from('agenda_eventos').delete().eq('id', id)
    setModalAberto(false)
    setEventoEditando(null)
    carregar()
  }

  function abrirNovo(inicio: Date, fim: Date) {
    setEventoEditando(null)
    setInicioSugerido(inicio)
    setFimSugerido(fim)
    setModalAberto(true)
  }

  function abrirEditar(evento: EventoCalendario) {
    const r = evento.resource
    function fmt(d: Date) {
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    setEventoEditando({ id: r.id, titulo: r.titulo, tipo: r.tipo, inicio: fmt(new Date(r.inicio)), fim: fmt(new Date(r.fim)), descricao: r.descricao || '' })
    setModalAberto(true)
  }

  return (
    <Layout>
      <div style={{ padding: '24px clamp(12px, 4vw, 40px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Minha Agenda</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Clique em um horário para criar um evento</p>
          </div>
          <button onClick={() => { setEventoEditando(null); setInicioSugerido(new Date()); setFimSugerido(new Date()); setModalAberto(true) }}
            style={{ padding: '10px 20px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            + Novo evento
          </button>
        </div>

        <CalendarioBase eventos={eventos} onSlotSelect={abrirNovo} onEventClick={abrirEditar} />

        <ModalEvento
          aberto={modalAberto}
          evento={eventoEditando}
          inicioSugerido={inicioSugerido}
          fimSugerido={fimSugerido}
          onSalvar={salvar}
          onExcluir={excluir}
          onFechar={() => { setModalAberto(false); setEventoEditando(null) }}
        />
      </div>
    </Layout>
  )
}