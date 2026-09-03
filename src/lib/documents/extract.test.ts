/**
 * @vitest-environment jsdom
 *
 * Document reading. The interesting case is the honest failure: a file we
 * cannot read must say so, because that is what forces the agent back to the
 * human instead of letting it invent a value.
 */

import { describe, expect, it } from 'vitest'
import { extractText, guessFields, humanSize } from './extract'

function file(name: string, body: string, type: string): File {
  return new File([body], name, { type })
}

describe('extractText', () => {
  it('reads a plain text file', async () => {
    const r = await extractText(file('transcript.txt', 'GPA: 3.9\nInstitution: Northgate', 'text/plain'))
    expect(r.readable).toBe(true)
    expect(r.text).toContain('Northgate')
  })

  it('reads a csv by extension even when the browser gives no mime type', async () => {
    const r = await extractText(file('income.csv', 'household income,31400', ''))
    expect(r.readable).toBe(true)
  })

  it('reports an image as unreadable rather than pretending', async () => {
    const r = await extractText(file('id-card.png', 'binary', 'image/png'))
    expect(r.readable).toBe(false)
    expect(r.text).toBe('')
    expect(r.note).toMatch(/ask you|OCR/i)
  })

  it('reports an unknown file type honestly', async () => {
    const r = await extractText(file('thing.dat', 'x', 'application/octet-stream'))
    expect(r.readable).toBe(false)
    expect(r.note).toMatch(/cannot read/i)
  })

  it('treats an empty file as unreadable', async () => {
    const r = await extractText(file('blank.txt', '   ', 'text/plain'))
    expect(r.readable).toBe(false)
  })
})

describe('guessFields', () => {
  it('finds the values a scholarship form asks for', () => {
    const found = guessFields(
      [
        'NORTHGATE STATE UNIVERSITY',
        'Name: Amara Okonjo',
        'Institution: Northgate State University',
        'GPA: 3.82 / 4.0',
        'Expected graduation: June 2027',
        'Household income: 31,400',
        'People in household: 5',
        'Contact: amara@example.edu',
      ].join('\n'),
    )
    expect(found.previousUniversity).toMatch(/Northgate/)
    expect(found.gpa).toMatch(/3\.82/)
    expect(found.familyIncome).toBe('31,400')
    expect(found.dependents).toBe('5')
    expect(found.email).toBe('amara@example.edu')
  })

  it('returns nothing rather than guessing at unstructured prose', () => {
    expect(Object.keys(guessFields('the quick brown fox jumped over the lazy dog'))).toHaveLength(0)
    expect(Object.keys(guessFields(''))).toHaveLength(0)
  })
})

describe('humanSize', () => {
  it('formats bytes readably', () => {
    expect(humanSize(512)).toBe('512 B')
    expect(humanSize(2048)).toBe('2 KB')
    expect(humanSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
