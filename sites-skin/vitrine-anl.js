// Põe (ou refaz) os cartões de turma na página orgânica do ANL (public/anuncioslocais-preview.html).
// A página já tem o JS da vitrine: cada cartão .vitrine-card[data-grupo] traz as turmas e os lotes em
// JSON, e o script escolhe a turma vigente e o lote vigente sozinho. Aqui só se escreve o HTML.
// Pode rodar de novo à vontade: ele tira a vitrine anterior e escreve a nova.
//   node sites-skin/vitrine-anl.js && node sites-skin/aplicar.js anuncioslocais-preview
const fs = require('fs')
const path = require('path')
const f = path.join(__dirname, '..', 'public', 'anuncioslocais-preview.html')

// uma entrada por cidade; `turmas` em ordem de data (a vitrine mostra a primeira que ainda não começou)
const CIDADES = [
  {
    cidade: 'Porto Alegre', turno: 'tarde ou noite', dois_turnos: true, link: 'https://carreiranodigital.com/anlportoalegre102601/',
    turmas: [{
      turma_inicio: '2026-10-06',
      lotes: [
        { nome: 'Lote 1', pix: 797, parc: '10x R$ 99,70', ate: '2026-09-29' },
        { nome: 'Lote 2', pix: 997, parc: '10x R$ 119,70', ate: '2026-10-06' },
      ],
    }],
  },
]

const card = c => `<a class="vitrine-card fade-up" href="${c.link}" data-grupo='${JSON.stringify(c.turmas).replace(/'/g, '&#39;')}'>
        <div class="vt-top"><span class="vt-cidade">${c.cidade}</span><span class="vt-lote" data-vt-selo>Lote 1</span></div>
        <div class="vt-turno">${c.turno}${c.dois_turnos ? ' <span class="vt-2t">2 turmas</span>' : ''}</div>
        <div class="vt-info" data-vt-info>Início em ${c.turmas[0].turma_inicio.split('-').reverse().slice(0, 2).join('/')}</div>
        <div class="vt-preco"><span class="vt-ap" data-vt-ap>a partir de</span><span data-vt-valor>R$ ${c.turmas[0].lotes[0].pix}</span><span class="vt-pix">no Pix</span></div>
        <div class="vt-parc" data-vt-parc>ou ${c.turmas[0].lotes[0].parc}</div>
        <div class="vt-cta">Ver a turma e garantir a vaga</div>
      </a>`

let s = fs.readFileSync(f, 'utf8')

// 1. tira a vitrine anterior, se houver
s = s.replace(/\s*<div class="vitrine-grid" data-vitrine>[\s\S]*?<\/div>\s*(?=<div class="sem-turma)/, '\n      ')

// 2. o título da seção e a vitrine nova, antes do bloco "sem turma"
const cabecalho = /<h2 class="title t-lg">[^<]*<br><span class="purple">[^<]*<\/span><\/h2><\/div>(\s*)<div class="sem-turma fade-up">/
if (!cabecalho.test(s)) throw new Error('não achei a seção de turmas da página orgânica')
const cidades = CIDADES.map(c => c.cidade).join(' e ')
const titulo = CIDADES.length
  ? `Turma aberta em ${cidades}.<br><span class="purple">A próxima pode ser na sua cidade.</span>`
  : `A próxima turma<br><span class="purple">pode ser na sua cidade.</span>`
s = s.replace(cabecalho, `<h2 class="title t-lg">${titulo}</h2></div>
      <div class="vitrine-grid" data-vitrine>
      ${CIDADES.map(card).join('\n      ')}
      </div>
      <div class="sem-turma fade-up">`)

// 3. o aviso de "sem turma" vira o convite pras outras cidades
s = s.replace(/<div class="sem-turma-selo">[^<]*<\/div>/, `<div class="sem-turma-selo">${CIDADES.length ? 'Não é na tua cidade?' : 'Sem turma com data aberta'}</div>`)

fs.writeFileSync(f, s)
console.log('vitrine com', CIDADES.length, 'cidade(s) em', f)
