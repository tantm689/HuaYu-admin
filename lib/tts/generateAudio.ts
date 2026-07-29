import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export type TtsVoice = 'zh-TW-HsiaoChenNeural' | 'zh-TW-YunJheNeural'

// @travisvn/edge-tts (raw WebSocket client) was found to hang indefinitely
// against Microsoft's TTS endpoint in this environment - a standalone repro
// outside Next.js confirmed it never resolves, while msedge-tts (a different
// client for the same service) completes in under a second. Switched for
// that reason, not for API preference.
export async function generateAudio(text: string, voice: TtsVoice): Promise<Buffer> {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(text)

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    audioStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    audioStream.on('end', () => resolve(Buffer.concat(chunks)))
    audioStream.on('error', (err: Error) => reject(err))
  })
}
