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

// nome pro template: usa o PRIMEIRO NOME se ele for de pessoa; "tudo bem" se o PRIMEIRO nome for empresa/cargo/genérico.
// (checa só o 1º nome — "Zenaide -Terapeuta Integrativa" usa "Zenaide"; o descritor depois não importa.)
export function nomeSaudacao(nome: string | null): string {
  const p = (nome || '').trim().split(/\s+/)[0] || ''
  if (p.length < 2 || /^\d/.test(p) || /^(lead|whatsapp|contato|cliente)$/i.test(p) || EMPRESA.test(p) || CARGO.test(p) || /^(dr|dra|sr|sra|srta|prof|profa|pr|pra|rev)\.?$/i.test(p)) return 'tudo bem'
  return cap(p.toLowerCase())
}

// lista de datas compacta pro template: até 3 lista ("11, 12 e 13/08"); mais que isso, "a partir de DD/MM".
export function datasCurtas(datasArr: string[]): string {
  if (!datasArr?.length) return ''
  if (datasArr.length === 1) return datasArr[0]
  if (datasArr.length <= 3) return `${datasArr.slice(0, -1).join(', ')} e ${datasArr[datasArr.length - 1]}`
  return `a partir de ${datasArr[0]}`
}
