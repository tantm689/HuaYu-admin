import { describe, it, expect } from 'vitest'
import { encodeAudioBufferAsWav, type AudioBufferLike } from '@/lib/audio/encodeWav'

function fakeBuffer(channelData: Float32Array[], sampleRate: number): AudioBufferLike {
  return {
    sampleRate,
    numberOfChannels: channelData.length,
    length: channelData[0].length,
    getChannelData: (channel: number) => channelData[channel],
  }
}

describe('encodeAudioBufferAsWav', () => {
  it('produces a Blob with the correct MIME type', () => {
    const buffer = fakeBuffer([new Float32Array([0, 0.5, -0.5, 1, -1])], 44100)
    const blob = encodeAudioBufferAsWav(buffer)
    expect(blob.type).toBe('audio/wav')
  })

  it('produces a file with a valid RIFF/WAVE header and correct byte length', async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1])
    const buffer = fakeBuffer([samples], 44100)
    const blob = encodeAudioBufferAsWav(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())

    // "RIFF" magic
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    // "WAVE" format
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
    // "fmt " subchunk id
    expect(String.fromCharCode(...bytes.slice(12, 16))).toBe('fmt ')
    // "data" subchunk id
    expect(String.fromCharCode(...bytes.slice(36, 40))).toBe('data')

    // 44-byte header + 5 samples * 2 bytes (16-bit PCM) * 1 channel
    expect(bytes.length).toBe(44 + 5 * 2)
  })

  it('clamps sample values to the valid 16-bit PCM range instead of overflowing', async () => {
    // 1.5 and -1.5 are out of the valid [-1, 1] float range a real
    // AudioBuffer would never produce, but the encoder must not wrap/corrupt
    // adjacent bytes if it ever receives one - clamp instead of trusting input.
    const buffer = fakeBuffer([new Float32Array([1.5, -1.5])], 44100)
    const blob = encodeAudioBufferAsWav(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)

    const firstSample = view.getInt16(44, true)
    const secondSample = view.getInt16(46, true)
    expect(firstSample).toBe(32767)
    expect(secondSample).toBe(-32768)
  })

  it('interleaves multiple channels correctly', async () => {
    const left = new Float32Array([1, 0])
    const right = new Float32Array([-1, 0])
    const buffer = fakeBuffer([left, right], 44100)
    const blob = encodeAudioBufferAsWav(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)

    // interleaved order: L0, R0, L1, R1
    expect(view.getInt16(44, true)).toBe(32767) // L0 = 1
    expect(view.getInt16(46, true)).toBe(-32768) // R0 = -1
    expect(view.getInt16(48, true)).toBe(0) // L1 = 0
    expect(view.getInt16(50, true)).toBe(0) // R1 = 0
  })
})
