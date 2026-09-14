// Monta a página de tráfego do ANL Porto Alegre out/26 (duas turmas juntas, tarde e noite)
// a partir da página que estava no ar pra POA (sites-skin/base-trafego-anl.html, baixada de
// carreiranodigital.com/anlportoalegre082601/ em 14/09/2026).
//   node sites-skin/build-anl-poa.js && node sites-skin/aplicar.js anlportoalegre102601
const fs = require('fs')
const path = require('path')
const PUB = path.join(__dirname, '..', 'public')

const T = {
  saida: 'anlportoalegre102601',
  tarde: 'anlportoalegre102601', noite: 'anlportoalegre102602',
  inicioISO: '2026-10-06', inicioBR: '06/10/2026', aulas: '06, 07 e 08 de outubro',
  lote1ate: '2026-09-29', lote1ateBR: '29/09', lote2ate: '2026-10-06', lote2ateBR: '06/10', lote2desde: '30/09',
}

let s = fs.readFileSync(path.join(__dirname, 'base-trafego-anl.html'), 'utf8')
const conta = re => (s.match(re) || []).length
const troca = (re, novo, esperado) => {
  const n = conta(re)
  if (esperado != null && n !== esperado) throw new Error(`esperava ${esperado} de ${re}, achei ${n}`)
  s = s.replace(re, novo)
}

// ── as datas e os lotes
troca(/2026-08-27/g, T.lote1ate, 2)
troca(/27\/08/g, T.lote1ateBR, 2)
troca(/2026-09-08/g, T.lote2ate, 2)
troca(/28\/08/g, T.lote2desde, 2)
troca(/Início 08\/09\/2026/g, 'Início ' + T.inicioBR, 1)
troca(/08, 09 e 10 de setembro/g, T.aulas, 1)
troca(/08\/09/g, T.lote2ateBR, 2)          // os dois "até 08/09" que sobraram (timeline e card do lote 2)

// ── a seção da turma: um cartão vira dois (tarde e noite)
const cardRe = /<div class="turma-card fade-up">[\s\S]*?<\/div>\s*<\/div>\s*<\/div><\/section>/
if (conta(cardRe) !== 1) throw new Error('não achei o cartão da turma')
const card = (turno, horario, codigo) => `<div class="turma-card fade-up">
      <div class="turma-aviso"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg> Inscrições abertas</div>
      <div class="turma-cidade">Porto Alegre</div>
      <div class="turma-estado">Turma da ${turno}, Rio Grande do Sul</div>
      <div class="turma-info"><span>Início ${T.inicioBR}</span></div>
      <div class="turma-info"><span>Aulas: ${T.aulas}</span></div>
      <div class="turma-info"><span>${horario}</span></div>
      <a class="turma-btn btn btn-primary btn-full" data-turma="${codigo}" data-content="turma-card-${turno.toLowerCase()}" href="#">Garantir vaga na turma da ${turno.toLowerCase()}</a>
    </div>`
s = s.replace(cardRe, card('Tarde', 'Das 14h às 17h15', T.tarde) + card('Noite', 'Das 19h às 22h15', T.noite) + `</div>
    </div></section>`)
troca(/<div class="label">Próxima turma<\/div>/g, '<div class="label">Próximas turmas</div>', 1)
troca(/Garanta sua vaga<br><span class="purple">em Porto Alegre\.<\/span>/g, 'Duas turmas em Porto Alegre:<br><span class="purple">de tarde ou de noite.</span>', 1)

// ── os botões de cada lote: um vira dois (tarde e noite)
troca(/<a class="lote-btn" data-turma="anlportoalegre092602" data-content="lote-(\d)" data-inicio="([^"]*)" href="#">Garantir esta condição<\/a>/g,
  (_, n, ini) => `<div class="lote-btns">
            <a class="lote-btn" data-turma="${T.tarde}" data-content="lote-${n}-tarde" data-inicio="${ini}" href="#">Garantir · turma da tarde</a>
            <a class="lote-btn" data-turma="${T.noite}" data-content="lote-${n}-noite" data-inicio="${ini}" href="#">Garantir · turma da noite</a>
          </div>`, 2)
s = s.replace('</style>', `.lote-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:22px}.lote-btns .lote-btn{margin-top:0;padding:13px 10px;font-size:12.5px}
@media(max-width:520px){.lote-btns{grid-template-columns:1fr}}
/* celular: a foto vira faixa no alto e o texto vem embaixo, em fundo escuro (texto em cima do projetor não dava leitura) */
@media(max-width:720px){.hero{padding-top:0}.hero-bg{top:0;height:280px;bottom:auto}.hero-bg img{opacity:1;object-position:center 45%}.hero-overlay{top:0;height:280px;bottom:auto}.hero-content{padding-top:300px}}
</style>`)

// ── o que sobrou apontando pra turma antiga (CTA final, rodapé, nav) vai pra turma da tarde
troca(/anlportoalegre092602/g, T.tarde, null)

// ── a foto do hero: a da escola de POA, se existir (sites-skin/fotos/hero-anl-poa.jpg)
const foto = process.env.HERO_FOTO || path.join(__dirname, 'fotos', 'hero-anl-poa.jpg')
if (fs.existsSync(foto)) {
  const uri = 'data:image/jpeg;base64,' + fs.readFileSync(foto).toString('base64')
  troca(/(<div class="hero-bg">\s*<img src=")data:image\/[^"]+(" alt="Anúncios para Negócios Locais)/g, `$1${uri}$2`, 1)
}

// ── a mensagem do WhatsApp: em português, com a turma escolhida, sem o código no meio
troca(/var BASE_MSG = "[^"]*";/g, 'var BASE_MSG = "Quero mais informações sobre o curso Anúncios para Negócios Locais em Porto Alegre.";', 1)
troca(/p\.set\('msg', BASE_MSG \+ ' ' \+ turma\);/g, "p.set('msg', BASE_MSG + (turma === '" + T.noite + "' ? ' Turma da noite.' : ' Turma da tarde.'));", 1)

// ── sem emoji, sem travessão
troca(/⚡ Faltam/g, 'Faltam', 1)
troca(/⚡\s*/g, '', null)
s = s.replace(/&mdash;/g, '—').replace(/(^|>|\n)\s*—\s+/g, '$1').replace(/\s*—\s*/g, ', ').replace(/,\s*,/g, ',').replace(/, ([.!?])/g, '$1')

// ── conferências finais
if (conta(/anlportoalegre102601/g) < 5 || conta(/anlportoalegre102602/g) < 3) throw new Error('códigos das turmas não entraram direito')
if (conta(/setembro|09\/2026|092602/g)) throw new Error('ainda tem setembro na página')
const out = path.join(PUB, T.saida + '.html')
fs.writeFileSync(out, s)
console.log(out, Math.round(s.length / 1024) + ' kB · tarde:', conta(/anlportoalegre102601/g), '· noite:', conta(/anlportoalegre102602/g))
