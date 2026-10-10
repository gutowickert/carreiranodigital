// Recado Encantado (frente da escola): preços, prazos e pacotes. Mexer aqui muda o checkout e o painel.
export const recadoConfig = {
  marca: 'Recado Encantado',
  prazoTexto: 'em até 2 horas',
  pacotes: {
    noel: {
      encanto: { nome: 'Encanto', preco: 39.9, itens: ['video', 'certificado'] },
      magico: { nome: 'Magia Completa', preco: 64.9, itens: ['video', 'certificado', 'carta', 'vespera'] },
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
  } as Record<string, Record<string, { nome: string; preco: number; itens: string[]; etapas?: string[] }>>,
  irmao: 39.9,   // preços de 10/10: custo de produção até 15% da venda (sistema/lib/economia.js)
  gateway: (process.env.RECADO_GATEWAY || 'asaas') as 'asaas' | 'infinitepay' | 'mercadopago',
  urlSite: process.env.RECADO_URL_SITE || 'https://recadoencantando.com.br',
}
