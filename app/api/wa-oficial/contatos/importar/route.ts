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

type Linha = { nome: string; telefone: string; email: string; notas: string; cidade?: string }

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

    if (texto.includes('BEGIN:VCARD')) {
      // vCard (.vcf) — ex: export do Kommo. Pega FN (nome) e TEL (telefone).
      const cards = texto.split(/BEGIN:VCARD/i)
      for (const c of cards) {
        if (!/END:VCARD/i.test(c)) continue
        const fn = c.match(/^FN[^:\r\n]*:(.+)$/im)
        const tel = c.match(/^TEL[^:\r\n]*:(.+)$/im)
        const telv = tel ? tel[1].trim() : ''
        if (!telv.replace(/\D/g, '')) continue
        linhas.push({ nome: fn ? fn[1].trim() : '', telefone: telv, email: '', notas: '' })
      }
    } else if (formato === 'sleekflow' || formato === 'csv' || formato === 'planilha') {
      // CSV genérico: acha o cabeçalho que tem Nome + Telefone (SleekFlow ou planilha de compradores)
      const rows = parseDelim(texto, ',')
      if (!rows.length) return NextResponse.json({ ok: false, error: 'csv vazio' }, { status: 200 })
      let h = -1
      let header: string[] = []
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const low = rows[i].map(c => (c || '').replace(/^﻿/, '').trim().toLowerCase())
        const temNome = low.some(c => /nome|name/.test(c))
        const temFone = low.some(c => /telefone|phone|celular|whats/.test(c))
        if (temNome && temFone) { h = i; header = low; break }
      }
      if (h < 0) return NextResponse.json({ ok: false, error: 'não encontrei as colunas Nome e Telefone no arquivo' }, { status: 200 })
      const find = (re: RegExp) => header.findIndex(c => re.test(c))
      const iNomeFull = find(/nome completo|full ?name/)
      const iNome = iNomeFull >= 0 ? iNomeFull : find(/^(nome|name|firstname|first ?name|primeiro ?nome)$/)
      const iLast = iNomeFull >= 0 ? -1 : find(/^(lastname|last ?name|sobrenome)$/)
      const iEmail = find(/e-?mail/)
      const iFone = find(/telefone|phone|celular|whats/)
      const iCidade = find(/cidade|city/)
      const colsNotas = header.map((c, idx) => /valor|mentoria|situa|status|obs/.test(c) ? idx : -1).filter(x => x >= 0)
      for (let r = h + 1; r < rows.length; r++) {
        const row = rows[r]
        if (!row) continue
        const fone = iFone < row.length ? (row[iFone] || '') : ''
        if (!fone.replace(/\D/g, '')) continue
        const nome = [iNome >= 0 ? row[iNome] : '', iLast >= 0 ? row[iLast] : ''].filter(Boolean).join(' ').trim()
        const email = iEmail >= 0 ? (row[iEmail] || '') : ''
        let cid = iCidade >= 0 ? (row[iCidade] || '').trim() : ''
        if (!cid && iFone + 1 < row.length) { const nxt = (row[iFone + 1] || '').trim(); if (nxt && !/\d{6,}/.test(nxt)) cid = nxt }
        const notas = colsNotas.map(idx => (row[idx] || '').trim()).filter(Boolean).join(' · ')
        linhas.push({ nome, telefone: fone, email, notas, cidade: cid })
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
        if (!ex.cidade && l.cidade) ex.cidade = l.cidade
        continue
      }
      porFone.set(tel, {
        telefone: tel, nome: l.nome || null, email: l.email || null,
        cidade: cidade || l.cidade || null, categoria, origem, notas: l.notas || null,
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
