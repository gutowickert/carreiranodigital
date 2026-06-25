'use client'

import { useState, useEffect } from 'react'

interface Evento {
  id?: string
  titulo: string
  tipo: 'reuniao' | 'ligacao' | 'tarefa'
  inicio: string
  fim: string
  descricao?: string
}

interface Props {
  aberto: boolean
  evento?: Evento | null
  inicioSugerido?: Date
  fimSugerido?: Date
  onSalvar: (evento: Evento) => void
  onExcluir?: (id: string) => void
  onFechar: () => void
}

const tipos = [
  { value: 'reuniao', label: 'Reunião', cor: 'var(--accent)' },
  { value: 'ligacao', label: 'Ligação', cor: 'var(--blue)' },
  { value: 'tarefa', label: 'Tarefa', cor: 'var(--green)' },
]

function toInputDatetime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function ModalEvento({ aberto, evento, inicioSugerido, fimSugerido, onSalvar, onExcluir, onFechar }: Props) {
  const [form, setForm] = useState<Evento>({ titulo: '', tipo: 'reuniao', inicio: '', fim: '', descricao: '' })

  useEffect(() => {
    if (evento) {
      setForm(evento)
    } else {
      setForm({
        titulo: '',
        tipo: 'reuniao',
        inicio: inicioSugerido ? toInputDatetime(inicioSugerido) : '',
        fim: fimSugerido ? toInputDatetime(fimSugerido) : '',
        descricao: '',
      })
    }
  }, [evento, inicioSugerido, fimSugerido, aberto])

  if (!aberto) return null

  const input = (field: keyof Evento, type = 'text', label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</label>
      <input
        type={type}
        value={form[field] as string}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 14, outline: 'none' }}
      />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{evento?.id ? 'Editar evento' : 'Novo evento'}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {input('titulo', 'text', 'Título')}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tipo</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {tipos.map(t => (
              <button key={t.value} onClick={() => setForm(f => ({ ...f, tipo: t.value as any }))}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${form.tipo === t.value ? t.cor : 'var(--border)'}`, background: form.tipo === t.value ? 'var(--surface-sel)' : 'transparent', color: form.tipo === t.value ? t.cor : 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {input('inicio', 'datetime-local', 'Início')}
          {input('fim', 'datetime-local', 'Fim')}
        </div>

        {input('descricao', 'text', 'Descrição (opcional)')}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {evento?.id && onExcluir && (
            <button onClick={() => onExcluir(evento.id!)}
              style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontSize: 13, cursor: 'pointer' }}>
              Excluir
            </button>
          )}
          <button onClick={onFechar}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={() => onSalvar(form)}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}