/**
 * Optional AI assist for reading a document.
 *
 * WHY THIS RUNS ON A SERVER AND NOT IN THE PAGE
 *
 * The API key. Anything a Vite build can see ends up in the JavaScript that
 * ships to every visitor, so a key in client code is a published key. This
 * function keeps it on Vercel's side; the browser only ever sees the result.
 *
 * WHAT THIS IS ALLOWED TO DECIDE
 *
 * The *shape of a document*, and nothing else. It returns a proposed list of
 * fields for the human to confirm. It never writes a value, never touches the
 * record, and — most importantly — has no say whatsoever in what an agent is
 * permitted to do. Permissions stay in `src/lib/policy/engine.ts`, which is a
 * pure function with no model anywhere near it. An LLM that could be talked
 * into granting permissions is exactly the thing TaskFence exists to prevent.
 *
 * If GROQ_API_KEY is not configured this returns 501 and the site carries on
 * with its own deterministic parser, which is always the first thing tried.
 */

/** Web-standard Request/Response, so this same handler also runs in Vite dev. */
export const config = { runtime: 'edge' }

/**
 * Tried in order. Which models an account can reach changes over time, and a
 * demo that dies because one name was retired is a bad demo — so a model that
 * is not available for this key simply falls through to the next.
 */
const MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']
const MAX_CHARS = 24_000

const SYSTEM = `You extract the structure of a form from its text.

Return ONLY JSON matching:
{"fields":[{"id":"camelCaseId","label":"Human label","type":"text|textarea|number|date|money|select","group":"Section heading","required":true,"value":"already filled in, or empty string","options":["only for select"]}]}

Rules:
- A field is something a person must fill in. Include fields whose label sits in one table cell and whose answer belongs in the next.
- "value" is ONLY what is genuinely already written in the document. Printed blanks (____, ......, empty cells) mean an empty string. NEVER invent a value.
- Skip anything only an official completes: sections headed "for office use only", verifier signatures, approval boxes.
- Skip headings, instructions, page numbers and notes.
- "id" must be camelCase, derived from the label, unique.
- "group" is the section heading the field appears under, or "Details".
- At most 40 fields.
- Output nothing but the JSON object.`

interface ProposedField {
  id: string
  label: string
  type: string
  group?: string
  required?: boolean
  value?: string
  options?: string[]
}

const TYPES = new Set(['text', 'textarea', 'number', 'date', 'money', 'select'])

/** Never trust the shape of what a model returns. */
function clean(raw: unknown): ProposedField[] {
  if (!raw || typeof raw !== 'object') return []
  const list = (raw as { fields?: unknown }).fields
  if (!Array.isArray(list)) return []

  const seen = new Set<string>()
  const out: ProposedField[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const id = typeof f.id === 'string' ? f.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 60) : ''
    const label = typeof f.label === 'string' ? f.label.trim().slice(0, 80) : ''
    if (!id || !label || seen.has(id)) continue
    seen.add(id)

    const type = typeof f.type === 'string' && TYPES.has(f.type) ? f.type : 'text'
    out.push({
      id,
      label,
      type,
      group: typeof f.group === 'string' && f.group.trim() ? f.group.trim().slice(0, 60) : 'Details',
      required: f.required !== false,
      value: typeof f.value === 'string' ? f.value.trim().slice(0, 400) : '',
      ...(type === 'select' && Array.isArray(f.options)
        ? { options: f.options.filter((o): o is string => typeof o === 'string').slice(0, 12) }
        : {}),
    })
    if (out.length >= 40) break
  }
  return out
}

export default async function handler(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const key = process.env.GROQ_API_KEY
  if (!key) {
    return json(
      { error: 'not-configured', message: 'No model is configured for this deployment.' },
      501,
    )
  }

  let text = ''
  try {
    const body = (await req.json()) as { text?: unknown }
    text = typeof body.text === 'string' ? body.text : ''
  } catch {
    return json({ error: 'Body must be JSON.' }, 400)
  }
  if (!text.trim()) return json({ error: 'Nothing to read.' }, 400)

  let lastDetail = ''
  for (const model of MODELS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: text.slice(0, MAX_CHARS) },
          ],
        }),
      })

      if (!response.ok) {
        lastDetail = (await response.text()).slice(0, 300)
        // A model this key cannot reach is worth retrying with another one;
        // a rejected key or a rate limit is not.
        if (response.status === 404 || /model/i.test(lastDetail)) continue
        return json({ error: 'upstream', message: lastDetail }, 502)
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = payload.choices?.[0]?.message?.content ?? '{}'
      return json({ fields: clean(JSON.parse(content)), model })
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err)
    }
  }

  return json({ error: 'upstream', message: lastDetail || 'No model was reachable.' }, 502)
}
