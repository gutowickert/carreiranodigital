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
  { value: 'reuniao', label: 'Reunião', cor: '#7c3aed' },
  { value: 'ligacao', label: 'Ligação', cor: '#2563eb' },
  { value: 'tarefa', label: 'Tarefa', cor: '#16a34a' },
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
      <label style={{ fontSize: 12, color: '#9ca3af' }}>{label}</label>
      <input
        type={type}
        value={form[field] as string}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        style={{ background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: 8, padding: '8px 12px', color: '#f4f4f5', fontSize: 14, outline: 'none' }}
      />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: 12, padding: 24, width: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5' }}>{evento?.id ? 'Editar evento' : 'Novo evento'}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {input('titulo', 'text', 'Título')}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#9ca3af' }}>Tipo</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {tipos.map(t => (
              <button key={t.value} onClick={() => setForm(f => ({ ...f, tipo: t.value as any }))}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${form.tipo === t.value ? t.cor : '#3a3a3c'}`, background: form.tipo === t.value ? t.cor + '22' : 'transparent', color: form.tipo === t.value ? t.cor : '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
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
              style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', fontSize: 13, cursor: 'pointer' }}>
              Excluir
            </button>
          )}
          <button onClick={onFechar}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #3a3a3c', background: 'transparent', color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={() => onSalvar(form)}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}