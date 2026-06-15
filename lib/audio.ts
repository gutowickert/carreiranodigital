import Recorder from 'opus-recorder'

export type GravadorOpus = { parar: () => Promise<string>; cancelar: () => void }

// Grava direto em OGG/Opus, o formato nativo das notas de voz do WhatsApp.
// Assim o WhatsApp não precisa reconverter o áudio e a reprodução acelerada
// (1.5x / 2x) funciona sem picotar. Roda 100% no cliente.
export async function iniciarGravacaoOpus(): Promise<GravadorOpus> {
  const rec = new Recorder({
    encoderPath: '/opus/encoderWorker.min.js',
    numberOfChannels: 1,
    encoderSampleRate: 48000,
    streamPages: false,
  })

  let resolver: (b: Uint8Array) => void = () => {}
  const dados = new Promise<Uint8Array>(res => { resolver = res })
  rec.ondataavailable = (typedArray: Uint8Array) => resolver(typedArray)

  await rec.start()

  return {
    parar: async () => {
      rec.stop()
      const bytes = await dados
      let bin = ''
      const CH = 0x8000
      for (let i = 0; i < bytes.length; i += CH) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)))
      }
      return `data:audio/ogg;base64,${btoa(bin)}`
    },
    cancelar: () => { try { rec.stop() } catch { /* ignore */ } },
  }
}
