import { Mp3Encoder } from '@breezystack/lamejs'

// Converte o áudio gravado no navegador (webm/opus no Chrome, mp4/aac no Safari)
// para MP3 base64 (data URI). O Z-API só garante mp3 no send-audio — webm/opus
// chegava vazio pro destinatário. Roda 100% no cliente.
export async function blobParaMp3DataUri(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext
  const ctx = new AC()
  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    ctx.close()
  }

  const sampleRate = audioBuffer.sampleRate
  const ch0 = audioBuffer.getChannelData(0)
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null

  // mixa pra mono (voz) e converte Float32 [-1,1] -> Int16
  const samples = new Int16Array(ch0.length)
  for (let i = 0; i < ch0.length; i++) {
    let s = ch1 ? (ch0[i] + ch1[i]) / 2 : ch0[i]
    s = Math.max(-1, Math.min(1, s))
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  const encoder = new Mp3Encoder(1, sampleRate, 128)
  const partes: Uint8Array[] = []
  const bloco = 1152
  for (let i = 0; i < samples.length; i += bloco) {
    const chunk = samples.subarray(i, i + bloco)
    const buf = encoder.encodeBuffer(chunk)
    if (buf.length > 0) partes.push(new Uint8Array(buf))
  }
  const fim = encoder.flush()
  if (fim.length > 0) partes.push(new Uint8Array(fim))

  let total = 0
  partes.forEach(p => { total += p.length })
  const tudo = new Uint8Array(total)
  let off = 0
  partes.forEach(p => { tudo.set(p, off); off += p.length })

  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < tudo.length; i += CH) {
    bin += String.fromCharCode.apply(null, Array.from(tudo.subarray(i, i + CH)))
  }
  return `data:audio/mpeg;base64,${btoa(bin)}`
}
