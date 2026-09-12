// Aplica a pele do padrão visual nos sites: troca as fontes, injeta o CSS depois
// do CSS original, põe a luz de fundo e faz os poucos ajustes de marcação.
// Idempotente: roda de novo por cima sem duplicar.
const fs = require('fs')
const path = require('path')
const S = __dirname
const PUB = require('path').join(__dirname, '..', 'public')
const skin = fs.readFileSync(path.join(S, 'skin.css'), 'utf8')
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&display=swap">'
const LUZ = '<div class="luz-de-fundo" aria-hidden="true"></div>'
const SVG_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
const SVG_SPARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>'

const arquivos = process.argv.slice(2).length ? process.argv.slice(2) : ['home-preview', 'completa-preview', 'anuncioslocais-preview', 'deu-venda', 'deu-venda-poa']

for (const nome of arquivos) {
  const f = path.join(PUB, nome + '.html')
  let s = fs.readFileSync(f, 'utf8')
  const antes = s.length

  // 1. fontes: fora Bebas/Barlow, entra Manrope + Bricolage
  s = s.replace(/<link[^>]*fonts\.googleapis\.com\/css2\?family=(Bebas|Manrope)[^>]*>/g, FONTS)

  // 2. a pele, logo depois do ÚLTIMO <style> original (cascata: ela ganha nos empates)
  s = s.replace(/<style id="cnd-skin">[\s\S]*?<\/style>\n?/g, '')
  const ultimo = s.lastIndexOf('</style>')
  s = s.slice(0, ultimo + 8) + '\n<style id="cnd-skin">' + skin + '</style>\n' + s.slice(ultimo + 8)

  // 3. a luz de fundo, primeira coisa dentro do body
  if (!s.includes('class="luz-de-fundo"')) s = s.replace(/<body([^>]*)>/, '<body$1>\n' + LUZ)

  // 4. glifos ✦/✓ nos números do hero (anúncios locais) → ícones Lucide
  s = s.replace(/(<div class="hero-stat-num"[^>]*>)\s*✦\s*(<\/div>)/g, '$1' + SVG_SPARK + '$2')
  s = s.replace(/(<div class="hero-stat-num"[^>]*>)\s*✓\s*(<\/div>)/g, '$1' + SVG_CHECK + '$2')

  // 4b. os únicos emojis de verdade (Anúncios Locais) → ícones Lucide
  const ICO = (d) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  s = s.replace('<div class="prob-card-icon">💸</div>', '<div class="prob-card-icon">' + ICO('<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2s1.3 1.6 3 2 3 1 3 2-1.3 2-3 2c-1 0-2-.5-2.5-1.5"/><path d="M12 6v2M12 16v2"/>') + '</div>')
  s = s.replace('<div class="prob-card-icon">📊</div>', '<div class="prob-card-icon">' + ICO('<path d="M3 3v18h18"/><path d="M7 15v-4M12 15V8M17 15v-2"/>') + '</div>')
  s = s.replace('<div class="prob-card-icon">🔒</div>', '<div class="prob-card-icon">' + ICO('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>') + '</div>')
  s = s.replace('<div class="res-tag">🏆 Maior resultado</div>', '<div class="res-tag">' + ICO('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>') + ' Maior resultado</div>')

  // 5. a cor da barra do nav ao rolar (script antigo trocava pra um roxo cravado)
  s = s.replace(/'rgba\(123,47,190,0\.3\)'/g, "'var(--accent)'")

  fs.writeFileSync(f, s)
  console.log(nome, antes, '→', s.length, s.includes('cnd-skin') && s.includes('luz-de-fundo') ? 'ok' : 'FALTA ALGO')
}
