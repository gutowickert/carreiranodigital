'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { hojeBR } from '@/lib/periodos'
import { lerTudo } from '@/lib/ler-tudo'
import { Card, Botao, Campo, CabecalhoPagina, CardNumero, Vazio } from '@/components/ui'

// NOTA FISCAL (07/10/2026, pedido do Rick) — ETAPA 1: só leitura.
// Lista as vendas (matriculas) do mês com os dados que a nota precisa e avisa o que falta (CPF, e-mail).
// Hoje as notas saem pela HeroSpark → eNotas. Etapa 2 (com o Guto): botão "Gerar nota" por venda, chamando
// a eNotas, com tabela própria pra situação da nota. NADA é gerado sozinho: quem decide é o time, venda a venda.
// A data de ativação fica em aberto: quando a emissão da HeroSpark for desligada, ativa-se aqui (senão a
// mesma venda ganha nota duas vezes).

type Venda = {
  id: string; data_compra: string; valor_pago: number; forma_pagamento: string | null; parcelas: number | null; status: string | null
  alunos: { nome: string | null; cpf: string | null; email: string | null } | null
  turmas: { produtos: { nome: string } | null; cidades: { nome: string } | null } | null
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBR = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const nomeMes = (mes: string) => new Date(mes + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const andarMes = (mes: string, n: number) => {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1, 12)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const FORMA: Record<string, string> = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão', dinheiro: 'Dinheiro' }
const um = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] : x) ?? null

// o que falta pra nota sair: CPF (11 dígitos) ou CNPJ (14), e um e-mail de verdade (o sistema inventa
// "@semEmail.com" quando a venda chega sem e-mail)
function pendencias(v: Venda) {
  const p: string[] = []
  const doc = (v.alunos?.cpf || '').replace(/\D/g, '')
  if (!doc) p.push('Falta CPF')
  else if (doc.length !== 11 && doc.length !== 14) p.push('CPF incompleto')
  const email = (v.alunos?.email || '').trim().toLowerCase()
  if (!email || !email.includes('@') || email.endsWith('@sememail.com')) p.push('Falta e-mail')
  return p
}

export default function NotasFiscais() {
  const [mes, setMes] = useState(hojeBR().slice(0, 7))
  const [vendas, setVendas] = useState<Venda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    async function carregar() {
      setCarregando(true); setErro('')
      // até o 1º dia do mês seguinte (exclusivo): data_compra pode vir com hora
      const ate = andarMes(mes, 1) + '-01'
      let falhou = false
      const linhas = await lerTudo<any>((de, a) => supabase.from('matriculas')
        .select('id, data_compra, valor_pago, forma_pagamento, parcelas, status, alunos(nome, cpf, email), turmas(produtos(nome), cidades(nome))')
        .gte('data_compra', mes + '-01').lt('data_compra', ate)
        .order('data_compra').order('id').range(de, a)
        .then(r => { if (r.error) falhou = true; return r }))
      if (!ativo) return
      if (falhou) { setErro('Não foi possível carregar as vendas. Avise o Guto.'); setVendas([]); setCarregando(false); return }
      setVendas(linhas.map(l => ({
        ...l, valor_pago: Number(l.valor_pago) || 0,
        alunos: um(l.alunos),
        turmas: l.turmas ? { produtos: um(um(l.turmas)?.produtos), cidades: um(um(l.turmas)?.cidades) } : null,
      })))
      setCarregando(false)
    }
    carregar()
    return () => { ativo = false }
  }, [mes])

  const prontas = vendas.filter(v => pendencias(v).length === 0)
  const comPendencia = vendas.length - prontas.length
  const total = vendas.reduce((s, v) => s + v.valor_pago, 0)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <CabecalhoPagina titulo="Nota Fiscal" sub="Vendas do mês e o que falta em cada uma para emitir a nota." />

      <Card style={{ marginBottom: 16, borderColor: 'var(--amber)', background: 'var(--amber-bg)', fontSize: 13.5, color: 'var(--text)' }}>
        <strong>Emissão ainda não ativada.</strong> As notas continuam saindo pela HeroSpark. Esta tela serve para conferir e completar os cadastros antes da virada.
      </Card>

      <Card style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <Campo rotulo="Mês">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Botao icone={ChevronLeft} onClick={() => setMes(m => andarMes(m, -1))} aria-label="Mês anterior" />
            <span style={{ minWidth: 150, textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{nomeMes(mes)}</span>
            <Botao icone={ChevronRight} onClick={() => setMes(m => andarMes(m, 1))} aria-label="Próximo mês" />
          </div>
        </Campo>
      </Card>

      {erro ? <Card><Vazio titulo={erro} /></Card>
        : carregando ? <div style={{ color: 'var(--text-faint)', padding: 30 }}>Carregando…</div>
          : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                <CardNumero rotulo="Vendas no mês" valor={vendas.length} rodape={brl(total)} />
                <CardNumero rotulo="Prontas pra nota" valor={prontas.length} rodape={brl(prontas.reduce((s, v) => s + v.valor_pago, 0))} />
                <CardNumero rotulo="Falta dado" valor={comPendencia} rodape="complete o cadastro do aluno" alerta={comPendencia > 0} />
                <CardNumero rotulo="Total vendido" prefixo="R$" valor={numero(total)} destaque />
              </div>

              {vendas.length === 0
                ? <Card><Vazio icone={FileText} titulo="Nenhuma venda neste mês" /></Card>
                : (
                  <Card pad={8} style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          {['Data', 'Aluno', 'CPF', 'E-mail', 'Curso / cidade', 'Forma', 'Valor', 'Situação'].map((h, i) => (
                            <th key={h} style={{ textAlign: i === 6 ? 'right' : 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {vendas.map(v => {
                          const pend = pendencias(v)
                          const email = v.alunos?.email || ''
                          const emailFalso = email.toLowerCase().endsWith('@sememail.com')
                          const curso = [v.turmas?.produtos?.nome, v.turmas?.cidades?.nome].filter(Boolean).join(' · ')
                          return (
                            <tr key={v.id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '9px 10px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{dataBR(v.data_compra)}</td>
                              <td style={{ padding: '9px 10px', color: 'var(--text)', fontWeight: 600 }}>
                                {v.alunos?.nome || 'Sem nome'}
                                {v.status && v.status !== 'ativa' && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text-muted)', fontWeight: 500 }}>{v.status}</span>}
                              </td>
                              <td style={{ padding: '9px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{v.alunos?.cpf || '—'}</td>
                              <td style={{ padding: '9px 10px', color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email && !emailFalso ? email : '—'}</td>
                              <td style={{ padding: '9px 10px', color: 'var(--text-muted)' }}>{curso || '—'}</td>
                              <td style={{ padding: '9px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {FORMA[v.forma_pagamento || ''] || v.forma_pagamento || '—'}{(v.parcelas || 1) > 1 ? ` ${v.parcelas}x` : ''}
                              </td>
                              <td style={{ padding: '9px 10px', color: 'var(--text)', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{brl(v.valor_pago)}</td>
                              <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                                {pend.length === 0
                                  ? <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 600 }}>Pronta pra nota</span>
                                  : pend.map(p => <span key={p} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'var(--amber-bg)', color: 'var(--amber)', fontWeight: 600, marginRight: 4 }}>{p}</span>)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </Card>
                )}
            </>
          )}
    </div>
  )
}
