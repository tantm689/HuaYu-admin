"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs"
import { moveItem } from "@/lib/moveItem"
import { EditableText } from "@/components/editable-text"
import { BlockActions } from "@/components/block-actions"
import { SectionBlock } from "@/components/grammar-editor"
import { DialogueLineBlock } from "@/components/dialogue-line-block"
import { VocabRow } from "@/components/vocab-row"
import type { LessonFullView } from "@/lib/db/getLessonFull"
import { dialogueDisplayNames } from "@/lib/dialogueDisplayName"
import type { TtsVoice } from "@/lib/tts/generateAudio"

const VOICE_OPTIONS: { value: TtsVoice; label: string }[] = [
  { value: "zh-TW-HsiaoChenNeural", label: "Hiểu Trân (nữ)" },
  { value: "zh-TW-YunJheNeural", label: "Vân Triết (nam)" },
]

interface Props {
  params: Promise<{ lessonId: string }>
}

type Dialogue = LessonFullView["dialogues"][number]
type DialogueLine = Dialogue["lines"][number]
type VocabularyEntry = Dialogue["vocabulary"][number]
type GrammarPoint = LessonFullView["grammarPoints"][number]
type GrammarSection = GrammarPoint["sections"][number]
type GrammarSectionItem = GrammarSection["items"][number]
type GrammarExample = GrammarSection["examples"][number]
type GrammarSubPoint = GrammarPoint["subPoints"][number]

let tempIdCounter = 0
function tempId() {
  tempIdCounter += 1
  return `temp-${tempIdCounter}`
}

function emptyLine(order: number): DialogueLine {
  return {
    id: tempId(),
    order,
    speakerZh: null,
    speakerPinyin: null,
    textZh: "",
    pinyin: null,
    translationVi: null,
    audioUrl: null,
  }
}

function emptyDialogue(order: number): Dialogue {
  return {
    id: tempId(),
    order,
    kind: "dialogue",
    audioCode: null,
    audioUrl: null,
    lines: [emptyLine(1)],
    vocabulary: [],
  }
}

function emptyVocab(order: number): VocabularyEntry {
  return { id: tempId(), order, wordZh: "", pinyin: null, meaningVi: null, audioUrl: null }
}

function emptyExample(order: number): GrammarExample {
  return { id: tempId(), order, textZh: "", pinyin: null, translationVi: null }
}

function emptySectionItem(order: number): GrammarSectionItem {
  return { id: tempId(), order, label: "", content: null, examples: [emptyExample(1)] }
}

function emptySection(order: number): GrammarSection {
  return { id: tempId(), order, label: "", content: null, examples: [emptyExample(1)], items: [] }
}

function emptySubPoint(order: number): GrammarSubPoint {
  return {
    id: tempId(),
    order,
    label: "",
    titleVi: null,
    sections: [emptySection(1)],
  }
}

function emptyGrammarPoint(order: number): GrammarPoint {
  return {
    id: tempId(),
    order,
    titleVi: null,
    sections: [emptySection(1)],
    subPoints: [],
  }
}

// Rows added in this editor get a client-only "temp-*" id so React has a
// stable key; the API only treats an id as real when it isn't temp-prefixed,
// everything else is submitted with id: null so the server INSERTs it.
function toApiId(id: string): string | null {
  return id.startsWith("temp-") ? null : id
}

