import type { ReactNode } from 'react'

// Renders the same **bold** convention the editor's Bold button writes and documents.ts (PDF) parses.
// Never dangerouslySetInnerHTML - the text is split into plain segments and rendered as ordinary React nodes.
export function renderFormattedText(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+?\*\*)/g).map((part, index) => {
    const bold = /^\*\*([^*]+?)\*\*$/.exec(part)
    return bold ? <strong key={index}>{bold[1]}</strong> : <span key={index}>{part}</span>
  })
}
