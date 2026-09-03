/**
 * @vitest-environment jsdom
 *
 * The AI reader is optional, so the paths that matter most are the ones where
 * it is not there. A missing key, a dead network or a bad response must leave
 * the site working exactly as it does without it — never a crash, never a
 * half-applied change, and never a value invented into the record.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readDocumentWithAi } from './aiAssist'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when the reader is unavailable', () => {
  it('degrades quietly when no model is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'not-configured' }, 501)))
    const result = await readDocumentWithAi('Full name:')
    expect(result.ok).toBe(false)
    expect(result.fields).toEqual([])
    expect(result.note).toMatch(/not configured/i)
  })

  it('degrades quietly when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const result = await readDocumentWithAi('Full name:')
    expect(result.ok).toBe(false)
    expect(result.note).toMatch(/could not reach/i)
  })

  it('degrades quietly on an upstream failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'upstream' }, 502)))
    expect((await readDocumentWithAi('Full name:')).ok).toBe(false)
  })

  it('does not call out at all for an empty document', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await readDocumentWithAi('   ')).ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('what is sent', () => {
  it('cuts the office-only section out before the document leaves the browser', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ fields: [] }))
    vi.stubGlobal('fetch', fetchSpy)

    await readDocumentWithAi(
      ['Full name: ____', 'FOR OFFICE PURPOSE ONLY', 'Name of the Candidate:', 'Signature of the Verifier:'].join('\n'),
    )

    const sent = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as { text: string }
    expect(sent.text).toContain('Full name')
    expect(sent.text).not.toMatch(/office purpose/i)
    expect(sent.text).not.toMatch(/verifier/i)
  })

  it('does not call out when the document is nothing but an office section', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const officeOnly = ['FOR OFFICE USE ONLY', 'Verified by: ___'].join('\n')
    expect((await readDocumentWithAi(officeOnly)).ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('when the reader answers', () => {
  it('takes the fields and the values it says are already filled in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          fields: [
            { id: 'fathersName', label: "Father's Name", type: 'text', group: 'Parents', value: 'Rajesh Mehta' },
            { id: 'totalAnnualIncome', label: 'Total Annual Income', type: 'money', group: 'Parents', value: '' },
          ],
        }),
      ),
    )
    const result = await readDocumentWithAi('anything')
    expect(result.ok).toBe(true)
    expect(result.fields.map((f) => f.id)).toEqual(['fathersName', 'totalAnnualIncome'])
    expect(result.fields[1].type).toBe('money')
    expect(result.answers.fathersName).toBe('Rajesh Mehta')
    expect(result.answers.totalAnnualIncome).toBeUndefined()
  })

  it('does not accept a printed blank as somebody’s answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ fields: [{ id: 'nationality', label: 'Nationality', type: 'text', value: '________' }] }),
      ),
    )
    const result = await readDocumentWithAi('anything')
    expect(result.fields).toHaveLength(1)
    expect(result.answers.nationality).toBeUndefined()
  })

  it('throws away malformed entries rather than trusting the shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          fields: [
            null,
            'not an object',
            { label: 'No id' },
            { id: 'ok', label: 'Fine', type: 'nonsense-type' },
          ],
        }),
      ),
    )
    const result = await readDocumentWithAi('anything')
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].type).toBe('text')
  })

  it('numbers repeated labels from a table so the form stays readable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          fields: [
            { id: 'exam1Name', label: 'Name of Examination', type: 'text' },
            { id: 'exam2Name', label: 'Name of Examination', type: 'text' },
            { id: 'exam3Name', label: 'Name of Examination', type: 'text' },
          ],
        }),
      ),
    )
    const result = await readDocumentWithAi('anything')
    expect(result.fields.map((f) => f.label)).toEqual([
      'Name of Examination',
      'Name of Examination 2',
      'Name of Examination 3',
    ])
  })

  it('reports honestly when it finds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ fields: [] })))
    const result = await readDocumentWithAi('anything')
    expect(result.ok).toBe(false)
    expect(result.note).toMatch(/did not find/i)
  })
})
