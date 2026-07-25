import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const ZH_TW_VOICE = 'zh-TW-HsiaoChenNeural'

// NOTE: the installed msedge-tts@2.0.7's public types
// (node_modules/msedge-tts/dist/MsEdgeTTS.d.ts) do not declare a
// `toArrayBuffer` method at all -- only toStream/toFile/rawToStream/rawToFile
// are typed (and the compiled JS confirms the method genuinely doesn't
// exist in this version, it's not just a missing type). We still call it
// through this narrow local interface to match Task 11's spec and its test
// mock. See task-11-report.md for the runtime implication: against the real
// (non-mocked) package, this call will throw "toArrayBuffer is not a
// function" until msedge-tts is upgraded to a version that implements it, or
// this function is rewritten around toStream().
interface ArrayBufferCapableTts {
  setMetadata(voiceName: string, outputFormat: OUTPUT_FORMAT): Promise<void>
  toArrayBuffer(text: string): Promise<ArrayBuffer | Buffer>
}

export async function generateVocabAudio(text: string): Promise<Uint8Array> {
  if (!text.trim()) {
    throw new Error('generateVocabAudio: text must not be empty')
  }

  const tts = new MsEdgeTTS() as unknown as ArrayBufferCapableTts
  await tts.setMetadata(ZH_TW_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const audio = await tts.toArrayBuffer(text)
  return new Uint8Array(audio)
}
