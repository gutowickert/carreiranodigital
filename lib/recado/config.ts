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
  } as Record<string, Record<string, { nome: string; preco: number; itens: string[] }>>,
  irmao: 19.9,
  gateway: (process.env.RECADO_GATEWAY || 'asaas') as 'asaas' | 'infinitepay' | 'mercadopago',
  urlSite: process.env.RECADO_URL_SITE || 'https://recadoencantado.com.br',
}
