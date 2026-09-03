/**
 * Asking a model to read a document TaskFence could not.
 *
 * The deterministic parser in `deriveForm.ts` runs first, always, and on most
 * printed forms it is enough. But it is a set of pattern rules, and pattern
 * rules have a ceiling: a label in one table cell with its answer in the next
 * has no punctuation to key off at all, and no amount of regex fixes that
 * honestly.
 *
 * So this is the fallback, and the boundary around it is deliberate:
 *
 *  - It is only ever reached when the local parser found little or nothing, or
 *    when the person explicitly asks for it.
 *  - It returns a *proposal*. Fields appear only once the human accepts them.
 *  - It never writes an answer into the record, and it has no involvement of
 *    any kind in what an agent is permitted to do. That stays in the policy
 *    engine, which is a pure function with no model in it.
 *  - If it is unavailable — no key, no network, bad response — the site says so
 *    and carries on with what the local parser found.
 *
 * Document text does leave the browser on this path, which is a real change
 * from the default and is stated plainly in the UI before anyone clicks.
 */

import type { FieldSpec } from '../domains/types'
import { stripOfficeSection } from './deriveForm'

export interface AiReadResult {
  ok: boolean
  fields: FieldSpec[]
  /** Values the document already contains, keyed by field id. */
  answers: Record<string, string>
  /** Why it did not work, in words worth showing someone. */
  note?: string
}

const TYPES = new Set<FieldSpec['type']>(['text', 'textarea', 'number', 'date', 'money', 'select'])

function unavailable(note: string): AiReadResult {
  return { ok: false, fields: [], answers: {}, note }
}

export async function readDocumentWithAi(text: string, signal?: AbortSignal): Promise<AiReadResult> {
  if (!text.trim()) return unavailable('There is no text to read.')

  // The office's section is cut out here rather than being described to the
  // model as something to avoid. Asked politely, it returned "Name of the
  // Candidate" from under "FOR OFFICE PURPOSE ONLY" anyway.
  const body = stripOfficeSection(text)
  if (!body.trim()) return unavailable('There is no text to read.')

  let response: Response
  try {
    response = await fetch('/api/understand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: body }),
      signal,
    })
  } catch {
    return unavailable('Could not reach the reading service. Everything else still works.')
  }

  if (response.status === 501) {
    return unavailable('AI reading is not configured for this deployment — using the built-in reader only.')
  }
  if (!response.ok) {
    return unavailable(`The reading service could not read this document (${response.status}).`)
  }

  let payload: { fields?: unknown }
  try {
    payload = (await response.json()) as { fields?: unknown }
  } catch {
    return unavailable('The reading service sent something unreadable back.')
  }

  const raw = Array.isArray(payload.fields) ? payload.fields : []
  const fields: FieldSpec[] = []
  const answers: Record<string, string> = {}
  // A repeating table ("Examination 1", "Examination 2") comes back as several
  // fields sharing one label, which is unreadable on the form. Number them.
  const labelCounts = new Map<string, number>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const id = typeof f.id === 'string' ? f.id : ''
    const label = typeof f.label === 'string' ? f.label : ''
    if (!id || !label) continue

    const seenBefore = labelCounts.get(label) ?? 0
    labelCounts.set(label, seenBefore + 1)

    const type = (typeof f.type === 'string' ? f.type : 'text') as FieldSpec['type']
    fields.push({
      id,
      label: seenBefore ? `${label} ${seenBefore + 1}` : label,
      type: TYPES.has(type) ? type : 'text',
      group: typeof f.group === 'string' && f.group ? f.group : 'Details',
      required: f.required !== false,
      ...(Array.isArray(f.options)
        ? { options: f.options.filter((o): o is string => typeof o === 'string') }
        : {}),
    })

    const value = typeof f.value === 'string' ? f.value.trim() : ''
    // A model asked for "what is already filled in" will sometimes hand back
    // the printed blank instead. That is not an answer.
    if (value && !/^[\s_.\-–—…]+$/.test(value)) answers[id] = value
  }

  if (!fields.length) return unavailable('The reader did not find any fields in this document either.')
  return { ok: true, fields, answers }
}
