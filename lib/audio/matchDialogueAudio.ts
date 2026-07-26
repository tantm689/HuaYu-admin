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

export function matchFilesToDialogues(filenames: string[], dialogues: DialogueForMatch[]): MatchResult {
  const byCode = new Map(
    dialogues.filter((d) => d.audio_code).map((d) => [d.audio_code!.toLowerCase(), d.id])
  )

  const matched: MatchResult['matched'] = []
  const unmatched: string[] = []

  for (const filename of filenames) {
    const code = stripExtension(filename).toLowerCase()
    const dialogueId = byCode.get(code)
    if (dialogueId) {
      matched.push({ dialogueId, filename })
    } else {
      unmatched.push(filename)
    }
  }

  return { matched, unmatched }
}
