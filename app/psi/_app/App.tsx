'use client'
// O app do consultório: confere o login, carrega o básico (perfil, locais, rotina, pacientes) e
// mostra a tela do # do endereço. Os dados do dia (atendimentos, evoluções) cada tela busca na hora.
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { CalendarDays, FileSpreadsheet, Home, MoreHorizontal, Users } from 'lucide-react'
import type { Repo } from '@/lib/psi/repo'
import { abrirRepo, desligarModoExemplo } from '@/lib/psi/repo'
import type { Bloco, Local, Paciente, Perfil } from '@/lib/psi/tipos'
import { BLOCOS_INICIAIS, DESPESAS_INICIAIS, LOCAIS_INICIAIS, NOME_PADRAO } from '@/lib/psi/tipos'
import { mesAtual } from '@/lib/psi/datas'
import { AvisoProvider, Carregando, Logo } from './ui'
import { useRota } from './rotas'
import Inicio from './telas/Inicio'
import Agenda from './telas/Agenda'
import Registrar from './telas/Registrar'
import Pacientes from './telas/Pacientes'
import PacienteTela from './telas/Paciente'
import PacienteForm from './telas/PacienteForm'
import EvolucaoTela from './telas/Evolucao'
import DocumentoTela from './telas/Documento'
import Relatorios from './telas/Relatorios'
import Financeiro from './telas/Financeiro'
import Confirmar from './telas/Confirmar'
import { Mais, Locais, LocalForm, Rotina, MeusDados, Auditoria, Futuro } from './telas/Mais'

export interface Base {
  repo: Repo
  perfil: Perfil
  locais: Local[]
  blocos: Bloco[]
  pacientes: Paciente[]
  recarregar: () => Promise<void>
}
const BaseCtx = createContext<Base | null>(null)
export const useBase = () => useContext(BaseCtx)!

export default function App() {
  const [repo, setRepo] = useState<Repo | null>(null)
  const [logado, setLogado] = useState<boolean | null>(null)
  const [base, setBase] = useState<Omit<Base, 'recarregar' | 'repo'> | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    abrirRepo().then(async r => { setRepo(r); setLogado(!!(await r.usuario())) }).catch(() => setLogado(false))
    // o app instalado guarda a casca pra abrir rápido (public/psi/sw.js; nunca guarda dado de paciente)
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/psi/sw.js', { scope: '/psi' }).catch(() => {})
  }, [])

  const recarregar = useCallback(async () => {
    if (!repo) return
    try {
      let [perfil, locais, blocos, pacientes] = await Promise.all([repo.perfil(), repo.locais(), repo.blocos(), repo.pacientes()])
      // primeiro acesso: nasce com os 4 locais, a rotina da semana e o nome dela
      if (!perfil) { perfil = { nome: NOME_PADRAO, crp: '' }; await repo.salvarPerfil(perfil) }
      if (locais.length === 0) {
        for (const l of LOCAIS_INICIAIS) locais.push(await repo.salvarLocal(l))
        if (blocos.length === 0) for (const b of BLOCOS_INICIAIS) {
          const loc = locais.find(l => l.nome === b.local)
          if (loc) blocos.push(await repo.salvarBloco({ local_id: loc.id, dia_semana: b.dia_semana, hora_inicio: b.hora_inicio, hora_fim: b.hora_fim, ativo: true }))
        }
        // e os custos fixos (aluguel da SESM, contador). Sem o db/psi-financeiro.sql, fica pra depois.
        try {
          if ((await repo.despesas()).length === 0) for (const d of DESPESAS_INICIAIS)
            await repo.salvarDespesa({ nome: d.nome, valor: d.valor, local_id: d.local ? locais.find(l => l.nome === d.local)?.id || null : null, recorrente: true, desde: mesAtual(), ativo: true })
        } catch {}
      }
      setBase({ perfil, locais, blocos, pacientes }); setErro('')
    } catch (e) { setErro((e as Error).message) }
  }, [repo])

  useEffect(() => { if (logado) recarregar() }, [logado, recarregar])

  if (!repo || logado === null) return <Carregando />
  if (!logado) return <Entrar repo={repo} entrou={() => setLogado(true)} />
  if (erro === 'psi-em-preparacao') return (
    <div className="psi-entrar" style={{ textAlign: 'center', alignItems: 'center' }}>
      <Logo tamanho={90} />
      <h1 style={{ fontSize: 24 }}>Sistema em preparação</h1>
      <p className="psi-muted">Está quase pronto. Volte daqui a pouco.</p>
      <button className="psi-btn psi-btn-suave" onClick={recarregar}>Tentar de novo</button>
    </div>
  )
  if (erro && !base) return <div className="psi-tela"><div className="psi-vazio">{erro}<br /><br /><button className="psi-btn psi-btn-suave" onClick={recarregar}>Tentar de novo</button></div></div>
  if (!base) return <Carregando />

  return (
    <BaseCtx.Provider value={{ ...base, repo, recarregar }}>
      <AvisoProvider>
        {repo.modo === 'exemplo' && (
          <div className="psi-faixa-teste">
            Modo de teste: pacientes inventados, salvos só neste aparelho.
            <button onClick={() => { desligarModoExemplo(); window.location.href = '/psi' }}>Sair do teste</button>
          </div>
        )}
        <Telas />
      </AvisoProvider>
    </BaseCtx.Provider>
  )
}

