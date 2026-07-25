import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const ZH_TW_VOICE = 'zh-TW-HsiaoChenNeural'

export async function generateVocabAudio(text: string): Promise<Uint8Array> {
  if (!text.trim()) {
    throw new Error('generateVocabAudio: text must not be empty')
  }

  const tts = new MsEdgeTTS()
  await tts.setMetadata(ZH_TW_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(text)

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = []
    audioStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    audioStream.on('end', () => {
      resolve(new Uint8Array(Buffer.concat(chunks)))
    })
    audioStream.on('error', (err: Error) => {
      reject(err)
    })
  })
}
