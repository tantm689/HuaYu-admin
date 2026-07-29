"use client"

import { EditableText } from "@/components/editable-text"
import { BlockActions } from "@/components/block-actions"

// The grammar editor renders the same shape at four nesting depths (point ->
// section -> numbered item -> example, plus the sub-point branch), which used
// to be four hand-written copies of near-identical JSX per page, in two pages.
// These components take plain data + callbacks so both the job-review page
// (index-keyed raw_json) and the lesson editor (id-keyed DB rows) can share
// them without either owning the other's state shape.

export interface ExampleData {
  textZh: string
  pinyin: string | null
  translationVi: string | null
}

export interface SectionItemData {
  label: string
  content: string | null
  examples: ExampleData[]
}

export interface SectionData extends SectionItemData {
  items: SectionItemData[]
}

// Only the text fields are editable through this UI; `examples`/`items` are
// restructured through the dedicated add/remove/move callbacks instead, so
// patches never carry them. Keeping the patch type narrow lets callers pass
// their own richer row types (which also carry `order`, and `id` in the
// lesson editor) without a structural mismatch.
type TextPatch = Partial<Pick<SectionItemData, "label" | "content">>
type ExamplePatch = Partial<Pick<ExampleData, "textZh" | "pinyin" | "translationVi">>

