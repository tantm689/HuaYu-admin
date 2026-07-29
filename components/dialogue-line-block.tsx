"use client"

import { EditableText } from "@/components/editable-text"
import { BlockActions } from "@/components/block-actions"

interface DialogueLineBlockProps {
  kind: "dialogue" | "passage"
  speakerZh: string | null
  speakerPinyin: string | null
  textZh: string
  pinyin: string | null
  translationVi: string | null
  audioUrl?: string | null
  onChangeSpeakerZh: (value: string | null) => void
  onChangeSpeakerPinyin: (value: string | null) => void
  onChangeTextZh: (value: string) => void
  onChangePinyin: (value: string | null) => void
  onChangeTranslationVi: (value: string | null) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

// One dialogue/passage line rendered as reading text (speaker label, Hán tự,
// pinyin, Vietnamese), matching the read-only lesson page instead of a form
// card full of input boxes.
export function DialogueLineBlock({
  kind,
  speakerZh,
  speakerPinyin,
  textZh,
  pinyin,
  translationVi,
  audioUrl,
  onChangeSpeakerZh,
  onChangeSpeakerPinyin,
  onChangeTextZh,
  onChangePinyin,
  onChangeTranslationVi,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: DialogueLineBlockProps) {
  return (
    <div className="group/line relative border-b border-border/60 p-3 pr-16 -mx-1 transition-colors last:border-b-0 has-[>div>[data-danger]:hover]:bg-destructive/5 has-[>div>[data-danger]:hover]:outline-1 has-[>div>[data-danger]:hover]:outline-destructive/40">
      <div className="absolute top-2 right-2">
        <BlockActions
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          removeLabel={kind === "passage" ? "Xoá câu" : "Xoá câu thoại"}
          className="group-hover/line:opacity-100"
        />
      </div>

      {kind === "dialogue" && (
        <div className="mb-2 inline-grid grid-cols-[6rem_6rem] items-baseline rounded-md bg-muted/50 px-2 py-1">
          <EditableText
            value={speakerZh ?? ""}
            onChange={(v) => onChangeSpeakerZh(v || null)}
            placeholder="Người nói"
            className="text-xs font-semibold text-foreground/80"
          />
          <EditableText
            value={speakerPinyin ?? ""}
            onChange={(v) => onChangeSpeakerPinyin(v || null)}
            placeholder="pinyin"
            className="text-xs text-muted-foreground"
          />
        </div>
      )}
      <EditableText
        value={textZh}
        onChange={onChangeTextZh}
        placeholder={kind === "passage" ? "Câu văn (chữ Hán)" : "Câu thoại (chữ Hán)"}
        className="text-xl leading-snug font-semibold text-foreground"
      />
      <EditableText
        value={pinyin ?? ""}
        onChange={(v) => onChangePinyin(v || null)}
        placeholder="Pinyin"
        className="text-sm text-muted-foreground"
      />
      <EditableText
        value={translationVi ?? ""}
        onChange={(v) => onChangeTranslationVi(v || null)}
        placeholder="Nghĩa tiếng Việt"
        className="text-base text-foreground/80"
      />
      {audioUrl && <audio controls preload="none" src={audioUrl} className="mt-1 h-8 w-full max-w-sm" />}
    </div>
  )
}
