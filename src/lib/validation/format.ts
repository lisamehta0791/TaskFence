/**
 * Does this answer look like a real answer?
 *
 * A separate question from "may the agent write here", and it belongs to a
 * separate layer. The policy engine decides permission; this decides whether a
 * value that is already on the form is plausible. Neither one guesses: like the
 * engine, this is pure and deterministic, so the agent can tell you *why* a
 * value was flagged rather than asserting that it "looks wrong".
 *
 * It is deliberately generic. Nothing here knows what a scholarship is — the
 * rules key off the field's declared type and the ordinary words in its label
 * ("email", "mobile", "date of birth"), which is all that is available on a
 * form derived from a document nobody has seen before.
 *
 * It reports; it never edits. A flagged value stays exactly as the human typed
 * it until the human changes it, or until they approve an agent's write through
 * the normal fence.
 */

import type { FieldSpec } from '../domains/types'

export interface FormatProblem {
  fieldId: string
  label: string
  value: string
  /** `error` — almost certainly wrong. `warning` — worth a human's eye. */
  severity: 'error' | 'warning'
  /** What is wrong, in words the agent can relay to the human as they are. */
  problem: string
  /** What a valid value looks like. */
  expected: string
}

/* ------------------------------------------------------------------ *
 * What the label is asking for
 * ------------------------------------------------------------------ */

const EMAIL_LABEL = /\b(e-?mail|email id)\b/i
const PHONE_LABEL = /\b(phone|mobile|whatsapp|telephone|contact number|cell)\b/i
const NAME_LABEL = /\bname\b/i
const YEAR_LABEL = /\b(year|passing year|batch)\b/i
const PERCENT_LABEL = /\b(%|percent|percentage|marks|score|cgpa|gpa)\b/i
const ID_LABEL = /\b(passport|citizenship|aadhaar|licence|license|registration|application)\s*(no|number|id)\b/i

const EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/
/** Left-over printed blank: "______", "…", "( )". */
const LEFTOVER_BLANK = /[_]{3,}|\.{4,}|…{2,}/
/** The stand-in the demo agent writes when it has to guess out loud. */
const OBVIOUS_PLACEHOLDER = /please correct this|best estimate|tbd|tbc|xxx+|lorem ipsum/i

function digitsOf(value: string): string {
  return value.replace(/\D/g, '')
}

function looksLikeADate(value: string): boolean {
  const v = value.trim()
  // 01/09/2007, 1-9-07, 2007-09-01
  if (/^\d{1,4}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*\d{1,4}$/.test(v)) return true
  // June 2027, 12 June 2027, Jun 2027
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(v) && /\d{2,4}/.test(v)) return true
  // A bare year is a legitimate answer to "expected graduation".
  if (/^(19|20)\d{2}$/.test(v)) return true
  return false
}

/* ------------------------------------------------------------------ *
 * The check
 * ------------------------------------------------------------------ */

/**
 * Check one answer. Returns null when the value is blank (missing is not the
 * same as malformed — the form's own required-field check covers that) or when
 * nothing is wrong with it.
 */
export function checkValue(field: FieldSpec, raw: string): FormatProblem | null {
  const value = (raw ?? '').trim()
  if (!value) return null

  const label = field.label
  const at = (severity: FormatProblem['severity'], problem: string, expected: string): FormatProblem => ({
    fieldId: field.id,
    label,
    value,
    severity,
    problem,
    expected,
  })

  // Something left over from the printed page, or from an agent's guess. These
  // come first: they are wrong whatever kind of field this is.
  if (LEFTOVER_BLANK.test(value)) {
    return at('error', 'still contains the blank line from the printed form', 'a real answer, with no underscores')
  }
  if (OBVIOUS_PLACEHOLDER.test(value)) {
    return at('error', 'is a placeholder, not a real answer', 'the actual value')
  }

  if (EMAIL_LABEL.test(label)) {
    if (!EMAIL.test(value)) {
      return at('error', 'is not a valid email address', 'something like name@example.com')
    }
    return null
  }

  if (PHONE_LABEL.test(label)) {
    const digits = digitsOf(value)
    if (!digits) {
      return at('error', 'contains no digits at all, so it cannot be a phone number', '7 to 15 digits')
    }
    if (/[A-Za-z]{3,}/.test(value)) {
      return at('error', 'contains letters, so it is not a phone number', 'digits only, optionally with + and spaces')
    }
    if (digits.length < 7 || digits.length > 15) {
      return at(
        'error',
        `has ${digits.length} digit${digits.length === 1 ? '' : 's'}, which is not a usable phone number`,
        '7 to 15 digits',
      )
    }
    return null
  }

  // "Date of Birth" is a date; "Place of Birth" is not.
  if (field.type === 'date' || /\bdate\b|\bdob\b/i.test(label)) {
    if (!looksLikeADate(value)) {
      return at('error', 'is not a recognisable date', 'a date such as 01/09/2007 or June 2027')
    }
    return null
  }

  if (PERCENT_LABEL.test(label)) {
    const n = Number(value.replace(/[%\s]/g, '').split('/')[0])
    if (Number.isNaN(n)) return at('error', 'is not a number', 'a figure such as 78 or 78%')
    if (/%|percent|marks/i.test(label) && (n < 0 || n > 100)) {
      return at('error', `is ${n}, which is outside 0–100`, 'a percentage between 0 and 100')
    }
    return null
  }

  if (YEAR_LABEL.test(label) && field.type !== 'textarea') {
    if (!/^(19|20)\d{2}$/.test(value.trim())) {
      return at('warning', 'does not look like a four-digit year', 'a year such as 2024')
    }
    return null
  }

  if (field.type === 'number') {
    if (Number.isNaN(Number(value.replace(/[\s,]/g, '')))) {
      return at('error', 'is not a number', 'digits only')
    }
    return null
  }

  if (field.type === 'money') {
    if (Number.isNaN(Number(value.replace(/[£$€₹¥\s,]/g, '')))) {
      return at('error', 'is not an amount', 'a figure such as 31,400')
    }
    return null
  }

  if (ID_LABEL.test(label)) {
    if (!/[A-Za-z0-9]/.test(value) || value.length < 4) {
      return at('warning', 'looks too short to be a valid reference number', 'the number as printed on the document')
    }
    return null
  }

  if (NAME_LABEL.test(label) && field.type === 'text') {
    if (/\d/.test(value)) {
      return at('warning', 'contains digits, which is unusual for a name', 'letters only')
    }
    if (!/[aeiouAEIOU]/.test(value.replace(/\s/g, '')) && value.replace(/\s/g, '').length > 3) {
      return at('warning', 'does not look like a name anyone would write', 'the name as it appears on your documents')
    }
    return null
  }

  return null
}

/** Check every answered field on a record, worst first. */
export function checkRecordValues(
  fields: FieldSpec[],
  values: Record<string, { value: string }>,
): FormatProblem[] {
  const problems: FormatProblem[] = []
  for (const field of fields) {
    const problem = checkValue(field, values[field.id]?.value ?? '')
    if (problem) problems.push(problem)
  }
  return problems.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

/** One line an agent can say out loud. */
export function describeProblem(p: FormatProblem): string {
  return `${p.label} — “${p.value}” ${p.problem}; expected ${p.expected}.`
}
