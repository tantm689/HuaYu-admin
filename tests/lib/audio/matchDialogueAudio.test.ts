import { describe, it, expect } from 'vitest'
import { matchFilesToDialogues } from '@/lib/audio/matchDialogueAudio'

describe('matchFilesToDialogues', () => {
  const dialogues = [
    { id: 'd1', audio_code: '01-1' },
    { id: 'd2', audio_code: '01-3' },
  ]

  it('matches filenames to dialogues by audio_code, ignoring extension and case', () => {
    const { matched, unmatched } = matchFilesToDialogues(['01-1.mp3', '01-3.MP3'], dialogues)
    expect(matched).toEqual([
      { dialogueId: 'd1', filename: '01-1.mp3' },
      { dialogueId: 'd2', filename: '01-3.MP3' },
    ])
    expect(unmatched).toEqual([])
  })

  it('lists files with no matching audio_code as unmatched', () => {
    const { matched, unmatched } = matchFilesToDialogues(['99-9.mp3'], dialogues)
    expect(matched).toEqual([])
    expect(unmatched).toEqual(['99-9.mp3'])
  })
})