function Telas() {
  const { caminho, q } = useRota()
  const [a, b, c] = caminho
  let tela: React.ReactNode
  if (a === 'carregando') tela = <Carregando />
  else if (!a) tela = <Inicio />
  else if (a === 'agenda') tela = <Agenda q={q} />
  else if (a === 'registrar') tela = <Registrar q={q} />
  else if (a === 'pacientes') tela = <Pacientes />
  else if (a === 'paciente' && b === 'novo') tela = <PacienteForm id={null} />
  else if (a === 'paciente' && c === 'editar') tela = <PacienteForm id={b} />
  else if (a === 'paciente' && b) tela = <PacienteTela id={b} q={q} />
  else if (a === 'evolucao' && b) tela = <EvolucaoTela id={b} q={q} />
  else if (a === 'documento' && b && c) tela = <DocumentoTela pacienteId={b} tipo={c} />
  else if (a === 'relatorios') tela = <Relatorios q={q} />
  else if (a === 'financeiro') tela = <Financeiro q={q} />
  else if (a === 'confirmar') tela = <Confirmar />
  else if (a === 'mais') tela = <Mais />
  else if (a === 'locais') tela = <Locais />
  else if (a === 'local' && b) tela = <LocalForm id={b === 'novo' ? null : b} />
  else if (a === 'rotina') tela = <Rotina />
  else if (a === 'meus-dados') tela = <MeusDados />
  else if (a === 'acessos') tela = <Auditoria />
  else if (a === 'futuro') tela = <Futuro />
  else tela = <Inicio />

  const aba = !a ? 'inicio' : a === 'agenda' || a === 'registrar' || a === 'confirmar' ? 'agenda' : a === 'pacientes' || a === 'paciente' || a === 'evolucao' || a === 'documento' ? 'pacientes' : a === 'relatorios' ? 'relatorios' : 'mais'
  const itens: [string, string, React.ReactNode, string][] = [
    ['inicio', '#/', <Home key="i" size={22} />, 'Início'],
    ['agenda', '#/agenda', <CalendarDays key="a" size={22} />, 'Agenda'],
    ['pacientes', '#/pacientes', <Users key="p" size={22} />, 'Pacientes'],
    ['relatorios', '#/relatorios', <FileSpreadsheet key="r" size={22} />, 'Relatórios'],
    ['mais', '#/mais', <MoreHorizontal key="m" size={22} />, 'Mais'],
  ]
  return (
    <>
      <main className="psi-tela">{tela}</main>
      <nav className="psi-nav" aria-label="Menu">
        {itens.map(([k, href, ic, rot]) => <a key={k} href={href} aria-current={aba === k ? 'page' : undefined}>{ic}{rot}</a>)}
      </nav>
    </>
  )
}

function Entrar({ repo, entrou }: { repo: Repo; entrou: () => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [indo, setIndo] = useState(false)
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setIndo(true); setErro('')
    const err = await repo.entrar(email, senha)
    setIndo(false)
    if (err) { setErro(err); return }
    await repo.registrar('entrar')
    entrou()
  }
  return (
    <form className="psi-entrar" onSubmit={enviar}>
      <Logo tamanho={90} />
      <h1>Consultório</h1>
      <p className="psi-muted" style={{ margin: '0 0 24px' }}>Agenda, atendimentos e prontuário.</p>
      <label className="psi-campo"><span>E-mail</span>
        <input className="psi-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
      </label>
      <label className="psi-campo"><span>Senha</span>
        <input className="psi-input" type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="current-password" required />
      </label>
      {erro && <p style={{ color: 'var(--falta)', margin: '0 0 12px', fontWeight: 600 }}>{erro}</p>}
      <button className="psi-btn psi-btn-principal psi-btn-bloco" disabled={indo || !email || !senha}>{indo ? 'Entrando…' : 'Entrar'}</button>
      <p className="psi-muted psi-pequeno" style={{ marginTop: 18 }}>Esqueceu a senha? Peça pro Guto trocar.</p>
    </form>
  )
}
