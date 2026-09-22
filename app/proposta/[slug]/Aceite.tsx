'use client'

import { useState } from 'react'

// O ACEITE DO CLIENTE, no lugar das linhas de assinatura.
//
// Antes a última página tinha três linhas em branco pra assinar — o que só faz sentido em papel:
// ninguém imprime, assina e devolve uma proposta que chegou por link. Aqui a pessoa escreve o nome
// dela e confirma, e o time vê no card do lead na hora.
//
// ⚠️ É REGISTRO DE ACEITE, NÃO ASSINATURA DIGITAL. Sem certificado, sem validade de documento
// assinado. A página diz isso pro cliente em vez de deixar ele achar que assinou um contrato.

export default function Aceite({ slug, nomeSugerido, aceitoEm, aceitoNome }: {
  slug: string
  nomeSugerido: string
  aceitoEm: string | null
  aceitoNome: string | null
}) {
  const [nome, setNome] = useState(nomeSugerido === 'você' ? '' : nomeSugerido)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  // quando a proposta já foi aceita antes, a página abre mostrando o aceite
  const [feito, setFeito] = useState<{ em: string; nome: string } | null>(
    aceitoEm ? { em: aceitoEm, nome: aceitoNome || '' } : null,
  )

  const quando = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

  async function aceitar() {
    if (nome.trim().length < 3) { setErro('Escreve teu nome completo pra confirmar.'); return }
    setErro(''); setEnviando(true)
    try {
      const r = await fetch('/api/orcamentos/aceitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, nome: nome.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (j?.ok) setFeito({ em: j.aceito_em, nome: j.aceito_nome || nome.trim() })
      else setErro(j?.error || 'Não consegui registrar agora. Tenta de novo em instantes.')
    } catch {
      setErro('Não consegui registrar agora. Confere a internet e tenta de novo.')
    }
    setEnviando(false)
  }

  if (feito) {
    return (
      <div className="aceite-feito">
        <div className="aceite-selo">✓ Aceito</div>
        <p className="corpo" style={{ margin: 0 }}>
          <strong>{feito.nome}</strong> confirmou a leitura e o aceite desta proposta
          {feito.em ? <> em {quando(feito.em)}</> : null}.
        </p>
        <p className="corpo" style={{ margin: 0, fontSize: 13 }}>
          A escola entra em contato pra combinar a data. Se precisar mudar alguma coisa, é só falar com quem te enviou.
        </p>
      </div>
    )
  }

  return (
    <div className="aceite-caixa">
      <label className="aceite-rot" htmlFor="aceite-nome">Teu nome completo</label>
      <input
        id="aceite-nome"
        className="aceite-campo"
        value={nome}
        onChange={e => setNome(e.target.value)}
        placeholder="como no teu documento"
        autoComplete="name" />
      <button className="aceite-botao" onClick={aceitar} disabled={enviando}>
        {enviando ? 'Registrando…' : 'Li e aceito esta proposta'}
      </button>
      {erro && <p className="aceite-erro">{erro}</p>}
      <p className="aceite-aviso">
        Ao confirmar fica registrado teu nome, a data e a hora. Não é assinatura digital com
        certificado: é o registro de que tu leu e aceitou esta proposta.
      </p>
    </div>
  )
}
