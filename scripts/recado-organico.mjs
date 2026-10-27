// Recado Encantado: monta a lista de posts do orgânico (agendador do Instagram) a partir do CALENDARIO.md do Acordo de Natal.
// Rodar de novo sempre que o calendário ou as imagens mudarem (ex.: quando as imagens do P13 em diante ficarem prontas):
//   node scripts/recado-organico.mjs ["C:/Users/carre/Desktop/Recado Encantado/acordo-de-natal"]
// O que faz:
//   1) lê as legendas do CALENDARIO.md (sem o título "### ..." e sem a linha "Imagem:" / "Ideia da imagem:")
//   2) converte as imagens de organico/ (PNG 1080x1350) pra JPG em public/recado/organico/ (o Instagram precisa de link público)
//   3) escreve lib/recado/organico-posts.ts (gerado: não editar à mão)
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const PASTA = process.argv[2] || 'C:/Users/carre/Desktop/Recado Encantado/acordo-de-natal'
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const SAIDA_IMG = path.join(RAIZ, 'public/recado/organico')
const SAIDA_TS = path.join(RAIZ, 'lib/recado/organico-posts.ts')
const ANO = 2026
const HORA_PADRAO = '19:00'   // horário de Brasília
// horários diferentes do padrão (o calendário pede): P27 é "último dia, até as 18h", então não pode sair às 19h
const HORA = { P27: '10:00' }

const md = fs.readFileSync(path.join(PASTA, 'CALENDARIO.md'), 'utf8').replace(/\r/g, '')

// tabela da visão geral: tipo e assunto de cada post
const tabela = {}
for (const l of md.split('\n')) {
  const m = l.match(/^\|\s*(P\d\d)\s*\|\s*\S+\s+(\d\d)\/(\d\d)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/)
  if (m) tabela[m[1]] = { dia: m[2], mes: m[3], tipo: /carrossel/i.test(m[4]) ? 'carrossel' : 'unico', assunto: m[5] }
}

// as legendas: cada "### Pnn · ..." até o próximo "### " (ou "## ")
const partes = md.split(/\n(?=### P\d\d )/).slice(1)
const imagens = fs.readdirSync(path.join(PASTA, 'organico')).filter(f => /\.png$/i.test(f))
fs.mkdirSync(SAIDA_IMG, { recursive: true })

const posts = []
for (const p of partes) {
  const linhas = p.split(/\n(?=## )/)[0].split('\n')
  const cab = linhas.shift()
  const id = cab.match(/### (P\d\d)/)[1]
  const t = tabela[id]
  if (!t) throw new Error('não achei ' + id + ' na tabela')
  const provaSocial = /ESPAÇO PRA PROVA SOCIAL/.test(cab)
  const corpo = linhas.filter(l => !/^(Imagem|Imagens|Ideia da imagem):/.test(l.trim())).join('\n').replace(/\n---\s*$/, '').trim()
  const legenda = provaSocial ? corpo : corpo.replace(/\*\*/g, '')   // o Instagram não tem negrito: tira os ** do markdown
  // imagens: "P02 03-11 como funciona - 1.png" ... ordenadas pelo número do fim
  const minhas = imagens.filter(f => f.startsWith(id + ' ')).sort((a, b) => (+(a.match(/- (\d+)\.png$/i) || [0, 0])[1]) - (+(b.match(/- (\d+)\.png$/i) || [0, 0])[1]))
  const jpgs = []
  for (const [i, f] of minhas.entries()) {
    const nome = minhas.length > 1 ? `${id}-${i + 1}.jpg` : `${id}.jpg`
    const destino = path.join(SAIDA_IMG, nome)
    // 4:5 (1080x1350) e qualidade alta; o Instagram aceita JPG até 8 MB
    await sharp(path.join(PASTA, 'organico', f)).resize(1080, 1350, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile(destino)
    const kb = Math.round(fs.statSync(destino).size / 1024)
    if (kb > 8000) throw new Error(nome + ' passou de 8 MB')
    jpgs.push(nome)
  }
  const hora = HORA[id] || HORA_PADRAO
  posts.push({
    id, data: `${ANO}-${t.mes}-${t.dia}`, hora, quando: `${ANO}-${t.mes}-${t.dia}T${hora}:00-03:00`,
    tipo: t.tipo, assunto: t.assunto, imagens: jpgs, semImagem: !jpgs.length, provaSocial, legenda,
  })
  if (jpgs.length && t.tipo === 'unico' && jpgs.length !== 1) throw new Error(id + ': post único com ' + jpgs.length + ' imagens')
  if (jpgs.length && t.tipo === 'carrossel' && jpgs.length < 2) throw new Error(id + ': carrossel com 1 imagem')
}

const ts = `// GERADO por scripts/recado-organico.mjs a partir do CALENDARIO.md do Acordo de Natal (${new Date().toISOString().slice(0, 10)}). Não editar à mão:
// mudou o calendário ou as imagens? Rode o script de novo.
// quando = data e hora no horário de Brasília. imagens = arquivos em public/recado/organico/. semImagem = não publica.
export type PostOrganico = { id: string; data: string; hora: string; quando: string; tipo: 'unico' | 'carrossel'; assunto: string; imagens: string[]; semImagem: boolean; provaSocial: boolean; legenda: string }
export const POSTS_ORGANICO: PostOrganico[] = ${JSON.stringify(posts, null, 2)}
`
fs.writeFileSync(SAIDA_TS, ts)
console.log(posts.length + ' posts · ' + posts.filter(p => !p.semImagem).length + ' com imagem · ' + posts.reduce((s, p) => s + p.imagens.length, 0) + ' imagens em public/recado/organico')
