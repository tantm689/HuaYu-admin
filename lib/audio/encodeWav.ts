// A minimal subset of AudioBuffer's shape - lets encodeAudioBufferAsWav be
// unit-tested with a plain object instead of a real browser AudioBuffer
// (which doesn't exist in Vitest's jsdom environment).
export interface AudioBufferLike {
  sampleRate: number
  numberOfChannels: number
  length: number
  getChannelData(channel: number): Float32Array
}

// Encodes a decoded/cut audio buffer as a 16-bit PCM WAV file. No external
// dependency (see the plan's Global Constraints for why WAV over mp3) - a
// WAV file is just a 44-byte RIFF/WAVE header followed by raw interleaved
// PCM samples, simple enough to build by hand.
export function encodeAudioBufferAsWav(buffer: AudioBufferLike): Blob {
  const { sampleRate, numberOfChannels, length } = buffer
  const bytesPerSample = 2 // 16-bit
  const blockAlign = numberOfChannels * bytesPerSample
  const dataSize = length * blockAlign
  const headerSize = 44
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(arrayBuffer)

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const channelData: Float32Array[] = []
  for (let ch = 0; ch < numberOfChannels; ch++) channelData.push(buffer.getChannelData(ch))

  let offset = headerSize
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const clamped = Math.max(-1, Math.min(1, channelData[ch][i]))
      const intSample = clamped < 0 ? clamped * 32768 : clamped * 32767
      view.setInt16(offset, Math.round(intSample), true)
      offset += bytesPerSample
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}