interface ExampleBlockProps {
  example: ExampleData
  onChange: (patch: ExamplePatch) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

function ExampleBlock({
  example,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: ExampleBlockProps) {
  return (
    <div className="group/example relative rounded-r-md border-l-2 border-border py-1 pl-4 transition-colors has-[>div>[data-danger]:hover]:border-destructive has-[>div>[data-danger]:hover]:bg-destructive/5">
      <div className="absolute top-1 right-0">
        <BlockActions
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          removeLabel="Xoá ví dụ"
          className="group-hover/example:opacity-100"
        />
      </div>
      <EditableText
        value={example.textZh}
        onChange={(textZh) => onChange({ textZh })}
        placeholder="Câu ví dụ (chữ Hán)"
        className="text-lg leading-relaxed font-medium text-foreground"
      />
      <EditableText
        value={example.pinyin ?? ""}
        onChange={(pinyin) => onChange({ pinyin: pinyin || null })}
        placeholder="Pinyin"
        className="text-sm text-muted-foreground"
      />
      <EditableText
        value={example.translationVi ?? ""}
        onChange={(translationVi) => onChange({ translationVi: translationVi || null })}
        placeholder="Nghĩa tiếng Việt"
        className="text-base text-foreground/80"
      />
    </div>
  )
}

interface ExampleListProps {
  examples: ExampleData[]
  onChangeExample: (eIdx: number, patch: ExamplePatch) => void
  onRemoveExample: (eIdx: number) => void
  onMoveExample: (eIdx: number, direction: -1 | 1) => void
  onAddExample: () => void
}

function ExampleList({
  examples,
  onChangeExample,
  onRemoveExample,
  onMoveExample,
  onAddExample,
}: ExampleListProps) {
  return (
    <div className="flex flex-col gap-3">
      {examples.map((example, eIdx) => (
        <ExampleBlock
          key={eIdx}
          example={example}
          onChange={(patch) => onChangeExample(eIdx, patch)}
          onRemove={() => onRemoveExample(eIdx)}
          onMoveUp={() => onMoveExample(eIdx, -1)}
          onMoveDown={() => onMoveExample(eIdx, 1)}
          canMoveUp={eIdx > 0}
          canMoveDown={eIdx < examples.length - 1}
        />
      ))}
      <button
        type="button"
        onClick={onAddExample}
        className="self-start text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        + Thêm ví dụ
      </button>
    </div>
  )
}

export interface SectionBlockProps {
  section: SectionData
  /** Heading level within the document outline: sections sit under a point. */
  onChangeSection: (patch: TextPatch) => void
  onRemoveSection: () => void
  onMoveSection: (direction: -1 | 1) => void
  canMoveUp: boolean
  canMoveDown: boolean

  onChangeExample: (eIdx: number, patch: ExamplePatch) => void
  onRemoveExample: (eIdx: number) => void
  onMoveExample: (eIdx: number, direction: -1 | 1) => void
  onAddExample: () => void

  onChangeItem: (itemIdx: number, patch: TextPatch) => void
  onRemoveItem: (itemIdx: number) => void
  onMoveItem: (itemIdx: number, direction: -1 | 1) => void
  onAddItem: () => void
  onChangeItemExample: (itemIdx: number, eIdx: number, patch: ExamplePatch) => void
  onRemoveItemExample: (itemIdx: number, eIdx: number) => void
  onMoveItemExample: (itemIdx: number, eIdx: number, direction: -1 | 1) => void
  onAddItemExample: (itemIdx: number) => void
}

export function SectionBlock({
  section,
  onChangeSection,
  onRemoveSection,
  onMoveSection,
  canMoveUp,
  canMoveDown,
  onChangeExample,
  onRemoveExample,
  onMoveExample,
  onAddExample,
  onChangeItem,
  onRemoveItem,
  onMoveItem,
  onAddItem,
  onChangeItemExample,
  onRemoveItemExample,
  onMoveItemExample,
  onAddItemExample,
}: SectionBlockProps) {
  return (
    <section className="group/section relative rounded-md p-2 -m-2 transition-colors has-[>div>[data-danger]:hover]:bg-destructive/5 has-[>div>[data-danger]:hover]:outline-1 has-[>div>[data-danger]:hover]:outline-destructive/40">
      <div className="absolute top-2 right-2">
        <BlockActions
          onMoveUp={() => onMoveSection(-1)}
          onMoveDown={() => onMoveSection(1)}
          onRemove={onRemoveSection}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          removeLabel="Xoá đề mục"
          className="group-hover/section:opacity-100"
        />
      </div>

      <EditableText
        value={section.label}
        onChange={(label) => onChangeSection({ label })}
        placeholder="Nhãn đề mục (Chức năng, Cấu trúc, Cách dùng...)"
        className="text-sm font-semibold tracking-wide text-foreground uppercase"
      />
      <EditableText
        value={section.content ?? ""}
        onChange={(content) => onChangeSection({ content: content || null })}
        placeholder="Nội dung giải thích"
        className="mt-1 text-base leading-relaxed text-foreground/90"
      />

      {(section.examples.length > 0 || section.items.length === 0) && (
        <div className="mt-3 ml-2">
          <ExampleList
            examples={section.examples}
            onChangeExample={onChangeExample}
            onRemoveExample={onRemoveExample}
            onMoveExample={onMoveExample}
            onAddExample={onAddExample}
          />
        </div>
      )}

      <div className="mt-4 ml-2 flex flex-col gap-4">
        {section.items.map((item, itemIdx) => (
          <div
            key={itemIdx}
            className="group/item relative rounded-md p-2 -m-2 transition-colors has-[>div>[data-danger]:hover]:bg-destructive/5 has-[>div>[data-danger]:hover]:outline-1 has-[>div>[data-danger]:hover]:outline-destructive/40"
          >
            <div className="absolute top-2 right-2">
              <BlockActions
                onMoveUp={() => onMoveItem(itemIdx, -1)}
                onMoveDown={() => onMoveItem(itemIdx, 1)}
                onRemove={() => onRemoveItem(itemIdx)}
                canMoveUp={itemIdx > 0}
                canMoveDown={itemIdx < section.items.length - 1}
                removeLabel="Xoá ý"
                className="group-hover/item:opacity-100"
              />
            </div>
            <div className="flex items-baseline gap-2">
              <EditableText
                value={item.label}
                onChange={(label) => onChangeItem(itemIdx, { label })}
                placeholder="1"
                className="w-10 shrink-0 text-base font-semibold text-foreground"
              />
              <EditableText
                value={item.content ?? ""}
                onChange={(content) => onChangeItem(itemIdx, { content: content || null })}
                placeholder="Nội dung của ý này"
                className="text-base leading-relaxed text-foreground/90"
              />
            </div>
            <div className="mt-2 ml-10">
              <ExampleList
                examples={item.examples}
                onChangeExample={(eIdx, patch) => onChangeItemExample(itemIdx, eIdx, patch)}
                onRemoveExample={(eIdx) => onRemoveItemExample(itemIdx, eIdx)}
                onMoveExample={(eIdx, direction) => onMoveItemExample(itemIdx, eIdx, direction)}
                onAddExample={() => onAddItemExample(itemIdx)}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={onAddItem}
          className="self-start text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          + Thêm ý đánh số
        </button>
      </div>
    </section>
  )
}
