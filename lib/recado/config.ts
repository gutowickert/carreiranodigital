// Recado Encantado (frente da escola): preços, prazos e pacotes. Mexer aqui muda o checkout e o painel.
export const recadoConfig = {
  marca: 'Recado Encantado',
  prazoTexto: 'em até 2 horas',
  pacotes: {
    noel: {
      encanto: { nome: 'Encanto', preco: 29.9, itens: ['video', 'certificado'] },
      magico: { nome: 'Magia Completa', preco: 49.9, itens: ['video', 'certificado', 'carta', 'vespera'] },
    },
    fada: {
      recado: { nome: 'Recado da Fada', preco: 24.9, itens: ['video', 'certificado', 'carta'] },
    },
    // missões (09/10): cada etapa é um vídeo entregue num dia; o trabalhador agenda pelas datas do formulário
    grandao: {
      chupeta: { nome: 'Missão Tchau Chupeta', preco: 49.9, itens: ['video', 'kit', 'certificado'], etapas: ['convocacao', 'entrega', 'agradecimento'] },
    },
    guardiao: {
      dormir: { nome: 'Missão Noite de Herói', preco: 59.9, itens: ['video', 'kit', 'certificado'], etapas: ['convocacao', 'dia', 'dia', 'dia', 'medalha'] },
    },
    coragem: {
      coragem: { nome: 'Missão Coragem', preco: 29.9, itens: ['video', 'kit', 'certificado'], etapas: ['vespera', 'medalha'] },
    },
  } as Record<string, Record<string, { nome: string; preco: number; itens: string[]; etapas?: string[] }>>,
  irmao: 19.9,
  gateway: (process.env.RECADO_GATEWAY || 'asaas') as 'asaas' | 'infinitepay' | 'mercadopago',
  urlSite: process.env.RECADO_URL_SITE || 'https://recadoencantado.com.br',
}
