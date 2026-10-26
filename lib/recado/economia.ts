// Recado Encantado: custo padrão de produção de cada produto (espelho de Desktop\Recado Encantado\sistema\lib\economia.js).
// Medido em 10/10/2026: A40 a US$ 0,59/h faz 1 s de vídeo em 2,8 min de máquina (fala + acabamento); voz ElevenLabs; roteiro Claude.
// Regra do Guto: custo de produto no máximo 15% da venda; tráfego 15 a 20%.
export const economia = {
  dolar: 5.6, gpuMinPorSeg: 2.8, gpuUsdHora: 0.59, vozReaisPorSeg: 0.018, iaPorVideo: 0.2, whatsPorVideo: 0.05,
  custoMax: 0.15, trafegoMin: 0.15, trafegoMax: 0.2,
  // 25/10: o acordo em blocos (partes fixas gravadas 1 vez + só o trecho personalizado na máquina) mediu 45,4 min de relógio
  // pra 63 s de vídeo no primeiro pedido de teste = 0,72 min por segundo. É o teto: o relógio inclui ligar a máquina, roteiro e materiais.
  acordoGpuMinPorSeg: 0.72,
  // preços unitários pra conta do custo real de cada pedido (painel, aba Dinheiro). Trocar aqui quando o plano mudar.
  unit: {
    vozUsdPorCaractere: 22 / 100000,   // ElevenLabs Creator: US$ 22 por 100 mil caracteres
    email: 0.003,                      // Resend: grátis até 3 mil por mês; acima, US$ 20 por 50 mil (~R$ 0,002). Conta pra não sumir.
    whats: 0.05,                       // mensagem de utilidade na API oficial do WhatsApp
  },
  // segundos de fala de cada vídeo do produto
  videos: { 'fada/recado': [30], 'noel/encanto': [30], 'noel/magico': [30, 20], 'coragem/coragem': [30, 22], 'grandao/chupeta': [30, 22, 22], 'guardiao/dormir': [30, 20, 20, 20, 22],
    // acordo de Natal (24/10): proposta, acordo, andamento(s), conquista. O completo comprado no fim de outubro tem 8 domingos (11 vídeos)
    'noel/acordo': [40, 35, 30, 35], 'noel/acordo_completo': [40, 35, 30, 30, 30, 30, 30, 30, 30, 30, 35] } as Record<string, number[]>,
}
const porSeg = (minPorSeg: number) => minPorSeg / 60 * economia.gpuUsdHora * economia.dolar + economia.vozReaisPorSeg
export const custoVideo = (s: number, minPorSeg = economia.gpuMinPorSeg) => s * porSeg(minPorSeg) + economia.iaPorVideo + economia.whatsPorVideo
export const custoPadrao = (produto: string) => {
  const m = /^noel\/acordo/.test(produto) ? economia.acordoGpuMinPorSeg : economia.gpuMinPorSeg
  return +(economia.videos[produto] || [30]).reduce((t, s) => t + custoVideo(s, m), 0).toFixed(2)
}
export const reaisMaquina = (min: number) => min / 60 * economia.gpuUsdHora * economia.dolar

// SUGESTÕES (25/10): ponto de partida pros custos fixos e as metas. Não grava no banco: o painel mostra e o Guto usa se quiser.
export const sugestao = {
  fixos: [
    { nome: 'Disco da máquina na RunPod (modelos e vozes)', valor: 40, obs: 'volume de rede ~100 GB a US$ 0,07/GB; confirmar em RunPod > Storage' },
    { nome: 'Caixa de e-mail contato@ (Titan)', valor: 15, obs: 'confirmar o plano na Hostinger' },
    { nome: 'Domínio recadoencantando.com.br', valor: 3.5, obs: '~R$ 40 por ano' },
  ],
  fixosNota: 'Vercel, Supabase e Resend são da escola e ficam em R$ 0 enquanto o Recado é teste. A voz (ElevenLabs), a máquina (RunPod) e o roteiro (Claude) entram no custo de cada pedido, pelo uso.',
  // ticket do acordo ~R$ 115 (70% Acordo R$ 97, 30% Completo R$ 147, alguns irmãos de R$ 47). Venda até 10/12.
  metas: [
    { mes: '2026-11', faturamento: 6900, pedidos: 60, margem_pct: 45, trafego_pct: 20, obs: 'novembro inteiro de Acordo de Natal' },
    { mes: '2026-12', faturamento: 5750, pedidos: 50, margem_pct: 45, trafego_pct: 20, obs: 'só até 10/12 (Completo até 2/12)' },
  ],
}
