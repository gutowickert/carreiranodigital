import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Importa contatos frios (interessados/compradores) de duas fontes:
//  - formato 'sleekflow': CSV exportado do SleekFlow (FirstName, PhoneNumber, ...)
//  - formato 'colado':    texto colado (Nome [tab] email [tab] telefone [tab] situação)
// Dedup: COMPRADOR tem prioridade — telefone que entra como comprador sobrescreve interessado.

// Parser delimitado que respeita aspas e quebras de linha dentro do campo.
function parseDelim(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else {
      if (c === '"') q = true
      else if (c === delim) { row.push(cur); cur = '' }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
      else if (c === '\r') { /* ignora */ }
      else cur += c
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows
}

// Normaliza telefone brasileiro: só dígitos, DDI 55, corrige 9º dígito de celular.
// Retorna '' se não der pra validar.
function normFone(raw: string, dddPadrao: string): string {
  let d = (raw || '').replace(/\D/g, '').replace(/^0+/, '')
  if (!d) return ''
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    // já tem DDI
  } else if (d.length === 10 || d.length === 11) {
    d = '55' + d
  } else if (d.length === 8 || d.length === 9) {
    d = '55' + dddPadrao + d
  } else {
    return '' // formato fora do padrão BR (estrangeiro/erro)
  }
  // garante 9º dígito em celular (DDI+DDD+8 dígitos começando 6-9 -> insere 9)
  if (d.length === 12) {
    const ddd = d.slice(2, 4)
    const local = d.slice(4)
    if (/^[6-9]/.test(local)) d = '55' + ddd + '9' + local
  }
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return ''
  return d
}

type Linha = { nome: string; telefone: string; email: string; notas: string }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const formato: string = body.formato || 'colado'
    const categoria: string = body.categoria === 'comprador' ? 'comprador' : 'interessado'
    const cidade: string = (body.cidade || '').trim() || null
    const origem: string = (body.origem || '').trim() || null
    const dddPadrao: string = (body.dddPadrao || '51').replace(/\D/g, '').slice(0, 2) || '51'
    const texto: string = body.texto || ''
    if (!texto.trim()) return NextResponse.json({ ok: false, error: 'texto vazio' }, { status: 200 })

    const linhas: Linha[] = []

    if (formato === 'sleekflow') {
      const rows = parseDelim(texto, ',')
      if (!rows.length) return NextResponse.json({ ok: false, error: 'csv vazio' }, { status: 200 })
      const header = rows[0].map(h => h.replace(/^﻿/, '').trim().toLowerCase())
      const iNome = header.indexOf('firstname')
      const iFone = header.indexOf('phonenumber')
      const iLast = header.indexOf('lastname')
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]
        if (!row || row.length < 2) continue
        const c0 = (row[0] || '').trim()
        if (c0.startsWith('Index:') || c0.startsWith('Contact owner') || c0.startsWith('LeadStage') ||
            c0.startsWith('LeadSource') || c0.startsWith('Priority') || c0.startsWith('Country') || c0.startsWith('AssignedTeam')) break
        const fone = iFone >= 0 ? (row[iFone] || '') : ''
        if (!fone.replace(/\D/g, '')) continue
        const nome = [iNome >= 0 ? row[iNome] : '', iLast >= 0 ? row[iLast] : ''].filter(Boolean).join(' ').trim()
        linhas.push({ nome, telefone: fone, email: '', notas: '' })
      }
    } else {
      // colado: tab-delimitado (com aspas/multilinha) OU separado por 2+ espaços
      const rows = texto.includes('\t')
        ? parseDelim(texto, '\t')
        : texto.split(/\r?\n/).map(l => l.split(/\s{2,}/))
      for (const row of rows) {
        const cells = row.map(s => (s || '').trim()).filter(s => s.length)
        if (!cells.length) continue
        const email = cells.find(c => c.includes('@')) || ''
        const fone = cells.find(c => c.replace(/\D/g, '').length >= 8 && /\d/.test(c)) || ''
        if (!fone) continue
        const nome = cells[0] === fone || cells[0] === email ? '' : cells[0]
        // notas = células que sobraram (nem nome, nem email, nem fone)
        const notas = cells.filter(c => c !== nome && c !== email && c !== fone).join(' ').trim()
        linhas.push({ nome, telefone: fone, email, notas })
      }
    }

    // normaliza + dedup interno por telefone
    const recebidos = linhas.length
    let invalidos = 0
    const exemplosInvalidos: string[] = []
    const porFone = new Map<string, any>()
    for (const l of linhas) {
      const tel = normFone(l.telefone, dddPadrao)
      if (!tel) { invalidos++; if (exemplosInvalidos.length < 5) exemplosInvalidos.push(l.telefone); continue }
      // mantém o primeiro; completa nome/email/notas se vier melhor depois
      const ex = porFone.get(tel)
      if (ex) {
        if (!ex.nome && l.nome) ex.nome = l.nome
        if (!ex.email && l.email) ex.email = l.email
        if (!ex.notas && l.notas) ex.notas = l.notas
        continue
      }
      porFone.set(tel, {
        telefone: tel, nome: l.nome || null, email: l.email || null,
        cidade, categoria, origem, notas: l.notas || null,
        status: 'novo', atualizado_em: new Date().toISOString(),
      })
    }

    const registros = Array.from(porFone.values())
    const unicos = registros.length

    // upsert em lotes. interessado: não sobrescreve (comprador ganha). comprador: sobrescreve.
    let salvos = 0
    const lote = 500
    for (let i = 0; i < registros.length; i += lote) {
      const chunk = registros.slice(i, i + lote)
      const { error } = await supabase
        .from('wa_contatos')
        .upsert(chunk, { onConflict: 'telefone', ignoreDuplicates: categoria !== 'comprador' })
      if (error) return NextResponse.json({ ok: false, error: error.message, salvos }, { status: 200 })
      salvos += chunk.length
    }

    return NextResponse.json({ ok: true, recebidos, validos: unicos, invalidos, unicos, salvos, exemplosInvalidos })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'falha' }, { status: 200 })
  }
}
