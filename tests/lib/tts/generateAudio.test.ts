import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'stream'

const { setMetadataMock, toStreamMock } = vi.hoisted(() => ({
  setMetadataMock: vi.fn().mockResolvedValue(undefined),
  toStreamMock: vi.fn(),
}))

vi.mock('msedge-tts', () => ({
  // vitest v4's mock constructors require 'function'/'class' syntax (not an
  // arrow function) when invoked with `new` - an arrow function throws
  // "... is not a constructor" at runtime.
  MsEdgeTTS: vi.fn().mockImplementation(function () {
    return {
      setMetadata: setMetadataMock,
      toStream: toStreamMock,
    }
  }),
  OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3' },
}))

import { generateAudio } from '@/lib/tts/generateAudio'

describe('generateAudio', () => {
  it('forwards text and voice to MsEdgeTTS, and returns the audio as a Buffer', async () => {
    toStreamMock.mockImplementation(() => {
      const audioStream = new Readable({
        read() {
          this.push(Buffer.from([1, 2, 3]))
          this.push(Buffer.from([4, 5]))
          this.push(null)
        },
      })
      return { audioStream, metadataStream: null }
    })

    const result = await generateAudio('你好', 'zh-TW-HsiaoChenNeural')

    expect(setMetadataMock).toHaveBeenCalledWith('zh-TW-HsiaoChenNeural', 'audio-24khz-48kbitrate-mono-mp3')
    expect(toStreamMock).toHaveBeenCalledWith('你好')
    expect(Buffer.isBuffer(result)).toBe(true)
    expect([...result]).toEqual([1, 2, 3, 4, 5])
  })

  it('rejects when the audio stream errors', async () => {
    toStreamMock.mockImplementation(() => {
      const audioStream = new Readable({
        read() {
          this.destroy(new Error('stream failed'))
        },
      })
      return { audioStream, metadataStream: null }
    })

    await expect(generateAudio('你好', 'zh-TW-YunJheNeural')).rejects.toThrow('stream failed')
  })
})