export default function LessonEditPage({ params }: Props) {
  const { lessonId } = use(params)
  const router = useRouter()

  const [data, setData] = useState<LessonFullView | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [audioVoice, setAudioVoice] = useState<TtsVoice>(VOICE_OPTIONS[0].value)
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [audioActionError, setAudioActionError] = useState<string | null>(null)
  const [regeneratingAudioId, setRegeneratingAudioId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Không tải được bài học.")
      }
      const json: LessonFullView = await res.json()
      setData(json)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Không tải được bài học.")
    } finally {
      setIsLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function handleSave() {
    if (!data) return
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const payload = {
        titleZh: data.titleZh,
        titleVi: data.titleVi,
        theme: data.theme,
        objectives: data.objectives,
        dialogues: data.dialogues.map((d) => ({
          ...d,
          id: toApiId(d.id),
          lines: d.lines.map((l) => ({ ...l, id: toApiId(l.id) })),
          vocabulary: d.vocabulary.map((v) => ({ ...v, id: toApiId(v.id) })),
        })),
        grammarPoints: data.grammarPoints.map((g) => ({
          ...g,
          id: toApiId(g.id),
          sections: g.sections.map((s) => ({
            ...s,
            id: toApiId(s.id),
            examples: s.examples.map((e) => ({ ...e, id: toApiId(e.id) })),
            items: s.items.map((it) => ({
              ...it,
              id: toApiId(it.id),
              examples: it.examples.map((e) => ({ ...e, id: toApiId(e.id) })),
            })),
          })),
          subPoints: g.subPoints.map((sp) => ({
            ...sp,
            id: toApiId(sp.id),
            sections: sp.sections.map((s) => ({
              ...s,
              id: toApiId(s.id),
              examples: s.examples.map((e) => ({ ...e, id: toApiId(e.id) })),
              items: s.items.map((it) => ({
                ...it,
                id: toApiId(it.id),
                examples: it.examples.map((e) => ({ ...e, id: toApiId(e.id) })),
              })),
            })),
          })),
        })),
      }
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Lưu thất bại.")
      }
      setSaveSuccess(true)
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Lưu thất bại.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleGenerateMissingAudio() {
    setIsGeneratingAudio(true)
    setAudioActionError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: audioVoice, mode: "fill" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Sinh audio thất bại.")
      }
      await load()
    } catch (err) {
      setAudioActionError(err instanceof Error ? err.message : "Sinh audio thất bại.")
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  async function handleRegenerateAllAudio() {
    const confirmed = window.confirm(
      "Sẽ ghi đè TOÀN BỘ audio đã có của mọi từ vựng trong bài (kể cả đã tạo lại riêng), tiếp tục?"
    )
    if (!confirmed) return

    setIsGeneratingAudio(true)
    setAudioActionError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: audioVoice, mode: "regenerateAll" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Sinh lại audio thất bại.")
      }
      await load()
    } catch (err) {
      setAudioActionError(err instanceof Error ? err.message : "Sinh lại audio thất bại.")
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  async function handleRegenerateOneAudio(vocabId: string) {
    setRegeneratingAudioId(vocabId)
    setAudioActionError(null)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/audio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: vocabId, voice: audioVoice }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Tạo lại audio thất bại.")
      }
      await load()
    } catch (err) {
      setAudioActionError(err instanceof Error ? err.message : "Tạo lại audio thất bại.")
    } finally {
      setRegeneratingAudioId(null)
    }
  }

  function updateLesson(patch: Partial<Pick<LessonFullView, "titleZh" | "titleVi" | "theme">>) {
    setData((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function updateObjective(idx: number, value: string) {
    setData((prev) => {
      if (!prev) return prev
      const objectives = prev.objectives.map((o, i) => (i === idx ? value : o))
      return { ...prev, objectives }
    })
  }

  function addObjective() {
    setData((prev) => (prev ? { ...prev, objectives: [...prev.objectives, ""] } : prev))
  }

  function removeObjective(idx: number) {
    setData((prev) => {
      if (!prev) return prev
      const objectives = prev.objectives.filter((_, i) => i !== idx)
      return { ...prev, objectives }
    })
  }

  function updateDialogue(dIdx: number, patch: Partial<Dialogue>) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) => (i === dIdx ? { ...d, ...patch } : d))
      return { ...prev, dialogues }
    })
  }

  function addDialogue() {
    setData((prev) =>
      prev ? { ...prev, dialogues: [...prev.dialogues, emptyDialogue(prev.dialogues.length + 1)] } : prev
    )
  }

  function removeDialogue(dIdx: number) {
    setData((prev) => (prev ? { ...prev, dialogues: prev.dialogues.filter((_, i) => i !== dIdx) } : prev))
  }

  function updateDialogueLine(dIdx: number, lIdx: number, patch: Partial<DialogueLine>) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) => {
        if (i !== dIdx) return d
        return { ...d, lines: d.lines.map((l, j) => (j === lIdx ? { ...l, ...patch } : l)) }
      })
      return { ...prev, dialogues }
    })
  }

  function addDialogueLine(dIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, lines: [...d.lines, emptyLine(d.lines.length + 1)] } : d
      )
      return { ...prev, dialogues }
    })
  }

  function removeDialogueLine(dIdx: number, lIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, lines: d.lines.filter((_, j) => j !== lIdx) } : d
      )
      return { ...prev, dialogues }
    })
  }

  function updateVocab(dIdx: number, vIdx: number, patch: Partial<VocabularyEntry>) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) => {
        if (i !== dIdx) return d
        return { ...d, vocabulary: d.vocabulary.map((v, j) => (j === vIdx ? { ...v, ...patch } : v)) }
      })
      return { ...prev, dialogues }
    })
  }

  function addVocab(dIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, vocabulary: [...d.vocabulary, emptyVocab(d.vocabulary.length + 1)] } : d
      )
      return { ...prev, dialogues }
    })
  }

  function removeVocab(dIdx: number, vIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, vocabulary: d.vocabulary.filter((_, j) => j !== vIdx) } : d
      )
      return { ...prev, dialogues }
    })
  }

  function updateGrammar(gIdx: number, patch: Partial<GrammarPoint>) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => (i === gIdx ? { ...g, ...patch } : g))
      return { ...prev, grammarPoints }
    })
  }

  function addGrammar() {
    setData((prev) =>
      prev
        ? { ...prev, grammarPoints: [...prev.grammarPoints, emptyGrammarPoint(prev.grammarPoints.length + 1)] }
        : prev
    )
  }

  function removeGrammar(gIdx: number) {
    setData((prev) =>
      prev ? { ...prev, grammarPoints: prev.grammarPoints.filter((_, i) => i !== gIdx) } : prev
    )
  }

  function updateSection(gIdx: number, secIdx: number, patch: Partial<GrammarSection>) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return { ...g, sections: g.sections.map((s, j) => (j === secIdx ? { ...s, ...patch } : s)) }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addSection(gIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) =>
        i === gIdx ? { ...g, sections: [...g.sections, emptySection(g.sections.length + 1)] } : g
      )
      return { ...prev, grammarPoints }
    })
  }

  function removeSection(gIdx: number, secIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) =>
        i === gIdx ? { ...g, sections: g.sections.filter((_, j) => j !== secIdx) } : g
      )
      return { ...prev, grammarPoints }
    })
  }

  function updateSectionExample(gIdx: number, secIdx: number, eIdx: number, patch: Partial<GrammarExample>) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) => {
            if (j !== secIdx) return s
            return { ...s, examples: s.examples.map((e, k) => (k === eIdx ? { ...e, ...patch } : e)) }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addSectionExample(gIdx: number, secIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) =>
            j === secIdx ? { ...s, examples: [...s.examples, emptyExample(s.examples.length + 1)] } : s
          ),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function removeSectionExample(gIdx: number, secIdx: number, eIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) =>
            j === secIdx ? { ...s, examples: s.examples.filter((_, k) => k !== eIdx) } : s
          ),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function updateSectionItem(gIdx: number, secIdx: number, itemIdx: number, patch: Partial<GrammarSectionItem>) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) => {
            if (j !== secIdx) return s
            return { ...s, items: s.items.map((it, k) => (k === itemIdx ? { ...it, ...patch } : it)) }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addSectionItem(gIdx: number, secIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) =>
            j === secIdx ? { ...s, items: [...s.items, emptySectionItem(s.items.length + 1)] } : s
          ),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function removeSectionItem(gIdx: number, secIdx: number, itemIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) =>
            j === secIdx ? { ...s, items: s.items.filter((_, k) => k !== itemIdx) } : s
          ),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function updateSectionItemExample(
    gIdx: number,
    secIdx: number,
    itemIdx: number,
    eIdx: number,
    patch: Partial<GrammarExample>
  ) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) => {
            if (j !== secIdx) return s
            return {
              ...s,
              items: s.items.map((it, k) => {
                if (k !== itemIdx) return it
                return { ...it, examples: it.examples.map((e, m) => (m === eIdx ? { ...e, ...patch } : e)) }
              }),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addSectionItemExample(gIdx: number, secIdx: number, itemIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) => {
            if (j !== secIdx) return s
            return {
              ...s,
              items: s.items.map((it, k) =>
                k === itemIdx ? { ...it, examples: [...it.examples, emptyExample(it.examples.length + 1)] } : it
              ),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function removeSectionItemExample(gIdx: number, secIdx: number, itemIdx: number, eIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) => {
            if (j !== secIdx) return s
            return {
              ...s,
              items: s.items.map((it, k) =>
                k === itemIdx ? { ...it, examples: it.examples.filter((_, m) => m !== eIdx) } : it
              ),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function updateSubPoint(gIdx: number, spIdx: number, patch: Partial<GrammarSubPoint>) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return { ...g, subPoints: g.subPoints.map((sp, j) => (j === spIdx ? { ...sp, ...patch } : sp)) }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addSubPoint(gIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) =>
        i === gIdx ? { ...g, subPoints: [...g.subPoints, emptySubPoint(g.subPoints.length + 1)] } : g
      )
      return { ...prev, grammarPoints }
    })
  }

  function removeSubPoint(gIdx: number, spIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) =>
        i === gIdx ? { ...g, subPoints: g.subPoints.filter((_, j) => j !== spIdx) } : g
      )
      return { ...prev, grammarPoints }
    })
  }

  function updateSubPointSection(gIdx: number, spIdx: number, secIdx: number, patch: Partial<GrammarSection>) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return { ...sp, sections: sp.sections.map((s, k) => (k === secIdx ? { ...s, ...patch } : s)) }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addSubPointSection(gIdx: number, spIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) =>
            j === spIdx ? { ...sp, sections: [...sp.sections, emptySection(sp.sections.length + 1)] } : sp
          ),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function removeSubPointSection(gIdx: number, spIdx: number, secIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) =>
            j === spIdx ? { ...sp, sections: sp.sections.filter((_, k) => k !== secIdx) } : sp
          ),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function updateSubPointSectionExample(
    gIdx: number,
    spIdx: number,
    secIdx: number,
    eIdx: number,
    patch: Partial<GrammarExample>
  ) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) => {
                if (k !== secIdx) return s
                return { ...s, examples: s.examples.map((e, m) => (m === eIdx ? { ...e, ...patch } : e)) }
              }),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addSubPointSectionExample(gIdx: number, spIdx: number, secIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) =>
                k === secIdx ? { ...s, examples: [...s.examples, emptyExample(s.examples.length + 1)] } : s
              ),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function removeSubPointSectionExample(gIdx: number, spIdx: number, secIdx: number, eIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) =>
                k === secIdx ? { ...s, examples: s.examples.filter((_, m) => m !== eIdx) } : s
              ),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function updateSubPointSectionItem(
    gIdx: number,
    spIdx: number,
    secIdx: number,
    itemIdx: number,
    patch: Partial<GrammarSectionItem>
  ) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) => {
                if (k !== secIdx) return s
                return { ...s, items: s.items.map((it, m) => (m === itemIdx ? { ...it, ...patch } : it)) }
              }),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addSubPointSectionItem(gIdx: number, spIdx: number, secIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) =>
                k === secIdx ? { ...s, items: [...s.items, emptySectionItem(s.items.length + 1)] } : s
              ),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function removeSubPointSectionItem(gIdx: number, spIdx: number, secIdx: number, itemIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) =>
                k === secIdx ? { ...s, items: s.items.filter((_, m) => m !== itemIdx) } : s
              ),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function updateSubPointSectionItemExample(
    gIdx: number,
    spIdx: number,
    secIdx: number,
    itemIdx: number,
    eIdx: number,
    patch: Partial<GrammarExample>
  ) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) => {
                if (k !== secIdx) return s
                return {
                  ...s,
                  items: s.items.map((it, m) => {
                    if (m !== itemIdx) return it
                    return { ...it, examples: it.examples.map((e, n) => (n === eIdx ? { ...e, ...patch } : e)) }
                  }),
                }
              }),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function addSubPointSectionItemExample(gIdx: number, spIdx: number, secIdx: number, itemIdx: number) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) => {
                if (k !== secIdx) return s
                return {
                  ...s,
                  items: s.items.map((it, m) =>
                    m === itemIdx
                      ? { ...it, examples: [...it.examples, emptyExample(it.examples.length + 1)] }
                      : it
                  ),
                }
              }),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function removeSubPointSectionItemExample(
    gIdx: number,
    spIdx: number,
    secIdx: number,
    itemIdx: number,
    eIdx: number
  ) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) => {
                if (k !== secIdx) return s
                return {
                  ...s,
                  items: s.items.map((it, m) =>
                    m === itemIdx ? { ...it, examples: it.examples.filter((_, n) => n !== eIdx) } : it
                  ),
                }
              }),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  // --- Reordering (shared moveItem helper renumbers `order` for us) ---

  function moveDialogueLine(dIdx: number, lIdx: number, direction: -1 | 1) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, lines: moveItem(d.lines, lIdx, direction) } : d
      )
      return { ...prev, dialogues }
    })
  }

  function moveVocab(dIdx: number, vIdx: number, direction: -1 | 1) {
    setData((prev) => {
      if (!prev) return prev
      const dialogues = prev.dialogues.map((d, i) =>
        i === dIdx ? { ...d, vocabulary: moveItem(d.vocabulary, vIdx, direction) } : d
      )
      return { ...prev, dialogues }
    })
  }

  function moveSection(gIdx: number, secIdx: number, direction: -1 | 1) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) =>
        i === gIdx ? { ...g, sections: moveItem(g.sections, secIdx, direction) } : g
      )
      return { ...prev, grammarPoints }
    })
  }

  function moveSectionExample(gIdx: number, secIdx: number, eIdx: number, direction: -1 | 1) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) =>
            j === secIdx ? { ...s, examples: moveItem(s.examples, eIdx, direction) } : s
          ),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function moveSectionItem(gIdx: number, secIdx: number, itemIdx: number, direction: -1 | 1) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) =>
            j === secIdx ? { ...s, items: moveItem(s.items, itemIdx, direction) } : s
          ),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function moveSectionItemExample(
    gIdx: number,
    secIdx: number,
    itemIdx: number,
    eIdx: number,
    direction: -1 | 1
  ) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          sections: g.sections.map((s, j) => {
            if (j !== secIdx) return s
            return {
              ...s,
              items: s.items.map((it, m) =>
                m === itemIdx ? { ...it, examples: moveItem(it.examples, eIdx, direction) } : it
              ),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function moveSubPointSection(gIdx: number, spIdx: number, secIdx: number, direction: -1 | 1) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) =>
            j === spIdx ? { ...sp, sections: moveItem(sp.sections, secIdx, direction) } : sp
          ),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function moveSubPointSectionExample(
    gIdx: number,
    spIdx: number,
    secIdx: number,
    eIdx: number,
    direction: -1 | 1
  ) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) =>
                k === secIdx ? { ...s, examples: moveItem(s.examples, eIdx, direction) } : s
              ),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function moveSubPointSectionItem(
    gIdx: number,
    spIdx: number,
    secIdx: number,
    itemIdx: number,
    direction: -1 | 1
  ) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) =>
                k === secIdx ? { ...s, items: moveItem(s.items, itemIdx, direction) } : s
              ),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  function moveSubPointSectionItemExample(
    gIdx: number,
    spIdx: number,
    secIdx: number,
    itemIdx: number,
    eIdx: number,
    direction: -1 | 1
  ) {
    setData((prev) => {
      if (!prev) return prev
      const grammarPoints = prev.grammarPoints.map((g, i) => {
        if (i !== gIdx) return g
        return {
          ...g,
          subPoints: g.subPoints.map((sp, j) => {
            if (j !== spIdx) return sp
            return {
              ...sp,
              sections: sp.sections.map((s, k) => {
                if (k !== secIdx) return s
                return {
                  ...s,
                  items: s.items.map((it, m) =>
                    m === itemIdx ? { ...it, examples: moveItem(it.examples, eIdx, direction) } : it
                  ),
                }
              }),
            }
          }),
        }
      })
      return { ...prev, grammarPoints }
    })
  }

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </main>
    )
  }

  if (loadError || !data) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p role="alert" className="text-sm text-destructive">
          {loadError ?? "Không tìm thấy bài học."}
        </p>
      </main>
    )
  }

  // The page is viewable at any status; every mutating control below is gated
  // on draft instead, so a published lesson can be read (and its audio played)
  // without first being sent back to draft.
  const isEditable = data.status === "draft"
  const dialogueLabels = dialogueDisplayNames(data.dialogues)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 pb-16">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Sửa Bài {data.lessonNo}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-status-success">Đã lưu.</p>}
          <Button variant="outline" nativeButton={false} onClick={() => router.push(`/lessons/${lessonId}`)}>
            Quay lại
          </Button>
          {isEditable && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Đang lưu..." : "Lưu"}
            </Button>
          )}
        </div>
      </div>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 border-b pb-3 text-base font-semibold text-foreground">Thông tin bài học</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Tiêu đề (Trung)
            </Label>
            <EditableText
              value={data.titleZh}
              onChange={(titleZh) => updateLesson({ titleZh })}
              placeholder="Tiêu đề bài học (chữ Hán)"
              className="text-lg font-semibold text-foreground"
              disabled={!isEditable}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Tiêu đề (Việt)
            </Label>
            <EditableText
              value={data.titleVi}
              onChange={(titleVi) => updateLesson({ titleVi })}
              placeholder="Tiêu đề bài học (tiếng Việt)"
              className="text-lg font-semibold text-foreground"
              disabled={!isEditable}
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Chủ đề
            </Label>
            <EditableText
              value={data.theme ?? ""}
              onChange={(theme) => updateLesson({ theme: theme || null })}
              placeholder="Chủ đề của bài"
              className="text-base text-foreground/90"
              disabled={!isEditable}
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Mục tiêu
            </Label>
            {isEditable && (
              <button
                type="button"
                onClick={addObjective}
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                + Thêm mục tiêu
              </button>
            )}
          </div>
          <div className="flex flex-col divide-y divide-border/60">
            {data.objectives.map((objective, idx) => (
              <div
                key={idx}
                className="group/objective relative flex items-center gap-2 rounded-md p-1.5 -mx-1.5 transition-colors has-[[data-danger]:hover]:bg-destructive/5"
              >
                <EditableText
                  value={objective}
                  onChange={(v) => updateObjective(idx, v)}
                  className="text-base text-foreground/90"
                  disabled={!isEditable}
                />
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => removeObjective(idx)}
                    aria-label="Xoá mục tiêu"
                    data-danger
                    className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/objective:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {data.objectives.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có mục tiêu nào.</p>
            )}
          </div>
        </div>
      </section>

      <Tabs defaultValue="dialogues">
        <TabsList>
          <TabsIndicator />
          <TabsTab value="dialogues">Bài khoá ({data.dialogues.length})</TabsTab>
          <TabsTab value="vocabulary">
            Từ vựng ({data.dialogues.reduce((sum, d) => sum + d.vocabulary.length, 0)})
          </TabsTab>
          <TabsTab value="grammar">Ngữ pháp ({data.grammarPoints.length})</TabsTab>
          <TabsTab value="audio">Audio</TabsTab>
          <TabsTab value="quiz">Quiz</TabsTab>
        </TabsList>

        <TabsPanel value="dialogues">
        <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <h2 className="text-base font-semibold text-foreground">Bài khoá ({data.dialogues.length})</h2>
          {isEditable && (
            <Button type="button" variant="ghost" size="sm" onClick={addDialogue}>
              + Thêm hội thoại
            </Button>
          )}
        </div>
        <Accordion className="flex flex-col gap-3">
          {data.dialogues.map((dialogue, dIdx) => (
            <AccordionItem key={dialogue.id} value={dialogue.id} className="rounded-lg border bg-card px-4">
              <AccordionTrigger className="pr-10">
                <div className="w-full text-left">
                  <p className="text-lg font-bold text-foreground">{dialogueLabels[dIdx]}</p>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span>Mã audio:</span>
                    <EditableText
                      value={dialogue.audioCode ?? ""}
                      onChange={(v) => updateDialogue(dIdx, { audioCode: v || null })}
                      placeholder="—"
                      className="w-auto"
                      disabled={!isEditable}
                    />
                  </div>

                  {dialogue.audioUrl && (
                    <audio controls preload="none" src={dialogue.audioUrl} className="h-8 w-full max-w-sm" />
                  )}

                  <div className="flex flex-col gap-1 divide-y divide-border/60">
                    {dialogue.lines.map((line, lIdx) => (
                      <DialogueLineBlock
                        key={line.id}
                        kind={dialogue.kind}
                        speakerZh={line.speakerZh}
                        speakerPinyin={line.speakerPinyin}
                        textZh={line.textZh}
                        pinyin={line.pinyin}
                        translationVi={line.translationVi}
                        onChangeSpeakerZh={(v) => updateDialogueLine(dIdx, lIdx, { speakerZh: v })}
                        onChangeSpeakerPinyin={(v) => updateDialogueLine(dIdx, lIdx, { speakerPinyin: v })}
                        onChangeTextZh={(v) => updateDialogueLine(dIdx, lIdx, { textZh: v })}
                        onChangePinyin={(v) => updateDialogueLine(dIdx, lIdx, { pinyin: v })}
                        onChangeTranslationVi={(v) => updateDialogueLine(dIdx, lIdx, { translationVi: v })}
                        onRemove={() => removeDialogueLine(dIdx, lIdx)}
                        onMoveUp={() => moveDialogueLine(dIdx, lIdx, -1)}
                        onMoveDown={() => moveDialogueLine(dIdx, lIdx, 1)}
                        canMoveUp={lIdx > 0}
                        canMoveDown={lIdx < dialogue.lines.length - 1}
                        disabled={!isEditable}
                      />
                    ))}
                    {isEditable && (
                      <button
                        type="button"
                        onClick={() => addDialogueLine(dIdx)}
                        className="self-start pt-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                      >
                        + Thêm câu {dialogue.kind === "passage" ? "văn" : "thoại"}
                      </button>
                    )}
                  </div>

                  {isEditable && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeDialogue(dIdx)}
                      >
                        Xoá {dialogue.kind === "passage" ? "đoạn văn" : "hội thoại"}
                      </Button>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {data.dialogues.length === 0 && <p className="text-xs text-muted-foreground">Chưa có hội thoại nào.</p>}
        </div>
        </TabsPanel>

        <TabsPanel value="vocabulary">
        <div className="flex flex-col gap-5 rounded-lg border bg-card p-6">
          {data.dialogues.map((dialogue, dIdx) => (
            <div key={dialogue.id} className="rounded-xl border border-dashed p-4">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-sm font-semibold text-foreground">
                  {dialogueLabels[dIdx]} · Từ mới ({dialogue.vocabulary.length})
                </Label>
              </div>
              <div className="flex flex-col divide-y divide-border/60">
                {dialogue.vocabulary.map((vocab, vIdx) => (
                  <VocabRow
                    key={vocab.id}
                    wordZh={vocab.wordZh}
                    pinyin={vocab.pinyin}
                    meaningVi={vocab.meaningVi}
                    onChangeWordZh={(v) => updateVocab(dIdx, vIdx, { wordZh: v })}
                    onChangePinyin={(v) => updateVocab(dIdx, vIdx, { pinyin: v })}
                    onChangeMeaningVi={(v) => updateVocab(dIdx, vIdx, { meaningVi: v })}
                    onRemove={() => removeVocab(dIdx, vIdx)}
                    onMoveUp={() => moveVocab(dIdx, vIdx, -1)}
                    onMoveDown={() => moveVocab(dIdx, vIdx, 1)}
                    canMoveUp={vIdx > 0}
                    canMoveDown={vIdx < dialogue.vocabulary.length - 1}
                    disabled={!isEditable}
                  />
                ))}
                {dialogue.vocabulary.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa có từ mới nào.</p>
                )}
              </div>
              {isEditable && (
                <button
                  type="button"
                  onClick={() => addVocab(dIdx)}
                  className="mt-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  + Thêm từ
                </button>
              )}
            </div>
          ))}
          {data.dialogues.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có hội thoại nào để thêm từ vựng.</p>
          )}
        </div>
        </TabsPanel>

        <TabsPanel value="grammar">
        <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <h2 className="text-base font-semibold text-foreground">Ngữ pháp ({data.grammarPoints.length})</h2>
          {isEditable && (
            <Button type="button" variant="ghost" size="sm" onClick={addGrammar}>
              + Thêm điểm ngữ pháp
            </Button>
          )}
        </div>

        <Accordion className="flex flex-col gap-3">
          {data.grammarPoints.map((point, gIdx) => (
            <AccordionItem
              key={point.id}
              value={point.id}
              className="group/point relative rounded-lg border bg-card px-4 transition-colors has-[>div>[data-danger]:hover]:border-destructive has-[>div>[data-danger]:hover]:bg-destructive/5"
            >
              {isEditable && (
                <div className="absolute top-3 right-3 z-10">
                  <BlockActions
                    onRemove={() => removeGrammar(gIdx)}
                    removeLabel="Xoá điểm ngữ pháp"
                    className="group-hover/point:opacity-100"
                  />
                </div>
              )}

              <AccordionTrigger className="pr-10">
                <div className="w-full text-left">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Ngữ pháp {gIdx + 1}
                  </p>
                  <EditableText
                    value={point.titleVi ?? ""}
                    onChange={(titleVi) => updateGrammar(gIdx, { titleVi: titleVi || null })}
                    placeholder="Tiêu đề điểm ngữ pháp"
                    className="text-xl font-bold text-foreground"
                    disabled={!isEditable}
                  />
                </div>
              </AccordionTrigger>

              <AccordionContent className="pb-4">

              {point.subPoints.length === 0 && (
                <div className="flex flex-col gap-6 border-l-2 border-border/60 pl-4">
                  {point.sections.map((section, secIdx) => (
                    <SectionBlock
                      key={section.id}
                      section={section}
                      canMoveUp={secIdx > 0}
                      canMoveDown={secIdx < point.sections.length - 1}
                      onChangeSection={(patch) => updateSection(gIdx, secIdx, patch)}
                      onRemoveSection={() => removeSection(gIdx, secIdx)}
                      onMoveSection={(dir) => moveSection(gIdx, secIdx, dir)}
                      onChangeExample={(eIdx, patch) => updateSectionExample(gIdx, secIdx, eIdx, patch)}
                      onRemoveExample={(eIdx) => removeSectionExample(gIdx, secIdx, eIdx)}
                      onMoveExample={(eIdx, dir) => moveSectionExample(gIdx, secIdx, eIdx, dir)}
                      onAddExample={() => addSectionExample(gIdx, secIdx)}
                      onChangeItem={(itemIdx, patch) => updateSectionItem(gIdx, secIdx, itemIdx, patch)}
                      onRemoveItem={(itemIdx) => removeSectionItem(gIdx, secIdx, itemIdx)}
                      onMoveItem={(itemIdx, dir) => moveSectionItem(gIdx, secIdx, itemIdx, dir)}
                      onAddItem={() => addSectionItem(gIdx, secIdx)}
                      onChangeItemExample={(itemIdx, eIdx, patch) =>
                        updateSectionItemExample(gIdx, secIdx, itemIdx, eIdx, patch)
                      }
                      onRemoveItemExample={(itemIdx, eIdx) =>
                        removeSectionItemExample(gIdx, secIdx, itemIdx, eIdx)
                      }
                      onMoveItemExample={(itemIdx, eIdx, dir) =>
                        moveSectionItemExample(gIdx, secIdx, itemIdx, eIdx, dir)
                      }
                      onAddItemExample={(itemIdx) => addSectionItemExample(gIdx, secIdx, itemIdx)}
                      disabled={!isEditable}
                    />
                  ))}
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => addSection(gIdx)}
                      className="self-start text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      + Thêm đề mục
                    </button>
                  )}
                </div>
              )}

              {point.subPoints.length > 0 && (
                <div className="flex flex-col gap-8">
                  {point.subPoints.map((sub, spIdx) => (
                    <div
                      key={sub.id}
                      className="group/sub relative rounded-md p-2 -m-2 transition-colors has-[>div>[data-danger]:hover]:bg-destructive/5 has-[>div>[data-danger]:hover]:outline-1 has-[>div>[data-danger]:hover]:outline-destructive/40"
                    >
                      {isEditable && (
                        <div className="absolute top-2 right-2">
                          <BlockActions
                            onRemove={() => removeSubPoint(gIdx, spIdx)}
                            removeLabel="Xoá đề mục con"
                            className="group-hover/sub:opacity-100"
                          />
                        </div>
                      )}
                      <div className="mb-3 flex items-baseline gap-2">
                        <EditableText
                          value={sub.label}
                          onChange={(label) => updateSubPoint(gIdx, spIdx, { label })}
                          placeholder="A"
                          className="w-10 shrink-0 text-lg font-bold text-foreground"
                          disabled={!isEditable}
                        />
                        <EditableText
                          value={sub.titleVi ?? ""}
                          onChange={(titleVi) => updateSubPoint(gIdx, spIdx, { titleVi: titleVi || null })}
                          placeholder="Tiêu đề đề mục con"
                          className="text-lg font-semibold text-foreground"
                          disabled={!isEditable}
                        />
                      </div>
                      <div className="flex flex-col gap-6 border-l-2 border-border/60 pl-4">
                        {sub.sections.map((section, secIdx) => (
                          <SectionBlock
                            key={section.id}
                            section={section}
                            canMoveUp={secIdx > 0}
                            canMoveDown={secIdx < sub.sections.length - 1}
                            onChangeSection={(patch) => updateSubPointSection(gIdx, spIdx, secIdx, patch)}
                            onRemoveSection={() => removeSubPointSection(gIdx, spIdx, secIdx)}
                            onMoveSection={(dir) => moveSubPointSection(gIdx, spIdx, secIdx, dir)}
                            onChangeExample={(eIdx, patch) =>
                              updateSubPointSectionExample(gIdx, spIdx, secIdx, eIdx, patch)
                            }
                            onRemoveExample={(eIdx) =>
                              removeSubPointSectionExample(gIdx, spIdx, secIdx, eIdx)
                            }
                            onMoveExample={(eIdx, dir) =>
                              moveSubPointSectionExample(gIdx, spIdx, secIdx, eIdx, dir)
                            }
                            onAddExample={() => addSubPointSectionExample(gIdx, spIdx, secIdx)}
                            onChangeItem={(itemIdx, patch) =>
                              updateSubPointSectionItem(gIdx, spIdx, secIdx, itemIdx, patch)
                            }
                            onRemoveItem={(itemIdx) =>
                              removeSubPointSectionItem(gIdx, spIdx, secIdx, itemIdx)
                            }
                            onMoveItem={(itemIdx, dir) =>
                              moveSubPointSectionItem(gIdx, spIdx, secIdx, itemIdx, dir)
                            }
                            onAddItem={() => addSubPointSectionItem(gIdx, spIdx, secIdx)}
                            onChangeItemExample={(itemIdx, eIdx, patch) =>
                              updateSubPointSectionItemExample(gIdx, spIdx, secIdx, itemIdx, eIdx, patch)
                            }
                            onRemoveItemExample={(itemIdx, eIdx) =>
                              removeSubPointSectionItemExample(gIdx, spIdx, secIdx, itemIdx, eIdx)
                            }
                            onMoveItemExample={(itemIdx, eIdx, dir) =>
                              moveSubPointSectionItemExample(gIdx, spIdx, secIdx, itemIdx, eIdx, dir)
                            }
                            onAddItemExample={(itemIdx) =>
                              addSubPointSectionItemExample(gIdx, spIdx, secIdx, itemIdx)
                            }
                            disabled={!isEditable}
                          />
                        ))}
                        {isEditable && (
                          <button
                            type="button"
                            onClick={() => addSubPointSection(gIdx, spIdx)}
                            className="self-start text-sm text-muted-foreground hover:text-foreground hover:underline"
                          >
                            + Thêm đề mục
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isEditable && (
                <button
                  type="button"
                  onClick={() => addSubPoint(gIdx)}
                  className="mt-4 text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  + Thêm đề mục con (A/B/C...)
                </button>
              )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {data.grammarPoints.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có điểm ngữ pháp nào.</p>
        )}
        </div>
        </TabsPanel>

        <TabsPanel value="audio">
        <div className="flex flex-col gap-5 rounded-lg border bg-card p-6">
          {isEditable && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <label className="text-sm font-medium text-foreground" htmlFor="audio-voice">
                Giọng đọc
              </label>
              <select
                id="audio-voice"
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={audioVoice}
                onChange={(e) => setAudioVoice(e.target.value as TtsVoice)}
                disabled={isGeneratingAudio}
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={handleGenerateMissingAudio} disabled={isGeneratingAudio}>
                {isGeneratingAudio ? "Đang sinh..." : "Sinh audio còn thiếu"}
              </Button>
              <Button type="button" variant="outline" onClick={handleRegenerateAllAudio} disabled={isGeneratingAudio}>
                Sinh lại toàn bộ
              </Button>
            </div>
          )}

          {audioActionError && <p className="text-sm text-destructive">{audioActionError}</p>}

          {data.dialogues.map((dialogue, dIdx) => (
            <div key={dialogue.id} className="rounded-xl border border-dashed p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">
                {dialogueLabels[dIdx]} · Từ mới ({dialogue.vocabulary.length})
              </p>
              <div className="flex flex-col divide-y divide-border/60">
                {dialogue.vocabulary.map((vocab) => (
                  <div key={vocab.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="field-zh">{vocab.wordZh}</p>
                      <p className="text-xs text-muted-foreground">{vocab.meaningVi}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {vocab.audioUrl ? (
                        <audio controls preload="none" src={vocab.audioUrl} className="h-8 max-w-[12rem]" />
                      ) : (
                        <span className="text-xs text-muted-foreground">Chưa có audio</span>
                      )}
                      {isEditable && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenerateOneAudio(vocab.id)}
                          disabled={isGeneratingAudio || regeneratingAudioId === vocab.id}
                        >
                          {regeneratingAudioId === vocab.id ? "Đang tạo..." : "Tạo lại"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {dialogue.vocabulary.length === 0 && (
                  <p className="text-xs text-muted-foreground">Chưa có từ mới nào.</p>
                )}
              </div>
            </div>
          ))}
          {data.dialogues.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có hội thoại/từ vựng nào.</p>
          )}
        </div>
        </TabsPanel>
      </Tabs>
    </main>
  )
}
