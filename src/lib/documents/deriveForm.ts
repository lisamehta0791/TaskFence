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
/**
 * "Nationality - ________" — a dash instead of a colon. Extremely common on
 * printed forms. The label may not itself contain a dash, or it would swallow
 * the separator.
 *
 * A hyphen or en dash only. An em dash is prose punctuation — "MERIDIAN LABS —
 * APPLICATION FORM" is a title, not a field called "Meridian labs".
 */
const DASH_LABELLED = /^\s*[*•\d.)\s]*([A-Za-z][A-Za-z0-9 /'&().+]{1,52}?)\s*[-–]\s*(.*)$/
/**
 * "Full name ________" — a printed form's write-on-this-line style, no colon.
 * Requires a real run of underscores/dots so a heading is never mistaken for it.
 */
const UNDERSCORE_BLANK = /^\s*[-*•\d.)\s]*([A-Za-z][A-Za-z0-9 /'&()+-]{1,52}?)\s*(?:[_…]{3,}|\.{4,})\s*$/
/** A heading: short, no colon, mostly capitals or title-ish, often underlined. */
const HEADING = /^\s*([A-Z][A-Za-z0-9 /&'-]{2,40})\s*$/

/** "Male/ Female/ Other" — a printed choice list, not somebody's answer. */
const OPTION_LIST = /^([A-Za-z][A-Za-z ]{0,20}?)(?:\s*\/\s*([A-Za-z][A-Za-z ]{0,20}?)){1,5}$/

/** Anything that means "nobody has answered this yet". */
const BLANK = /^[\s_.\-–—…/]*$|^\[\s*\]$|^\(\s*\)$|^n\/?a$|^tbc$|^tbd$/i

/** What is left of a blank after the rules are stripped: "from ______to ___". */
const CONNECTIVES = /^(from|to|and|or|of|in|at|the|dd|mm|yy|yyyy)(\s+(from|to|and|or|of|in|at|the|dd|mm|yy|yyyy))*$/i

/**
 * Labels that are page furniture rather than questions. Matched against the
 * *label*, not the whole line — "Instructions: read carefully" has a colon and
 * would otherwise sail through as a field called "Instructions".
 */
const NOISE_LABEL =
  /^(page|continued|note|notes|instructions?|section|for office use.*|office use.*|signature|signed|date signed|please.*|example|e\.?g\.?|important)$/i

/**
 * A section heading that happens to be punctuated like a field:
 * "Details of the Applicant:", "Parents Information", "Educational
 * Qualifications". They label the block that follows, not a blank to fill.
 */
const SECTION_LABEL =
  /^(details?|particulars?|declaration|documents?)\b|\b(information|details|particulars|qualifications?)$/i

/**
 * A "value" that is really the other half of the printed line — a form's
 * signature block, or the office's verdict box. Never somebody's answer.
 */
const NOISE_VALUE = /^(signature|signed)\b|^(name|date)\s+(&|and|of)\b|^(approved|not approved)\b/i

/**
 * Everything past this belongs to whoever processes the form, not to the person
 * filling it in. Deriving "Signature of the Verifier" as a field to complete is
 * how a scholarship form ended up asking the applicant to approve themselves.
 */
const OFFICE_SECTION = /^\**\s*(for\s+)?office\s+(purpose|use)(\s+only)?\b|^\**\s*for\s+official\s+use\b/i

/**
 * Everything from the office section onwards, removed.
 *
 * Used by the deterministic pass below and by the AI reader, which is given
 * the trimmed text rather than being asked nicely to ignore it — a rule you
 * enforce beats a rule you request.
 */
export function stripOfficeSection(text: string): string {
  const lines = text.split(/\r?\n/)
  const cut = lines.findIndex((line) => OFFICE_SECTION.test(line.trim()))
  return cut === -1 ? text : lines.slice(0, cut).join('\n')
}

/** The printed blank markers, removed before asking "did anyone answer this?" */
function stripBlankMarkers(value: string): string {
  return value
    .replace(/[_…]{2,}/g, ' ')
    .replace(/\.{3,}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[£$€₹¥]/g, ' ')
    .replace(/^[\s:•*-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBlank(value: string): boolean {
  const stripped = stripBlankMarkers(value)
  if (!stripped) return true
  if (BLANK.test(stripped)) return true
  // "from ______to _______" leaves only the words that joined the blanks up.
  if (CONNECTIVES.test(stripped)) return true
  if (NOISE_VALUE.test(stripped)) return true
  // "Male/ Female/ Other" is the choice on the page, not the choice made.
  if (OPTION_LIST.test(stripped)) return true
  return false
}

/** The choices a printed option list offers, if that is what this value is. */
function optionsOf(value: string): string[] | undefined {
  const stripped = stripBlankMarkers(value)
  if (!OPTION_LIST.test(stripped)) return undefined
  const parts = stripped.split('/').map((p) => p.trim()).filter(Boolean)
  return parts.length >= 2 ? parts : undefined
}

/**
 * One printed line can hold several fields side by side. `extract.ts` marks the
 * column breaks it measured with tabs; a chunk with no label of its own is the
 * continuation of the field to its left, not a new one.
 */
export function segmentsOf(line: string): string[] {
  if (!line.includes('\t')) return [line]
  const out: string[] = []
  for (const part of line.split('\t').map((p) => p.trim()).filter(Boolean)) {
    const hasOwnLabel = LABELLED.test(part) || QUESTION.test(part) || DASH_LABELLED.test(part)
    const previousTookALabel =
      out.length > 0 && (LABELLED.test(out[out.length - 1]) || DASH_LABELLED.test(out[out.length - 1]))
    if (!hasOwnLabel && previousTookALabel) out[out.length - 1] += ` ${part}`
    else out.push(part)
  }
  return out
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
  // Not a bare "birth": "Place of Birth" is a city, not a date.
  if (/\b(date|dob|deadline|expiry|expires)\b/.test(l)) return 'date'
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
    if (!line) continue
    // Everything below "FOR OFFICE PURPOSE ONLY" is somebody else's job.
    if (OFFICE_SECTION.test(line)) break

    const segments = segmentsOf(line)

    for (const segment of segments) {
      if (segment.length > 220) continue

      const labelled = segment.match(LABELLED)
      const question = labelled ? null : segment.match(QUESTION)
      const dashed = labelled || question ? null : segment.match(DASH_LABELLED)
      const underscored = labelled || question || dashed ? null : segment.match(UNDERSCORE_BLANK)

      if (!labelled && !question && !dashed && !underscored) {
        // A short bare line is a section heading — it groups what follows.
        // Only a line that stands alone: half of a two-column row is not one.
        if (segments.length === 1) {
          const heading = segment.match(HEADING)
          if (heading && segment.split(/\s+/).length <= 5) {
            group = tidyLabel(heading[1])
            if (!groups.includes(group)) groups.push(group)
          }
        }
        continue
      }

      const rawLabel = labelled
        ? labelled[1]
        : question
          ? question[1]
          : dashed
            ? dashed[1]
            : (underscored as RegExpMatchArray)[1]
      const rawValue = labelled ? labelled[2] : dashed ? dashed[2] : ''

      const label = tidyLabel(rawLabel)
      const trimmed = label.trim()
      if (NOISE_LABEL.test(trimmed) || SECTION_LABEL.test(trimmed)) continue
      const id = slugify(label)
      if (!id || seen.has(id)) continue
      // A label that is really a whole sentence is prose, not a field.
      if (label.split(/\s+/).length > 8) continue

      seen.add(id)
      if (!groups.includes(group)) groups.push(group)

      const options = optionsOf(rawValue)
      fields.push({
        id,
        label,
        type: options ? 'select' : inferType(label, rawValue),
        group,
        required: isRequired(label, segment),
        ...(options ? { options } : {}),
      })

      // Keep what the document answers — as material, not as an answer on the
      // form. The agent still has to be allowed to write it.
      if (!isBlank(rawValue)) answers[id] = stripBlankMarkers(rawValue)

      if (fields.length >= maxFields) break
    }

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
  // Having blanks to fill is what makes something a form. This used to demand
  // that most of it be blank, which quietly misclassified the ordinary case —
  // a form somebody has already half-completed — as a source document, and so
  // treated their own answers as material for an agent to write back in.
  return blanks >= 2
}
