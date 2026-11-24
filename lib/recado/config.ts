// Recado Encantado (frente da escola): preços, prazos e pacotes. Mexer aqui muda o checkout e o painel.
export const recadoConfig = {
  marca: 'Recado Encantado',
  // 24/11: medido nos pedidos de verdade (logs do trabalhador), o vídeo avulso leva de 2 a 4 horas depois do pagamento
  // (roteiro + máquina + livro e foto por cima). Uma máquina faz um vídeo por vez: com fila, demora mais.
  prazoTexto: 'em até 4 horas',
  pacotes: {
    noel: {
      // 24/11 (Guto): o vídeo de Natal avulso é o produto único da página /papai-noel. O preço muda sozinho pela data:
      // R$ 49,90 até 10/12 23h59 (Brasília) e R$ 79,90 a partir de 11/12. Este 49,9 é só o de partida: o valor certo sai de precoDe().
      encanto: { nome: 'Vídeo de Natal', preco: 49.9, itens: ['video', 'certificado'] },
      magico: { nome: 'Magia Completa', preco: 64.9, itens: ['video', 'certificado', 'carta', 'vespera'] },
      // ACORDO DE NATAL (24/10): o Noel faz um acordo com a criança até o Natal. Quantos domingos entram o trabalhador calcula pela data
      // da compra (fabrica/lib/acordo.js); aqui é o desenho. Venda até RECADO_ACORDO_ATE (lib/recado/acordo.ts). Irmão: R$ 47 cada.
      acordo: { nome: 'Acordo de Natal', preco: 97, itens: ['video', 'caderneta', 'diploma'], etapas: ['proposta', 'acordo', 'andamento', 'conquista'], irmao: 47 },
      acordo_completo: { nome: 'Acordo Completo', preco: 147, itens: ['video', 'caderneta', 'diploma'], etapas: ['proposta', 'acordo', 'andamento', 'conquista'], semanal: true, irmao: 47 },
    },
    fada: {
      recado: { nome: 'Recado da Fada', preco: 39.9, itens: ['video', 'certificado', 'carta'] },
    },
    // missões (09/10): cada etapa é um vídeo entregue num dia; o trabalhador agenda pelas datas do formulário
    grandao: {
      chupeta: { nome: 'Missão Tchau Chupeta', preco: 94.9, itens: ['video', 'kit', 'certificado'], etapas: ['convocacao', 'entrega', 'agradecimento'] },
    },
    guardiao: {
      dormir: { nome: 'Missão Noite de Herói', preco: 139.9, itens: ['video', 'kit', 'certificado'], etapas: ['convocacao', 'dia', 'dia', 'dia', 'medalha'] },
    },
    coragem: {
      coragem: { nome: 'Missão Coragem', preco: 64.9, itens: ['video', 'kit', 'certificado'], etapas: ['vespera', 'medalha'] },
    },
  } as Record<string, Record<string, { nome: string; preco: number; itens: string[]; etapas?: string[]; semanal?: boolean; irmao?: number }>>,
  irmao: 39.9,   // preços de 10/10: custo de produção até 15% da venda (sistema/lib/economia.js)
  gateway: (process.env.RECADO_GATEWAY || 'asaas') as 'asaas' | 'infinitepay' | 'mercadopago',
  urlSite: process.env.RECADO_URL_SITE || 'https://recadoencantando.com.br',
}

// ---- preço pela data (24/11/2026, decisão do Guto) ----
// Vale no servidor (pedido, atendimento por e-mail, painel) e na tela (as páginas perguntam pra /api/recado/preco).
// A troca é em 11/12/2026 00h00 de Brasília (= 10/12 23h59 é o último minuto a R$ 49,90).
// Pra adiar ou testar sem mexer no código: RECADO_VIRADA_NATAL na Vercel (data ISO com fuso, ex.: 2026-12-11T00:00:00-03:00).
export const VIRADA_NATAL = process.env.RECADO_VIRADA_NATAL || '2026-12-11T00:00:00-03:00'
export const PRECO_NATAL = { ate: 49.9, depois: 79.9 }
export const antesDaVirada = (agora: Date = new Date()) => agora.getTime() < Date.parse(VIRADA_NATAL)
export const precoNatal = (agora: Date = new Date()) => (antesDaVirada(agora) ? PRECO_NATAL.ate : PRECO_NATAL.depois)
// o preço de um pacote agora: o vídeo de Natal (noel/encanto) segue a data; os outros, o preço fixo de cima
export function precoDe(personagem: string, pacote: string, agora: Date = new Date()): number | null {
  const pac = (recadoConfig.pacotes[personagem] || {})[pacote]
  if (!pac) return null
  return personagem === 'noel' && pacote === 'encanto' ? precoNatal(agora) : pac.preco
}

// ---- o que está à venda (24/11/2026, Guto: "não existe mais Magia Completa e nada mais, apenas vídeo avulso") ----
// Só o vídeo personalizado do Papai Noel. Os outros pacotes ficam no cadastro de cima só pra os pedidos antigos
// (página da família, entrega, painel, custos) continuarem funcionando; o /api/recado/pedido recusa qualquer outro.
export const VENDAVEIS = ['noel/encanto']
export const vendavel = (personagem: string, pacote: string) => VENDAVEIS.includes(`${personagem}/${pacote}`)
