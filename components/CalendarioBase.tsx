'use client'

import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useState } from 'react'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'pt-BR': ptBR },
})

export interface EventoCalendario {
  id: string
  title: string
  start: Date
  end: Date
  color?: string
  resource?: any
}

interface Props {
  eventos: EventoCalendario[]
  onSlotSelect?: (inicio: Date, fim: Date) => void
  onEventClick?: (evento: EventoCalendario) => void
}

export default function CalendarioBase({ eventos, onSlotSelect, onEventClick }: Props) {
  const [view, setView] = useState<View>('week')
  const [date, setDate] = useState(new Date())

  return (
    <div style={{ height: '100%' }}>
      <style>{`
        .rbc-calendar { background: var(--bg); color: var(--text); font-family: inherit; }
        .rbc-toolbar { padding: 12px 0 16px; gap: 8px; flex-wrap: wrap; }
        .rbc-toolbar button { background: var(--surface); color: var(--text-muted); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
        .rbc-toolbar button:hover { background: var(--surface-2); color: var(--text); }
        .rbc-toolbar button.rbc-active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
        .rbc-toolbar-label { color: var(--text); font-size: 15px; font-weight: 500; }
        .rbc-header { background: var(--surface); color: var(--text-muted); border-color: var(--border); padding: 8px 0; font-size: 12px; font-weight: 500; }
        .rbc-month-view, .rbc-time-view { border-color: var(--border); }
        .rbc-day-bg { background: var(--bg); }
        .rbc-day-bg.rbc-today { background: var(--accent-bg); }
        .rbc-off-range-bg { background: var(--bg); }
        .rbc-date-cell { color: var(--text-muted); font-size: 12px; padding: 4px 8px; }
        .rbc-date-cell.rbc-now { color: var(--accent-soft); font-weight: 600; }
        .rbc-month-row { border-color: var(--border); }
        .rbc-day-slot .rbc-time-slot { border-color: var(--surface); }
        .rbc-timeslot-group { border-color: var(--border); }
        .rbc-time-content { border-color: var(--border); }
        .rbc-time-header { border-color: var(--border); }
        .rbc-time-header-content { border-color: var(--border); }
        .rbc-time-gutter .rbc-timeslot-group { border-color: var(--border); }
        .rbc-label { color: var(--text-faint); font-size: 11px; }
        .rbc-current-time-indicator { background: var(--accent); }
        .rbc-selected-cell { background: var(--accent-bg) !important; }
        .rbc-slot-selection { background: var(--accent-bg); border: 1px solid var(--accent); color: var(--accent-soft); font-size: 12px; }
        .rbc-show-more { color: var(--accent-soft); font-size: 11px; background: transparent; }
        .rbc-event:focus { outline: none; }
        .rbc-event { border: none !important; }
      `}</style>
      <Calendar
        localizer={localizer}
        events={eventos}
        view={view}
        date={date}
        onView={setView}
        onNavigate={setDate}
        culture="pt-BR"
        style={{ height: 620 }}
        messages={{
          today: 'Hoje',
          previous: '‹',
          next: '›',
          month: 'Mês',
          week: 'Semana',
          day: 'Dia',
          agenda: 'Agenda',
          date: 'Data',
          time: 'Hora',
          event: 'Evento',
          noEventsInRange: 'Nenhum evento neste período.',
          showMore: (total) => `+${total} mais`,
        }}
        selectable
        onSelectSlot={(slot) => onSlotSelect?.(slot.start, slot.end)}
        onSelectEvent={(evento) => onEventClick?.(evento as EventoCalendario)}
        eventPropGetter={(evento) => ({
          style: {
            backgroundColor: (evento as EventoCalendario).color || 'var(--accent)',
            borderRadius: '6px',
            padding: '2px 6px',
            fontSize: '12px',
            color: 'var(--on-accent)',
          },
        })}
        dayPropGetter={(date) => ({
          style: { borderColor: 'var(--border)' },
        })}
      />
    </div>
  )
}