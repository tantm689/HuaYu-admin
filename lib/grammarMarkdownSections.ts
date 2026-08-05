// Splits a single grammarMarkdown string into per-grammar-point sections at
// "## Ngữ pháp N" boundaries (level-2 heading, per the extraction prompt's
// current heading scheme - see lib/gemini/extract.ts), so the editor can
// render one collapsible accordion item per grammar point instead of one
// long unbroken document. Content before the first such heading (if any -
// legacy data extracted before this migration, or a lesson with no grammar
// points yet) is kept as a single unlabeled leading section.
//
// The heading line itself is pulled out into `heading` rather than left in
// `markdown`: the accordion trigger already displays `title`, so leaving the
// "## Ngữ pháp N: ..." heading in the editable content would render the
// same text again immediately inside the section, as a large duplicate H2.
// `heading` is null for the unlabeled leading section, which has no
// corresponding heading line to remove.
export interface GrammarMarkdownSection {
  id: string
  title: string
  heading: string | null
  markdown: string
}

const HEADING_PATTERN = /^## Ngữ pháp \d+:?\s*(.*)$/

export function splitGrammarMarkdown(markdown: string): GrammarMarkdownSection[] {
  const lines = markdown.split('\n')
  const sections: GrammarMarkdownSection[] = []
  let current: { heading: string; title: string; lines: string[] } | null = null
  let leading: string[] = []
  let index = 0

  const flush = () => {
    if (current) {
      sections.push({
        id: `section-${index++}`,
        title: current.title,
        heading: current.heading,
        markdown: current.lines.join('\n').trim(),
      })
      current = null
    }
  }

  for (const line of lines) {
    const match = HEADING_PATTERN.exec(line)
    if (match) {
      flush()
      current = { heading: line, title: match[1] || line.replace(/^##\s*/, ''), lines: [] }
    } else if (current) {
      current.lines.push(line)
    } else {
      leading.push(line)
    }
  }
  flush()

  const leadingText = leading.join('\n').trim()
  if (leadingText) {
    sections.unshift({ id: 'section-leading', title: '', heading: null, markdown: leadingText })
  }

  return sections
}

export function joinGrammarMarkdown(sections: GrammarMarkdownSection[]): string {
  return sections
    .map((section) => [section.heading, section.markdown.trim()].filter((part) => part).join('\n\n'))
    .filter((markdown) => markdown.length > 0)
    .join('\n\n')
}
