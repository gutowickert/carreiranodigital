// Recado Encantado: custo padrão de produção de cada produto (espelho de Desktop\Recado Encantado\sistema\lib\economia.js).
// Medido em 10/10/2026: A40 a US$ 0,59/h faz 1 s de vídeo em 2,8 min de máquina (fala + acabamento); voz ElevenLabs; roteiro Claude.
// Regra do Guto: custo de produto no máximo 15% da venda; tráfego 15 a 20%.
export const economia = {
  dolar: 5.6, gpuMinPorSeg: 2.8, gpuUsdHora: 0.59, vozReaisPorSeg: 0.018, iaPorVideo: 0.2, whatsPorVideo: 0.05,
  custoMax: 0.15, trafegoMin: 0.15, trafegoMax: 0.2,
  // segundos de fala de cada vídeo do produto
  videos: { 'fada/recado': [30], 'noel/encanto': [30], 'noel/magico': [30, 20], 'coragem/coragem': [30, 22], 'grandao/chupeta': [30, 22, 22], 'guardiao/dormir': [30, 20, 20, 20, 22] } as Record<string, number[]>,
}
const porSeg = economia.gpuMinPorSeg / 60 * economia.gpuUsdHora * economia.dolar + economia.vozReaisPorSeg
export const custoVideo = (s: number) => s * porSeg + economia.iaPorVideo + economia.whatsPorVideo
export const custoPadrao = (produto: string) => +(economia.videos[produto] || [30]).reduce((t, s) => t + custoVideo(s), 0).toFixed(2)
