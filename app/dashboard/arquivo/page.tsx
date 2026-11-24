'use client'

import Link from 'next/link'
import { ARQUIVO } from '@/components/Layout'
import { Archive } from 'lucide-react'

// O ARQUIVO (24/11/2026, menu novo): as telas que saíram do menu porque ninguém usa mais (medido no banco da
// escola de 16 a 23/11 e pela data do último dado de cada uma). Nada foi apagado: a tela abre daqui e pelo
// endereço de sempre. Pra uma voltar ao menu, ela sai da lista ARQUIVO do components/Layout.tsx.
export default function ArquivoPage() {
  return (
    <div style={{ padding: '28px clamp(12px, 4vw, 40px)', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 900 }}>
      <div>
        <h1 className="display relevo-titulo" style={{ fontSize: 28, fontWeight: 600, margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Archive size={24} strokeWidth={1.7} /> Arquivo
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '8px 0 0', maxWidth: '68ch' }}>
          Telas que saíram do menu porque ninguém usa mais. Continuam funcionando e os dados estão todos aqui: nada foi apagado.
          Se alguma fizer falta, pede pra voltar pro menu.
        </p>
      </div>
      <div style={{ border: '1px solid color-mix(in srgb, var(--text) 9%, transparent)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)' }}>
        {ARQUIVO.map((t, i) => (
          <div key={t.href} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderTop: i ? '1px solid color-mix(in srgb, var(--text) 8%, transparent)' : 'none', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{t.nome}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{t.porque}</div>
            </div>
            <Link href={t.href} style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-soft)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Abrir</Link>
          </div>
        ))}
      </div>
    </div>
  )
}
