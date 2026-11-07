// O "repositório" do consultório: tudo que a tela lê e grava passa por aqui. Dois motores com a mesma cara:
//  · Supabase (o de verdade): chave pública + o login dela; a RLS (db/psi.sql) só entrega as linhas dela.
//  · Exemplo (modo de teste): guarda no próprio aparelho (localStorage) com pacientes INVENTADOS.
//    Serve pra testar e mostrar sem tocar no banco. A tela mostra uma faixa "modo de teste".
import type {
  Anexo, Atendimento, Bloco, DocumentoEmitido, Evolucao, EventoAuditoria, Local, Paciente, Perfil, VersaoEvolucao,
} from './tipos'

export type AcaoRegistro = 'ver' | 'exportar' | 'documento' | 'entrar' | 'compartilhar'

export interface FiltroAtendimentos {
  de: string
  ate: string
  pacienteId?: string
  localId?: string
}

export interface Repo {
  modo: 'supabase' | 'exemplo'
  usuario(): Promise<{ id: string; email: string } | null>
  entrar(email: string, senha: string): Promise<string | null> // devolve a mensagem de erro, ou null
  sair(): Promise<void>

  perfil(): Promise<Perfil | null>
  salvarPerfil(p: Perfil): Promise<void>

  locais(): Promise<Local[]>
  salvarLocal(l: Partial<Local> & { nome: string }): Promise<Local>
  apagarLocal(id: string): Promise<void>

  blocos(): Promise<Bloco[]>
  salvarBloco(b: Partial<Bloco> & { local_id: string; dia_semana: number }): Promise<Bloco>
  apagarBloco(id: string): Promise<void>

  pacientes(): Promise<Paciente[]>
  paciente(id: string): Promise<Paciente | null>
  salvarPaciente(p: Partial<Paciente> & { nome: string }): Promise<Paciente>

  atendimentos(f: FiltroAtendimentos): Promise<Atendimento[]>
  atendimentosDoPaciente(pacienteId: string): Promise<Atendimento[]>
  atendimento(id: string): Promise<Atendimento | null>
  salvarAtendimento(a: Partial<Atendimento> & { paciente_id: string; data: string }): Promise<Atendimento>
  apagarAtendimento(id: string): Promise<void>

  evolucoes(pacienteId: string): Promise<Evolucao[]>
  evolucaoDoAtendimento(atendimentoId: string): Promise<Evolucao | null>
  salvarEvolucao(e: Partial<Evolucao> & { paciente_id: string; data: string; texto: string }): Promise<Evolucao>
  apagarEvolucao(id: string, motivo: string): Promise<void>
  versoes(evolucaoId: string): Promise<VersaoEvolucao[]>

  anexos(pacienteId: string): Promise<Anexo[]>
  enviarAnexo(pacienteId: string, arquivo: File, descricao?: string): Promise<Anexo>
  linkAnexo(a: Anexo): Promise<string | null>

  documentos(pacienteId: string): Promise<DocumentoEmitido[]>
  salvarDocumento(d: Omit<DocumentoEmitido, 'id' | 'criado_em'>): Promise<DocumentoEmitido>

  registrar(acao: AcaoRegistro, pacienteId?: string | null, detalhe?: string): Promise<void>
  auditoria(limite?: number): Promise<EventoAuditoria[]>
}

const CHAVE_MODO = 'psi_modo_exemplo'

/** O modo de teste liga com /psi?exemplo=1 (fica salvo no aparelho) e desliga com ?exemplo=0 ou pelo botão. */
export function modoExemploLigado(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search).get('exemplo')
    if (q === '1') localStorage.setItem(CHAVE_MODO, '1')
    if (q === '0') localStorage.removeItem(CHAVE_MODO)
    return process.env.NEXT_PUBLIC_PSI_EXEMPLO === '1' || localStorage.getItem(CHAVE_MODO) === '1'
  } catch { return false }
}

export function desligarModoExemplo() {
  try { localStorage.removeItem(CHAVE_MODO) } catch {}
}

let atual: Repo | null = null
export async function abrirRepo(): Promise<Repo> {
  if (atual) return atual
  if (modoExemploLigado()) {
    const { repoExemplo } = await import('./repo-exemplo')
    atual = repoExemplo()
  } else {
    const { repoSupabase } = await import('./repo-supabase')
    atual = repoSupabase()
  }
  return atual
}
export const repoAtual = () => {
  if (!atual) throw new Error('repositório não aberto')
  return atual
}
