import { describe, expect, it } from 'vitest'
import { dialogueDisplayNames } from '@/lib/dialogueDisplayName'

describe('dialogueDisplayNames', () => {
  it('numbers an all-dialogue lesson sequentially', () => {
    const result = dialogueDisplayNames([{ kind: 'dialogue' }, { kind: 'dialogue' }, { kind: 'dialogue' }])
    expect(result).toEqual(['Hội thoại 1', 'Hội thoại 2', 'Hội thoại 3'])
  })

  it('numbers an all-passage lesson sequentially', () => {
    const result = dialogueDisplayNames([{ kind: 'passage' }, { kind: 'passage' }])
    expect(result).toEqual(['Đoạn văn 1', 'Đoạn văn 2'])
  })

  it('gives each kind its own counter in mixed order: dialogue, passage, dialogue', () => {
    const result = dialogueDisplayNames([{ kind: 'dialogue' }, { kind: 'passage' }, { kind: 'dialogue' }])
    expect(result).toEqual(['Hội thoại 1', 'Đoạn văn 1', 'Hội thoại 2'])
  })

  it('gives each kind its own counter when passage comes before dialogue', () => {
    const result = dialogueDisplayNames([{ kind: 'passage' }, { kind: 'dialogue' }])
    expect(result).toEqual(['Đoạn văn 1', 'Hội thoại 1'])
  })

  it('returns an empty array for an empty input', () => {
    expect(dialogueDisplayNames([])).toEqual([])
  })
})
