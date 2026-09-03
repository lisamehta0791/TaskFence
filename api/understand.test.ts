/**
 * The serverless reader.
 *
 * The important behaviour is what happens when it is NOT set up, because that
 * is the default for anyone who clones this repo: it must decline clearly so
 * the site can fall back to its own deterministic reader, rather than failing
 * in a way that looks like a bug.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './understand'

const post = (body: unknown) =>
  new Request('http://localhost/api/understand', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

let savedKey: string | undefined

beforeEach(() => {
  savedKey = process.env.GROQ_API_KEY
})

afterEach(() => {
  if (savedKey === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = savedKey
  vi.unstubAllGlobals()
})

describe('without a key', () => {
  beforeEach(() => {
    delete process.env.GROQ_API_KEY
  })

  it('declines with 501 rather than pretending', async () => {
    const res = await handler(post({ text: 'Full name: ____' }))
    expect(res.status).toBe(501)
    expect(await res.json()).toMatchObject({ error: 'not-configured' })
  })

  it('never calls out to anything', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await handler(post({ text: 'Full name: ____' }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('with a key', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'gsk_test'
  })

  it('rejects anything but POST', async () => {
    const res = await handler(new Request('http://localhost/api/understand', { method: 'GET' }))
    expect(res.status).toBe(405)
  })

  it('rejects an empty document', async () => {
    expect((await handler(post({ text: '   ' }))).status).toBe(400)
  })

  it('passes the model’s fields through once they are cleaned up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    fields: [
                      { id: 'fathersName', label: "Father's Name", type: 'text', value: 'Rajesh' },
                      { id: 'fathersName', label: 'Duplicate id', type: 'text' },
                      { id: '', label: 'No id', type: 'text' },
                      { id: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female'] },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )

    const res = await handler(post({ text: 'anything' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fields: Array<{ id: string; options?: string[] }> }
    expect(body.fields.map((f) => f.id)).toEqual(['fathersName', 'gender'])
    expect(body.fields[1].options).toEqual(['Male', 'Female'])
  })

  it('reports an upstream failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Invalid API Key', { status: 401 })))
    const res = await handler(post({ text: 'anything' }))
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'upstream' })
  })

  it('survives the model returning something that is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'sorry, I cannot' } }] }), { status: 200 }),
      ),
    )
    const res = await handler(post({ text: 'anything' }))
    expect(res.status).toBe(502)
  })
})
