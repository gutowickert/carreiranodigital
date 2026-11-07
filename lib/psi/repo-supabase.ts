// O motor de verdade: Supabase com a chave pública + o login dela. Quem filtra é a RLS (db/psi.sql):
// cada consulta só enxerga owner_id = o login. Nada de chave de serviço aqui.
// Regra da casa: erro de banco vira mensagem curta, SEM o conteúdo do paciente (nada clínico em log).
import { supabase } from '@/lib/supabase'
import type { Repo } from './repo'
import type { Anexo, Atendimento, Bloco, DocumentoEmitido, Evolucao, Local, Paciente, Perfil } from './tipos'

const BUCKET = 'psi-anexos'

// tabela que ainda não existe no banco (o db/psi.sql não foi rodado): a tela mostra "Sistema em preparação"
export const EM_PREPARACAO = 'psi-em-preparacao'
function falha(onde: string, e: { message?: string; code?: string } | null): never {
  if (e?.code && ['42P01', 'PGRST205', 'PGRST202', 'PGRST200'].includes(e.code)) throw new Error(EM_PREPARACAO)
  // só o código e o lugar: a mensagem do Postgres pode trazer valores da linha
  throw new Error(`Não deu pra ${onde}${e?.code ? ` (código ${e.code})` : ''}. Confira a internet e tente de novo.`)
}

/** O banco devolve no máximo 1000 linhas e não avisa: pagina sempre. */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>, onde: string): Promise<T[]> {
  const saida: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) falha(onde, error)
    saida.push(...(data || []))
    if (!data || data.length < 1000) return saida
  }
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
const hhmm = (h?: string | null) => (h ? h.slice(0, 5) : null)
const fixAtend = (a: Atendimento): Atendimento => ({ ...a, hora: hhmm(a.hora), valor: num(a.valor) })
const fixLocal = (l: Local): Local => ({ ...l, valor_sessao: num(l.valor_sessao) })
const fixPac = (p: Paciente): Paciente => ({ ...p, hora_fixa: hhmm(p.hora_fixa) })

