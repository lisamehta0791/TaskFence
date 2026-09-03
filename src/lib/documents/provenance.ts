/**
 * Checking the agent's story.
 *
 * When an agent writes a value it also declares where the value came from —
 * `source: "document" | "human" | "inference"` — and the delegation leans on
 * that declaration. "Fill the blanks from my documents" grants writes whose
 * source is `document`, and nothing else.
 *
 * Which means the declaration is the soft spot in the whole design. An agent
 * that invents a figure and labels it "from your transcript" walks straight
 * through a permission the human thought they were granting narrowly. Nothing
 * about being an LLM makes an agent honest here — and a hostile page, a bad
 * prompt or an ordinary hallucination all produce the same lie.
 *
 * So the site does not take its word for it. The claim is checked against the
 * document's actual text, here, deterministically. A claim that does not hold
 * up is not rejected outright — it is simply *reclassified as a guess*, and
 * then the ordinary rules decide what happens to a guess. Usually that means
 * the human is asked, which is exactly what should have happened in the first
 * place.
 *
 * No model is involved. Like the policy engine, this has to be something you
 * can reason about rather than something you have to trust.
 */

import type { DocumentSpec } from '../domains/types'
import type { ValueSource } from '../policy/types'

/** Below this, a value carries too little signal to check meaningfully. */
const MIN_CHECKABLE_LENGTH = 3

export interface ClaimCheck {
  /** The source the site will actually use when deciding. */
  source: ValueSource
  /** Whether the document really does contain this value. */
  verified: boolean
  /** False when the value is too short or generic to check either way. */
  checkable: boolean
  /** Which document backed the claim up, when one did. */
  documentName?: string
  /** Plain language for the ledger and the approval prompt. */
  note?: string
}

/**
 * Compare on words and digits only, so punctuation, spacing and line breaks in
 * the PDF do not cause a true claim to be rejected. "3.82 / 4.0" and
 * "GPA: 3.82/4.0" are the same answer.
 */
export function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function digitsOnly(text: string): string {
  return text.replace(/\D/g, '')
}

/** Does this document actually contain this value? */
export function valueAppearsIn(value: string, text: string): boolean {
  const needle = normaliseForMatch(value)
  if (!needle) return false
  const haystack = normaliseForMatch(text)
  if (haystack.includes(needle)) return true

  // "31400" and "31,400" are the same number written two ways.
  const needleDigits = digitsOnly(value)
  if (needleDigits.length >= 3 && digitsOnly(text).includes(needleDigits)) return true

  return false
}

/**
 * Decide what source the site will actually use for this write.
 *
 * Only a `document` claim is checkable — `human` is the person speaking through
 * the agent, and `inference` is already an admission that the agent worked it
 * out, which the rules handle on their own.
 */
export function verifyDocumentClaim(args: {
  source: ValueSource | undefined
  value: string
  documentId?: string
  documents: DocumentSpec[]
}): ClaimCheck {
  const { source, value, documentId, documents } = args

  if (source !== 'document') {
    return { source: source ?? 'unknown', verified: false, checkable: false }
  }

  const trimmed = value.trim()
  if (trimmed.length < MIN_CHECKABLE_LENGTH) {
    // Too short to tell a real quotation from a coincidence, in either
    // direction. Not grounds to accuse the agent of anything.
    return { source: 'document', verified: false, checkable: false }
  }

  if (documentId) {
    const doc = documents.find((d) => d.id === documentId)
    if (!doc) {
      return {
        source: 'inference',
        verified: false,
        checkable: true,
        note: `The agent said this came from document "${documentId}", which is not on this page. Treating it as the agent's own guess.`,
      }
    }
    if (!doc.readable || !doc.text) {
      return {
        source: 'inference',
        verified: false,
        checkable: true,
        note: `The agent said this came from ${doc.name}, but no text can be read out of that file — so nothing could have been read from it. Treating it as the agent's own guess.`,
      }
    }
    if (valueAppearsIn(trimmed, doc.text)) {
      return { source: 'document', verified: true, checkable: true, documentName: doc.name }
    }
    return {
      source: 'inference',
      verified: false,
      checkable: true,
      note: `The agent said this came from ${doc.name}, but “${trimmed}” does not appear in it. Treating it as the agent's own guess.`,
    }
  }

  // No document named: the claim holds if anything readable on the page backs it.
  const backing = documents.find((d) => d.readable && d.text && valueAppearsIn(trimmed, d.text))
  if (backing) {
    return { source: 'document', verified: true, checkable: true, documentName: backing.name }
  }

  return {
    source: 'inference',
    verified: false,
    checkable: true,
    note: `The agent said this came from your documents, but “${trimmed}” does not appear in any of them. Treating it as the agent's own guess.`,
  }
}
