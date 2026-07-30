"use client"

import { EditableText } from "@/components/editable-text"
import { BlockActions } from "@/components/block-actions"

interface VocabRowProps {
  wordZh: string
  pinyin: string | null
  meaningVi: string | null
  audioUrl?: string | null
  onChangeWordZh: (wordZh: string) => void
  onChangePinyin: (pinyin: string | null) => void
  onChangeMeaningVi: (meaningVi: string | null) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  /** Read-only mode: fields can't be opened and the move/delete controls are hidden. */
  disabled?: boolean
}

// One vocabulary word as a single reading line (Hán tự - pinyin - nghĩa),
// replacing the 4-column input grid that cramped meaningVi and made the
// whole word list read as a wall of boxes rather than a word list.
export function VocabRow({
  wordZh,
  pinyin,
  meaningVi,
  audioUrl,
  onChangeWordZh,
  onChangePinyin,
  onChangeMeaningVi,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  disabled = false,
}: VocabRowProps) {
  return (
    <div className="group/vocab relative grid grid-cols-[6rem_6rem_1fr_auto] items-baseline gap-x-3 rounded-md border-b border-border/60 p-2 -mx-2 transition-colors last:border-b-0 has-[>div>[data-danger]:hover]:bg-destructive/5 has-[>div>[data-danger]:hover]:outline-1 has-[>div>[data-danger]:hover]:outline-destructive/40">
      <EditableText
        value={wordZh}
        onChange={onChangeWordZh}
        placeholder="Từ (chữ Hán)"
        className="text-lg font-semibold text-foreground"
        disabled={disabled}
      />
      <EditableText
        value={pinyin ?? ""}
        onChange={(v) => onChangePinyin(v || null)}
        placeholder="Pinyin"
        className="text-sm text-muted-foreground"
        disabled={disabled}
      />
      <EditableText
        value={meaningVi ?? ""}
        onChange={(v) => onChangeMeaningVi(v || null)}
        placeholder="Nghĩa tiếng Việt"
        className="text-base text-foreground/80"
        disabled={disabled}
      />
      <div className="flex items-center gap-2">
        {audioUrl && <audio controls preload="none" src={audioUrl} className="h-7 max-w-[9rem]" />}
        {!disabled && (
          <BlockActions
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            removeLabel="Xoá từ"
            className="opacity-0 group-hover/vocab:opacity-100"
          />
        )}
      </div>
    </div>
  )
}
