import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'

export interface SlashCommandItem {
  title: string
  description: string
  command: (props: { editor: import('@tiptap/core').Editor; range: { from: number; to: number } }) => void
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    title: 'Tiêu đề 1',
    description: 'Điểm ngữ pháp lớn (Ngữ pháp N)',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    title: 'Tiêu đề 2',
    description: 'Đề mục con chữ cái (A, B...)',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    title: 'Tiêu đề 3',
    description: 'Nhãn đề mục (Chức năng, Cấu trúc...)',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    title: 'Danh sách có số',
    description: 'Danh sách đánh số 1. 2. 3...',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Danh sách gạch đầu dòng',
    description: 'Danh sách không đánh số',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Bảng',
    description: 'Chèn bảng 3 cột x 3 dòng',
    command: ({ editor, range }) => {
      // insertTable uses replaceSelectionWith at the cursor, so deleting the
      // "/query" text first and inserting right there would splice the
      // table into the middle of the current paragraph's text - anything
      // typed after the cursor ends up merged into the same paragraph as
      // anything before it, with the table wedged in between as a sibling
      // rather than actually separating the two. deleteRange's own resulting
      // selection can't be trusted to still be at `range.from` (verified:
      // it collapses to the document start instead), so the cursor is
      // explicitly restored to range.from before splitBlock - only then does
      // splitBlock correctly split the paragraph's remaining text into two,
      // with the table landing at that clean boundary between them.
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setTextSelection(range.from)
        .splitBlock()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
]

// Renders the slash-menu dropdown via a plain DOM element positioned by
// tippy-free manual coordinates (avoids pulling in the `tippy.js` dependency
// most TipTap slash-menu examples use, since this app has no other use for
// it) - a small fixed-position <div> injected into the document body,
// removed on selection/escape/outside-click.
export function createSlashCommandExtension() {
  return Extension.create({
    name: 'slashCommand',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          items: ({ query }: { query: string }) =>
            SLASH_COMMAND_ITEMS.filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 10),
          render: () => {
            let popupEl: HTMLDivElement | null = null
            let selectedIndex = 0
            let currentItems: SlashCommandItem[] = []
            let currentProps: { editor: import('@tiptap/core').Editor; range: { from: number; to: number }; clientRect?: (() => DOMRect | null) | null } | null = null

            function renderItems() {
              if (!popupEl) return
              popupEl.innerHTML = ''
              currentItems.forEach((item, index) => {
                const el = document.createElement('div')
                el.textContent = `${item.title} — ${item.description}`
                el.style.padding = '6px 10px'
                el.style.cursor = 'pointer'
                el.style.fontSize = '13px'
                el.style.background = index === selectedIndex ? 'var(--muted)' : 'transparent'
                el.addEventListener('mousedown', (e) => {
                  e.preventDefault()
                  if (currentProps) item.command({ editor: currentProps.editor, range: currentProps.range })
                  destroy()
                })
                popupEl!.appendChild(el)
              })
            }

            function handleOutsideMouseDown(event: MouseEvent) {
              if (popupEl && !popupEl.contains(event.target as Node)) {
                destroy()
              }
            }

            function destroy() {
              popupEl?.remove()
              popupEl = null
              document.removeEventListener('mousedown', handleOutsideMouseDown, true)
            }

            return {
              onStart: (props: any) => {
                currentItems = props.items
                currentProps = props
                selectedIndex = 0
                popupEl = document.createElement('div')
                popupEl.style.position = 'fixed'
                popupEl.style.zIndex = '50'
                popupEl.style.background = 'var(--background)'
                popupEl.style.border = '1px solid var(--border)'
                popupEl.style.borderRadius = '6px'
                popupEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
                popupEl.style.minWidth = '220px'
                document.body.appendChild(popupEl)
                const rect = props.clientRect?.()
                if (rect) {
                  popupEl.style.top = `${rect.bottom + 4}px`
                  popupEl.style.left = `${rect.left}px`
                }
                renderItems()
                // Capture-phase so this fires before the mousedown that
                // opened a *new* suggestion popup elsewhere would otherwise
                // be swallowed by an item's own mousedown handler first.
                document.addEventListener('mousedown', handleOutsideMouseDown, true)
              },
              onUpdate: (props: any) => {
                currentItems = props.items
                currentProps = props
                const rect = props.clientRect?.()
                if (rect && popupEl) {
                  popupEl.style.top = `${rect.bottom + 4}px`
                  popupEl.style.left = `${rect.left}px`
                }
                renderItems()
              },
              onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') {
                  destroy()
                  return true
                }
                if (props.event.key === 'ArrowDown') {
                  if (currentItems.length > 0) {
                    selectedIndex = (selectedIndex + 1) % currentItems.length
                    renderItems()
                  }
                  return true
                }
                if (props.event.key === 'ArrowUp') {
                  if (currentItems.length > 0) {
                    selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length
                    renderItems()
                  }
                  return true
                }
                if (props.event.key === 'Enter') {
                  const item = currentItems[selectedIndex]
                  if (item && currentProps) item.command({ editor: currentProps.editor, range: currentProps.range })
                  destroy()
                  return true
                }
                return false
              },
              onExit: () => {
                destroy()
              },
            }
          },
        } satisfies Partial<SuggestionOptions>,
      }
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ]
    },
  })
}
