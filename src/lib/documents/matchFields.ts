/**
 * Match a document against a form's actual fields.
 *
 * This is the piece that was missing: not "guess at scholarship-shaped
 * vocabulary" (the old `guessFields`), and not "invent fields from the
 * document" (that's `deriveForm.ts`, used only on the blank workspace) — this
 * reads whatever labelled lines a document has, and matches each one against
 * the field labels the CURRENT form actually has, whatever domain it is.
 *
 * Deterministic, same reason everything else here is: you should be able to
 * see why a value was proposed for a field, not trust a model's word for it.
 *
 * This never writes anything. It produces a proposal — `field, value,
 * confidence` — that the UI shows to the human and the agent can read via
 * `readDocument`. The actual write still has to go through `updateX(...)`,
 * which `guarded()` checks like any other call. Matching a document to a
 * field is not the same as being allowed to write it.
 */

import type { FieldSpec } from '../domains/types'

export interface FieldMatch {
  fieldId: string
  fieldLabel: string
  value: string
  /** The line in the document this came from, for "why did it suggest this". */
  sourcePhrase: string
  /** 1 = the label matched almost exactly; lower = a looser word-overlap match. */
  confidence: number
}

/** "Label: value" — the same shape deriveForm.ts recognises, reused here. */
const LABELLED = /^\s*[-*•\d.)\s]*([A-Za-z][A-Za-z0-9 /'&().+-]{1,52}?)\s*[:：]\s*(.+)$/

const BLANK = /^[\s_.\-–—…]*$|^\[\s*\]$|^\(\s*\)$|^n\/?a$|^tbc$|^tbd$/i

function isBlank(value: string): boolean {
  const stripped = value.trim().replace(/^[£$€₹¥\s:•*-]+/, '')
  return BLANK.test(stripped)
}

/**
 * A handful of abbreviations common across many kinds of forms — academic,
 * identity, financial — not specific to any one domain this app ships. Expanded
 * before comparison so "GPA" can match a field literally called "Grade average".
 */
const ABBREVIATIONS: Record<string, string[]> = {
  gpa: ['grade', 'average', 'point'],
  dob: ['date', 'birth'],
  ssn: ['social', 'security', 'number'],
  cgpa: ['grade', 'average', 'point'],
}

function words(label: string): string[] {
  const raw = label
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
  return raw.flatMap((w) => ABBREVIATIONS[w] ?? [w])
}

const STOP = new Set(['the', 'of', 'a', 'an', 'to', 'your', 'my', 'is', 'are', 'for', 'and'])

/**
 * Words so generic — "name", "number", "date" — that sharing only one of them
 * is not evidence of a real match: "Team name" and "Full name" share "name" and
 * mean completely different things. A match must include at least one word
 * that is NOT on this list, unless the field's own label is made of nothing else.
 */
const WEAK = new Set(['name', 'number', 'date', 'id', 'type', 'code', 'title', 'status'])

function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  const shared = a.filter((w) => setB.has(w))
  const substantive = shared.some((w) => !WEAK.has(w)) || b.every((w) => WEAK.has(w))
  if (!substantive) return 0
  return shared.length / Math.max(a.length, b.length)
}

/**
 * Read every "Label: value" line out of a document and match each one against
 * the given field list. One proposal per field at most — the best match wins.
 */
export function matchDocumentToFields(text: string, fields: FieldSpec[]): FieldMatch[] {
  if (!text || !fields.length) return []

  const fieldWords = fields.map((f) => ({ field: f, words: words(f.label) }))
  const best = new Map<string, FieldMatch>()

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.length > 300) continue

    const m = line.match(LABELLED)
    if (!m) continue

    const label = m[1].trim()
    const value = m[2].trim()
    if (isBlank(value)) continue

    const lw = words(label)
    if (!lw.length) continue

    for (const { field, words: fw } of fieldWords) {
      const score = similarity(lw, fw)
      if (score < 0.5) continue

      const existing = best.get(field.id)
      if (!existing || score > existing.confidence) {
        best.set(field.id, {
          fieldId: field.id,
          fieldLabel: field.label,
          value,
          sourcePhrase: line,
          confidence: score,
        })
      }
    }
  }

  return [...best.values()].sort((a, b) => b.confidence - a.confidence)
}
