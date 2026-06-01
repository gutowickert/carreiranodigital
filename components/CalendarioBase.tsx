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
        .rbc-calendar { background: #1c1c1e; color: #f4f4f5; font-family: inherit; }
        .rbc-toolbar { padding: 12px 0 16px; gap: 8px; flex-wrap: wrap; }
        .rbc-toolbar button { background: #2c2c2e; color: #9ca3af; border: 1px solid #3a3a3c; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
        .rbc-toolbar button:hover { background: #3a3a3c; color: #fff; }
        .rbc-toolbar button.rbc-active { background: #7c3aed; color: #fff; border-color: #7c3aed; }
        .rbc-toolbar-label { color: #f4f4f5; font-size: 15px; font-weight: 500; }
        .rbc-header { background: #2c2c2e; color: #9ca3af; border-color: #3a3a3c; padding: 8px 0; font-size: 12px; font-weight: 500; }
        .rbc-month-view, .rbc-time-view { border-color: #3a3a3c; }
        .rbc-day-bg { background: #1c1c1e; }
        .rbc-day-bg.rbc-today { background: #2a1f4a; }
        .rbc-off-range-bg { background: #161618; }
        .rbc-date-cell { color: #9ca3af; font-size: 12px; padding: 4px 8px; }
        .rbc-date-cell.rbc-now { color: #a78bfa; font-weight: 600; }
        .rbc-month-row { border-color: #3a3a3c; }
        .rbc-day-slot .rbc-time-slot { border-color: #2c2c2e; }
        .rbc-timeslot-group { border-color: #3a3a3c; }
        .rbc-time-content { border-color: #3a3a3c; }
        .rbc-time-header { border-color: #3a3a3c; }
        .rbc-time-header-content { border-color: #3a3a3c; }
        .rbc-time-gutter .rbc-timeslot-group { border-color: #3a3a3c; }
        .rbc-label { color: #6b7280; font-size: 11px; }
        .rbc-current-time-indicator { background: #7c3aed; }
        .rbc-selected-cell { background: #2d1f4a !important; }
        .rbc-slot-selection { background: #2d1f4a; border: 1px solid #7c3aed; color: #a78bfa; font-size: 12px; }
        .rbc-show-more { color: #a78bfa; font-size: 11px; background: transparent; }
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
            backgroundColor: (evento as EventoCalendario).color || '#7c3aed',
            borderRadius: '6px',
            padding: '2px 6px',
            fontSize: '12px',
            color: '#fff',
          },
        })}
        dayPropGetter={(date) => ({
          style: { borderColor: '#3a3a3c' },
        })}
      />
    </div>
  )
}