export function repoSupabase(): Repo {
  return {
    modo: 'supabase',

    async usuario() {
      const { data } = await supabase.auth.getSession()
      const u = data.session?.user
      return u ? { id: u.id, email: u.email || '' } : null
    },
    async entrar(email, senha) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
      return error ? 'E-mail ou senha não conferem.' : null
    },
    async sair() { await supabase.auth.signOut() },

    async perfil() {
      const { data, error } = await supabase.from('psi_perfil').select('*').maybeSingle()
      if (error) falha('carregar seus dados', error)
      return data as Perfil | null
    },
    async salvarPerfil(p) {
      const { owner_id: _o, ...resto } = p
      const { data: s } = await supabase.auth.getSession()
      const dono = s.session?.user.id
      if (!dono) throw new Error('Entre de novo pra salvar.')
      const { error } = await supabase.from('psi_perfil').upsert({ ...resto, owner_id: dono }, { onConflict: 'owner_id' })
      if (error) falha('salvar seus dados', error)
    },

    async locais() {
      const { data, error } = await supabase.from('psi_locais').select('*').order('ordem').order('nome')
      if (error) falha('carregar os locais', error)
      return (data || []).map(fixLocal)
    },
    async salvarLocal(l) {
      const q = l.id ? supabase.from('psi_locais').update(l).eq('id', l.id) : supabase.from('psi_locais').insert(l)
      const { data, error } = await q.select().single()
      if (error) falha('salvar o local', error)
      return fixLocal(data as Local)
    },
    async apagarLocal(id) {
      const { error } = await supabase.from('psi_locais').delete().eq('id', id)
      if (error) falha('apagar o local (ele tem pacientes ou atendimentos? então desative)', error)
    },

    async blocos() {
      const { data, error } = await supabase.from('psi_blocos').select('*').order('dia_semana').order('hora_inicio', { nullsFirst: false })
      if (error) falha('carregar a rotina da semana', error)
      return (data || []).map((b: Bloco) => ({ ...b, hora_inicio: hhmm(b.hora_inicio), hora_fim: hhmm(b.hora_fim) }))
    },
    async salvarBloco(b) {
      const q = b.id ? supabase.from('psi_blocos').update(b).eq('id', b.id) : supabase.from('psi_blocos').insert(b)
      const { data, error } = await q.select().single()
      if (error) falha('salvar o horário', error)
      const r = data as Bloco
      return { ...r, hora_inicio: hhmm(r.hora_inicio), hora_fim: hhmm(r.hora_fim) }
    },
    async apagarBloco(id) {
      const { error } = await supabase.from('psi_blocos').delete().eq('id', id)
      if (error) falha('apagar o horário', error)
    },

    async pacientes() {
      const r = await todas<Paciente>((de, ate) => supabase.from('psi_pacientes').select('*').order('nome').range(de, ate), 'carregar os pacientes')
      return r.map(fixPac)
    },
    async paciente(id) {
      const { data, error } = await supabase.from('psi_pacientes').select('*').eq('id', id).maybeSingle()
      if (error) falha('abrir o paciente', error)
      return data ? fixPac(data as Paciente) : null
    },
    async salvarPaciente(p) {
      const q = p.id ? supabase.from('psi_pacientes').update(p).eq('id', p.id) : supabase.from('psi_pacientes').insert(p)
      const { data, error } = await q.select().single()
      if (error) falha('salvar o paciente', error)
      return fixPac(data as Paciente)
    },

    async atendimentos(f) {
      const r = await todas<Atendimento>((de, ate) => {
        let q = supabase.from('psi_atendimentos').select('*').gte('data', f.de).lte('data', f.ate)
        if (f.pacienteId) q = q.eq('paciente_id', f.pacienteId)
        if (f.localId) q = q.eq('local_id', f.localId)
        return q.order('data').order('hora', { nullsFirst: true }).range(de, ate)
      }, 'carregar os atendimentos')
      return r.map(fixAtend)
    },
    async atendimento(id) {
      const { data, error } = await supabase.from('psi_atendimentos').select('*').eq('id', id).maybeSingle()
      if (error) falha('abrir o atendimento', error)
      return data ? fixAtend(data as Atendimento) : null
    },
    async atendimentosDoPaciente(pacienteId) {
      const r = await todas<Atendimento>((de, ate) => supabase.from('psi_atendimentos').select('*').eq('paciente_id', pacienteId)
        .order('data', { ascending: false }).range(de, ate), 'carregar os atendimentos')
      return r.map(fixAtend)
    },
    async salvarAtendimento(a) {
      const q = a.id ? supabase.from('psi_atendimentos').update(a).eq('id', a.id) : supabase.from('psi_atendimentos').insert(a)
      const { data, error } = await q.select().single()
      if (error) falha('salvar o atendimento', error)
      return fixAtend(data as Atendimento)
    },
    async apagarAtendimento(id) {
      // a evolução ligada fica (prontuário não some); só solta a ligação
      await supabase.from('psi_evolucoes').update({ atendimento_id: null }).eq('atendimento_id', id)
      const { error } = await supabase.from('psi_atendimentos').delete().eq('id', id)
      if (error) falha('apagar o atendimento', error)
    },

    async evolucoes(pacienteId) {
      return todas<Evolucao>((de, ate) => supabase.from('psi_evolucoes').select('*').eq('paciente_id', pacienteId)
        .order('data', { ascending: false }).order('criado_em', { ascending: false }).range(de, ate), 'carregar as evoluções')
    },
    async evolucaoDoAtendimento(atendimentoId) {
      const { data, error } = await supabase.from('psi_evolucoes').select('*').eq('atendimento_id', atendimentoId).is('apagada_em', null).limit(1)
      if (error) falha('carregar a evolução', error)
      return (data?.[0] as Evolucao) || null
    },
    async salvarEvolucao(e) {
      const { versao: _v, criado_em: _c, atualizado_em: _a, ...campos } = e
      const q = e.id ? supabase.from('psi_evolucoes').update(campos).eq('id', e.id) : supabase.from('psi_evolucoes').insert(campos)
      const { data, error } = await q.select().single()
      if (error) falha('salvar a evolução', error)
      return data as Evolucao
    },
    async apagarEvolucao(id, motivo) {
      const { error } = await supabase.from('psi_evolucoes').update({ apagada_em: new Date().toISOString(), apagada_motivo: motivo }).eq('id', id)
      if (error) falha('apagar a evolução', error)
    },
    async versoes(evolucaoId) {
      const { data, error } = await supabase.from('psi_evolucoes_versoes').select('*').eq('evolucao_id', evolucaoId).order('versao', { ascending: false })
      if (error) falha('carregar as versões', error)
      return data || []
    },

    async anexos(pacienteId) {
      const { data, error } = await supabase.from('psi_anexos').select('*').eq('paciente_id', pacienteId).is('apagado_em', null).order('criado_em', { ascending: false })
      if (error) falha('carregar os anexos', error)
      return (data || []) as Anexo[]
    },
    async enviarAnexo(pacienteId, arquivo, descricao) {
      const { data: s } = await supabase.auth.getSession()
      const dono = s.session?.user.id
      if (!dono) throw new Error('Entre de novo pra enviar o arquivo.')
      const limpo = arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80)
      const caminho = `${dono}/${pacienteId}/${Date.now()}-${limpo}`
      const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false })
      if (up.error) throw new Error('Não deu pra enviar o arquivo. Tente de novo.')
      const { data, error } = await supabase.from('psi_anexos').insert({
        paciente_id: pacienteId, nome: arquivo.name, caminho, tipo_mime: arquivo.type || null, tamanho: arquivo.size, descricao: descricao || null,
      }).select().single()
      if (error) falha('registrar o anexo', error)
      return data as Anexo
    },
    async linkAnexo(a) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.caminho, 300)
      return data?.signedUrl || null
    },

    async documentos(pacienteId) {
      const { data, error } = await supabase.from('psi_documentos').select('*').eq('paciente_id', pacienteId).order('emitido_em', { ascending: false }).order('criado_em', { ascending: false })
      if (error) falha('carregar os documentos', error)
      return (data || []) as DocumentoEmitido[]
    },
    async salvarDocumento(d) {
      const { data, error } = await supabase.from('psi_documentos').insert(d).select().single()
      if (error) falha('guardar a cópia do documento', error)
      return data as DocumentoEmitido
    },

    async registrar(acao, pacienteId, detalhe) {
      // auditoria nunca trava a tela: se falhar, segue
      try { await supabase.rpc('psi_registrar', { p_acao: acao, p_paciente: pacienteId || null, p_detalhe: detalhe || null }) } catch {}
    },
    async auditoria(limite = 200) {
      const { data, error } = await supabase.from('psi_auditoria').select('id, acao, tabela, registro_id, paciente_id, campos, detalhe, quando')
        .order('quando', { ascending: false }).limit(limite)
      if (error) falha('carregar o histórico de acessos', error)
      return data || []
    },
  }
}
