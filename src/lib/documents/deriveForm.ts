/**
 * Work out a form from a document.
 *
 * Upload a blank job application, a competition entry, a visa questionnaire —
 * anything with labelled blanks — and this reads the labels out of it and turns
 * them into fields. Whatever the document already answers is kept separately as
 * material the agent can *use*; it is never silently written onto the form,
 * because writing it is exactly the thing your rules get to decide.
 *
 * Deterministic on purpose: the same document always produces the same form.
 * There is no model here, for the same reason there is no model in the policy
 * engine — you should be able to see why you got the fields you got.
 */

import type { FieldSpec } from '../domains/types'

export interface DerivedForm {
  fields: FieldSpec[]
  /** Values the document already supplies, keyed by field id. */
  answers: Record<string, string>
  /** Which section headings were found, in order. */
  groups: string[]
}

/* ------------------------------------------------------------------ *
 * Recognising a line
 * ------------------------------------------------------------------ */

/** "Full name: ____" / "Full name:" / "Full name: Amara Okonjo" */
const LABELLED = /^\s*[-*•\d.)\s]*([A-Za-z][A-Za-z0-9 /'&().+-]{1,52}?)\s*[:：]\s*(.*)$/
/** "What is your notice period?" */
const QUESTION = /^\s*[-*•\d.)\s]*([A-Za-z][^?]{4,70})\?\s*$/
/** A heading: short, no colon, mostly capitals or title-ish, often underlined. */
const HEADING = /^\s*([A-Z][A-Za-z0-9 /&'-]{2,40})\s*$/

/** Anything that means "nobody has answered this yet". */
const BLANK = /^[\s_.\-–—…]*$|^\[\s*\]$|^\(\s*\)$|^n\/?a$|^tbc$|^tbd$/i

/**
 * Labels that are page furniture rather than questions. Matched against the
 * *label*, not the whole line — "Instructions: read carefully" has a colon and
 * would otherwise sail through as a field called "Instructions".
 */
const NOISE_LABEL =
  /^(page|continued|note|notes|instructions?|section|for office use.*|office use.*|signature|signed|date signed|please.*|example|e\.?g\.?|important)$/i

function isBlank(value: string): boolean {
  // A currency symbol or bullet in front of a run of underscores is still blank:
  // "£_____" and "- ____" are both an empty box.
  const stripped = value.trim().replace(/^[£$€₹¥\s:•*-]+/, '')
  return BLANK.test(stripped)
}

/* ------------------------------------------------------------------ *
 * Naming
 * ------------------------------------------------------------------ */

export function slugify(label: string): string {
  const parts = label
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 5)
  if (!parts.length) return ''
  return parts[0] + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('')
}

function tidyLabel(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').replace(/[*_]+/g, '').trim()
  // "FULL NAME" reads badly next to "Date of birth".
  const looksShouted = cleaned === cleaned.toUpperCase() && /[A-Z]{3,}/.test(cleaned)
  const text = looksShouted ? cleaned.toLowerCase() : cleaned
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/* ------------------------------------------------------------------ *
 * Typing
 * ------------------------------------------------------------------ */

function inferType(label: string, sample: string): FieldSpec['type'] {
  const l = label.toLowerCase()
  if (/\b(date|dob|birth|deadline|expiry|expires|when)\b/.test(l)) return 'date'
  if (/\b(salary|income|amount|fee|cost|budget|price|funding|gap|pay|wage)\b/.test(l)) return 'money'
  if (/\b(number of|how many|count|years|age|quantity|size|dependents|people)\b/.test(l)) return 'number'
  if (/\b(statement|why|describe|explain|summary|about|motivation|cover|essay|reason|details)\b/.test(l)) {
    return 'textarea'
  }
  if (/[£$€]\s*[\d_]/.test(sample)) return 'money'
  if (sample.length > 90) return 'textarea'
  return 'text'
}

function isRequired(label: string, raw: string): boolean {
  if (/\boptional\b/i.test(label) || /\boptional\b/i.test(raw)) return false
  return true
}

/* ------------------------------------------------------------------ *
 * The pass
 * ------------------------------------------------------------------ */

export function deriveFormFromText(text: string, options: { maxFields?: number } = {}): DerivedForm {
  const maxFields = options.maxFields ?? 40
  const fields: FieldSpec[] = []
  const answers: Record<string, string> = {}
  const groups: string[] = []
  const seen = new Set<string>()

  let group = 'Details'

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.length > 220) continue

    const labelled = line.match(LABELLED)
    const question = labelled ? null : line.match(QUESTION)

    if (!labelled && !question) {
      // A short bare line is a section heading — it groups what follows.
      const heading = line.match(HEADING)
      if (heading && line.split(/\s+/).length <= 5) {
        group = tidyLabel(heading[1])
        if (!groups.includes(group)) groups.push(group)
      }
      continue
    }

    const rawLabel = labelled ? labelled[1] : (question as RegExpMatchArray)[1]
    const rawValue = labelled ? labelled[2] : ''

    const label = tidyLabel(rawLabel)
    if (NOISE_LABEL.test(label.trim())) continue
    const id = slugify(label)
    if (!id || seen.has(id)) continue
    // A label that is really a whole sentence is prose, not a field.
    if (label.split(/\s+/).length > 8) continue

    seen.add(id)
    if (!groups.includes(group)) groups.push(group)

    fields.push({
      id,
      label,
      type: inferType(label, rawValue),
      group,
      required: isRequired(label, rawLine),
    })

    // Keep what the document answers — as material, not as an answer on the
    // form. The agent still has to be allowed to write it.
    if (!isBlank(rawValue)) answers[id] = rawValue.trim()

    if (fields.length >= maxFields) break
  }

  return { fields, answers, groups }
}

/**
 * Is this document shaped like a form to fill in, rather than a source to read?
 * Used only to word the UI honestly — both kinds are still usable.
 */
export function looksLikeAForm(derived: DerivedForm): boolean {
  if (derived.fields.length < 3) return false
  const blanks = derived.fields.filter((f) => !derived.answers[f.id]).length
  return blanks / derived.fields.length >= 0.4
}
