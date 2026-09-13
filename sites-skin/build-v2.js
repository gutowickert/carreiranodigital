// Monta public/deu-venda-v2.html (e a versão de POA) a partir do modelo
// deu-venda-v2.tpl.html, puxando as imagens embutidas das páginas atuais — a
// fonte das fotos continua sendo deu-venda.html / deu-venda-poa.html (e a home,
// pra foto da turma do hero).
//   node sites-skin/build-v2.js
const fs = require('fs')
const path = require('path')
const PUB = path.join(__dirname, '..', 'public')
const tpl = fs.readFileSync(path.join(__dirname, 'deu-venda-v2.tpl.html'), 'utf8')

const VERSOES = [
  { fonte: 'deu-venda.html', saida: 'deu-venda-v2.html', CIDADE: 'Lajeado', CAMP: 'deu-venda-v2', TURMA: 'deuvendalajeado',
    ENDERECO: 'Rua Alberto Torres, 526 — Centro, Lajeado/RS' },
  { fonte: 'deu-venda-poa.html', saida: 'deu-venda-poa-v2.html', CIDADE: 'Porto Alegre', CAMP: 'deu-venda-porto-alegre-v2', TURMA: 'deuvendaportoalegre',
    ENDERECO: 'Av. Carlos Gomes, 1340 — Sala 904, Três Figueiras, Porto Alegre/RS' },
]

// as imagens são achadas pelo alt — a ordem muda entre Lajeado e POA
const ALT = {
  logo: /^Carreira no Digital$/, maquina: /^A máquina de captação/, arte: /^A arte do anúncio/, outra: /^Outra marca/,
  pagina: /^E a página/, pedido: /^Um pedido feito/, campanha: /^A campanha no Gerenciador/, leitura: /^A leitura da campanha/,
  painel: /^O painel do mês/, guto: /^Guto Wickert/, sede: /^Unidade /,
  turma: /^Turma CarreiraNoDigital$/,   // vem da home: a foto da turma com os certificados
}
const HOME = fs.readFileSync(path.join(PUB, 'home-preview.html'), 'utf8').replace(/\r?\n/g, ' ')

// a foto da turma vem grande demais pra fundo (600 kB): reduz com o sharp, se ele estiver por aqui
async function menor(dataUri) {
  try {
    const sharp = require('sharp')
    const buf = Buffer.from(dataUri.split(',')[1], 'base64')
    const out = await sharp(buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 76, mozjpeg: true }).toBuffer()
    return 'data:image/jpeg;base64,' + out.toString('base64')
  } catch (e) {
    console.warn('sem sharp, foto da turma fica no tamanho original:', String(e.message).split('\n')[0])
    return dataUri
  }
}

;(async () => {
  for (const v of VERSOES) {
    const src = fs.readFileSync(path.join(PUB, v.fonte), 'utf8').replace(/\r?\n/g, ' ')
    const imgs = [...src.matchAll(/<img([^>]*?)>/g), ...HOME.matchAll(/<img([^>]*?)>/g)]
      .map(m => ({ src: (m[1].match(/src="(data:[^"]+)"/) || [])[1], alt: (m[1].match(/alt="([^"]*)"/) || [, ''])[1] }))
      .filter(x => x.src)
    const acha = nome => {
      const i = imgs.find(x => ALT[nome].test(x.alt))
      if (!i) throw new Error(`${v.fonte}: sem imagem "${nome}"`)
      return i.src
    }
    // a foto do hero: a da sessão 1 a 1 (sites-skin/fotos/hero-sessao.jpg), e na falta dela a da turma
    const propria = path.join(__dirname, 'fotos', 'hero-sessao.jpg')
    const turma = await menor(fs.existsSync(propria) ? 'data:image/jpeg;base64,' + fs.readFileSync(propria).toString('base64') : acha('turma'))
    const out = tpl
      .replace(/\{\{IMG:([a-z]+)\}\}/g, (_, nome) => (nome === 'turma' ? turma : acha(nome)))
      .replace(/\{\{CIDADE\}\}/g, v.CIDADE).replace(/\{\{CAMP\}\}/g, v.CAMP)
      .replace(/\{\{TURMA\}\}/g, v.TURMA).replace(/\{\{ENDERECO\}\}/g, v.ENDERECO)
    if (/\{\{[A-Z]+/.test(out)) throw new Error(v.saida + ': ficou placeholder sem trocar')
    fs.writeFileSync(path.join(PUB, v.saida), out)
    console.log(v.saida, Math.round(out.length / 1024) + ' kB')
  }
})().catch(e => { console.error(e); process.exit(1) })
