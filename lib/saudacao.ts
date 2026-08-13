// Decide como cumprimentar pelo NOME nos TEMPLATES (regex — a IA/LLM faz isso melhor no texto livre).
// Nome de PESSOA → primeiro nome capitalizado. Nome de EMPRESA/apelido/não-pessoal → "tudo bem"
// (o template vira "Oi tudo bem, aqui é ..."), pra não sair "Oi Pudim" / "Oi Auto Motore Ltda".

const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

// marcadores comuns de nome de NEGÓCIO (não é pessoa)
const EMPRESA = /\b(ltda|eireli|mei|s\.?a\.?|cia|neg[óo]cios?|digitais?|ag[êe]ncia|e-?commerce|solu[çc][õo]es|modas?|moda|motors?|motore|ve[íi]culos?|pe[çc]as?|comercial|cl[íi]nica|st[uú]dio|studio|loja|shop|store|market|distribui|represent|servi[çc]os?|autope[çc]as?|transport|imports?|grupo|assessoria|consultoria|delivery|festa|coquetel|terapeuta|integrativa|est[eé]tica|barbearia|construtora|imobili|contabil|advocacia|restaurante|lanchonete|padaria|farm[áa]cia|joalheria|[óo]tica|papelaria)\b/i

// cargo/função/título (não é nome de pessoa) — "Secretária do Pablo", "Financeiro", "Dr. Fulano"
const CARGO = /\b(secret[áa]ri[ao]|recep[çc][ãa]o|recepcionista|financeiro|atendimento|gerente|ger[êe]ncia|diretor[a]?|propriet[áa]ri[ao]|respons[áa]vel|vendedor[a]?|s[óo]ci[ao]|dono|dona|equipe|marketing|suporte|rh|dp|adm|administra|assistente)\b/i
const TITULO = /^(dr|dra|sr|sra|srta|prof|profa|pr|pra|rev)\.?\s/i

export function ehEmpresa(nome: string | null): boolean {
  const n = (nome || '').trim()
  if (!n || n.length < 2) return true
  if (/lead|whatsapp|contato|cliente/i.test(n)) return true
  if (/^\d/.test(n)) return true          // começa com número
  if (EMPRESA.test(n)) return true         // tem marcador de empresa
  if (CARGO.test(n)) return true           // é cargo/função
  if (TITULO.test(n)) return true          // começa com título (Dr., Sr...)
  if (/\bdo\b|\bda\b/i.test(n) && n.split(/\s+/).length >= 3) return true  // "X do/da Y" (posse) → não é primeiro nome
  return false
}

// tira emojis, símbolos e pontuação decorativa que vêm colados no nome (ex.: "🎀Kamylla🎀", "*João*")
const limpaNome = (s: string | null): string => (s || '')
  .normalize('NFKC') // funde letras "estilizadas" do WhatsApp (𝐓𝐚𝐧𝐢𝐚 → Tania, 𝕁𝕠ã𝕠 → João)
  .replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, ' ')
  .replace(/[*_~`|]/g, ' ')
  .replace(/\s+/g, ' ').trim()

// RÓTULO de pessoa que vem ANTES do nome (profissão/título): "Arquiteta Cintia", "Dr João", "Corretor Léo".
// Nesses, o nome real é o PRÓXIMO token — pula o rótulo em vez de cumprimentar pela profissão.
const ROTULO_PESSOA = /^(arquitet[oa]|advogad[oa]|corretor[a]?|m[ée]dic[oa]|dentista|nutri(cionista)?|personal|coach|psic[óo]log[oa]|fisio(terapeuta)?|contador[a]?|engenheir[oa]|enfermeir[oa]|veterin[áa]ri[oa]|esteticista|cabeleireir[oa]|manicure|designer|consultor[a]?|terapeuta|professor[a]?|pastor[a]?|delegad[oa]|dr|dra|sr|sra|srta|prof|profa|pr|pra|rev)\.?$/i
const CONECTOR = /^(de|do|da|dos|das|e)$/i

// 1º nome de PESSOA (capitalizado) ou null se o começo for empresa/cargo/genérico
const primeiroSePessoa = (s: string): string | null => {
  const toks = limpaNome(s).replace(/[^\p{L}\p{N} .'\-]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  // pula rótulos de profissão/título e conectores no começo ("Arquiteta Cintia" → Cintia)
  let i = 0
  while (i < toks.length && (ROTULO_PESSOA.test(toks[i]) || CONECTOR.test(toks[i]))) i++
  const p = toks[i] || ''
  if (p.length < 2 || /^\d/.test(p) || /^(lead|whatsapp|contato|cliente)$/i.test(p) || EMPRESA.test(p) || CARGO.test(p)) return null
  if (/^\p{Lu}+$/u.test(p) && p.length <= 2) return null // sigla/iniciais em maiúsculas (ex.: "SW", "AB") → não é primeiro nome
  return cap(p.toLowerCase())
}

// nome pro template: usa o PRIMEIRO NOME se ele for de pessoa; "tudo bem" se for empresa/cargo/genérico.
// "Empresa (Pessoa)" (ex.: "Soluzzion (Naor Baierle)") → a pessoa costuma estar nos PARÊNTESES: tenta ela.
export function nomeSaudacao(nome: string | null): string {
  const raw = limpaNome(nome)
  const fora = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim() // nome fora dos parênteses
  const bomFora = primeiroSePessoa(fora)
  if (bomFora) return bomFora
  const paren = raw.match(/\(([^)]+)\)/) // "(Naor Baierle)" — pessoa por trás da empresa
  if (paren) { const bomDentro = primeiroSePessoa(paren[1]); if (bomDentro) return bomDentro }
  return 'tudo bem'
}

// lista de datas compacta pro template: até 3 lista ("11, 12 e 13/08"); mais que isso, "a partir de DD/MM".
export function datasCurtas(datasArr: string[]): string {
  if (!datasArr?.length) return ''
  if (datasArr.length === 1) return datasArr[0]
  if (datasArr.length <= 3) return `${datasArr.slice(0, -1).join(', ')} e ${datasArr[datasArr.length - 1]}`
  return `a partir de ${datasArr[0]}`
}
