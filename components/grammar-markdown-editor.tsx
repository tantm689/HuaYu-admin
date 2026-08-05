'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import GrammarMarkdownSectionEditor from './grammar-markdown-section-editor'
import { splitGrammarMarkdown, joinGrammarMarkdown, type GrammarMarkdownSection } from '@/lib/grammarMarkdownSections'

// A lesson's grammar content can have many grammar points, each with
// several examples - as one continuous document that got long enough to
// make finding/editing a specific point tedious. This splits grammarMarkdown
// at "## Ngữ pháp N" boundaries into a collapsible accordion, one section
// per grammar point (each with its own independent TipTap editor instance),
// so an editor can jump straight to the point they need without scrolling
// past every other one first.
export default function GrammarMarkdownEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (markdown: string) => void
  disabled?: boolean
}) {
  const [sections, setSections] = useState<GrammarMarkdownSection[]>(() => splitGrammarMarkdown(value))
  // Tracks the last value this component itself produced via onChange, so
  // the resync effect below can tell "value changed because we emitted it"
  // apart from "value changed because a parent set it externally" (e.g.
  // loading a different lesson) - only the latter should reset local state.
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setSections(splitGrammarMarkdown(value))
      lastEmitted.current = value
    }
  }, [value])

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections])

  const handleSectionChange = (id: string, markdown: string) => {
    setSections((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, markdown } : s))
      const joined = joinGrammarMarkdown(next)
      lastEmitted.current = joined
      onChange(joined)
      return next
    })
  }

  if (sections.length === 0) {
    return (
      <GrammarMarkdownSectionEditor
        value=""
        disabled={disabled}
        onChange={(markdown) => {
          lastEmitted.current = markdown
          onChange(markdown)
        }}
      />
    )
  }

  return (
    <Accordion multiple defaultValue={sectionIds} className="gap-2">
      {sections.map((section) => (
        <AccordionItem
          key={section.id}
          value={section.id}
          className="rounded-md border bg-background px-3 not-last:border-b-0"
        >
          <AccordionTrigger className="px-1 text-lg font-semibold">
            {section.heading ? section.heading.replace(/^##\s*/, '') : 'Ghi chú chung'}
          </AccordionTrigger>
          <AccordionContent>
            <GrammarMarkdownSectionEditor
              value={section.markdown}
              disabled={disabled}
              onChange={(markdown) => handleSectionChange(section.id, markdown)}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
