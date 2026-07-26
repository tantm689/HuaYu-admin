interface DialogueForMatch {
  id: string
  audio_code: string | null
}

interface MatchResult {
  matched: { dialogueId: string; filename: string }[]
  unmatched: string[]
}

export function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}

// Audio codes appear in two inconsistent forms across the textbook and the
// publisher's real mp3 filenames: printed as "01-3" but the file is
// "01-03.mp3" (or vice versa). Stripping leading zeros from each
// dash-separated numeric segment normalizes both to the same key so they
// match regardless of which side has the padding.
export function normalizeAudioCode(code: string): string {
  return code
    .split('-')
    .map((part) => (/^\d+$/.test(part) ? String(Number(part)) : part))
    .join('-')
}

export function matchFilesToDialogues(filenames: string[], dialogues: DialogueForMatch[]): MatchResult {
  const byCode = new Map(
    dialogues
      .filter((d) => d.audio_code)
      .map((d) => [normalizeAudioCode(d.audio_code!.toLowerCase()), d.id])
  )

  const matched: MatchResult['matched'] = []
  const unmatched: string[] = []

  for (const filename of filenames) {
    const code = normalizeAudioCode(stripExtension(filename).toLowerCase())
    const dialogueId = byCode.get(code)
    if (dialogueId) {
      matched.push({ dialogueId, filename })
    } else {
      unmatched.push(filename)
    }
  }

  return { matched, unmatched }
}
