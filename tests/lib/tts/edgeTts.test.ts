import { describe, it, expect, vi } from 'vitest'

const toArrayBufferMock = vi.fn().mockResolvedValue(Buffer.from([1, 2, 3]))
const toStreamMock = vi.fn()

vi.mock('msedge-tts', () => ({
  // NOTE: vitest v4's mock constructors require 'function'/'class' syntax
  // (not an arrow function) when the mock is invoked with `new` -- an arrow
  // function throws "... is not a constructor" at runtime. This is a
  // mechanical adjustment from the original brief snippet (which used an
  // arrow function); the mock's behavior is unchanged.
  MsEdgeTTS: vi.fn().mockImplementation(function () {
    return {
      setMetadata: vi.fn().mockResolvedValue(undefined),
      toArrayBuffer: toArrayBufferMock,
    }
  }),
  OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3' },
}))

import { generateVocabAudio } from '@/lib/tts/edgeTts'

describe('generateVocabAudio', () => {
  it('returns mp3 bytes for the given text', async () => {
    const bytes = await generateVocabAudio('你好')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('rejects empty text', async () => {
    await expect(generateVocabAudio('')).rejects.toThrow(/empty/)
  })
})
