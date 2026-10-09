'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { itensDaSenha, problemaNaSenha, REGRA_SENHA } from '@/lib/senha-forte'

// TROCAR MINHA SENHA (08/10/2026). Antes não havia como a pessoa trocar a própria senha: só quem
// criava o usuário definia, e ela ficava pra sempre. Aqui cada um troca a sua, e a senha nova tem
// que seguir a regra de senha forte (lib/senha-forte). O Supabase confere de novo do lado dele.
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, maxWidth: 460 }
const inp: React.CSSProperties = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text)', boxSizing: 'border-box' }

function emPortugues(msg: string): string {
  if (/different from the old/i.test(msg)) return 'A senha nova tem que ser diferente da atual.'
  if (/session/i.test(msg)) return 'Tua sessão expirou. Sai e entra de novo, depois troca a senha.'
  if (/password/i.test(msg)) return 'O login recusou essa senha: ' + REGRA_SENHA
  return msg
}

export default function MinhaSenha() {
  const [senha, setSenha] = useState('')
  const [repete, setRepete] = useState('')
  const [ver, setVer] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)

  async function trocar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setOk(false)
    const p = problemaNaSenha(senha)
    if (p) { setErro(p); return }
    if (senha !== repete) { setErro('As duas senhas não são iguais.'); return }
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) { setErro(emPortugues(error.message || 'não deu pra trocar a senha')); return }
    setOk(true); setSenha(''); setRepete('')
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>Trocar minha senha</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>{REGRA_SENHA}</p>
      <form onSubmit={trocar} style={card}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Senha nova</label>
        <input value={senha} onChange={e => setSenha(e.target.value)} type={ver ? 'text' : 'password'} autoComplete="new-password" style={inp} />
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 14px', fontSize: 12.5, display: 'grid', gap: 4 }}>
          {itensDaSenha(senha).map(i => (
            <li key={i.texto} style={{ color: i.ok ? 'var(--green)' : 'var(--text-faint)' }}>{i.ok ? '✓' : '○'} {i.texto}</li>
          ))}
        </ul>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Repete a senha nova</label>
        <input value={repete} onChange={e => setRepete(e.target.value)} type={ver ? 'text' : 'password'} autoComplete="new-password" style={inp} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)', margin: '10px 0 16px' }}>
          <input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} /> mostrar a senha
        </label>
        {erro && <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>{erro}</div>}
        {ok && <div style={{ fontSize: 13, color: 'var(--green)', marginBottom: 12 }}>Senha trocada. Na próxima vez que entrar, usa a nova.</div>}
        <button type="submit" disabled={salvando} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          {salvando ? 'Trocando...' : 'Trocar senha'}
        </button>
      </form>
    </div>
  )
}
