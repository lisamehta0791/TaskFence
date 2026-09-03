/**
 * @vitest-environment jsdom
 *
 * Document reading. The interesting case is the honest failure: a file we
 * cannot read must say so, because that is what forces the agent back to the
 * human instead of letting it invent a value.
 */

import { describe, expect, it } from 'vitest'
import {
  annotationTextItems,
  extractText,
  humanSize,
  linesFromTextItems,
  mergePageItems,
} from './extract'

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

describe('linesFromTextItems', () => {
  // The bug this pins: a whole PDF page used to be joined into ONE line, which
  // the form-deriver then skipped as absurdly long — so a real scholarship PDF
  // produced "no fields found" despite 336 words of perfectly readable text.
  it('rebuilds printed lines from positioned fragments', () => {
    const items = [
      { str: 'Full name:', transform: [1, 0, 0, 1, 50, 700] },
      { str: '________', transform: [1, 0, 0, 1, 140, 700] },
      { str: 'Nationality:', transform: [1, 0, 0, 1, 50, 680] },
      { str: '________', transform: [1, 0, 0, 1, 140, 680] },
      { str: 'Email address:', transform: [1, 0, 0, 1, 50, 660] },
    ]
    expect(linesFromTextItems(items)).toEqual([
      'Full name: ________',
      'Nationality: ________',
      'Email address:',
    ])
  })

  it('honours explicit end-of-line flags even at the same height', () => {
    const items = [
      { str: 'Section A', transform: [1, 0, 0, 1, 50, 700], hasEOL: true },
      { str: 'Section B', transform: [1, 0, 0, 1, 50, 700] },
    ]
    expect(linesFromTextItems(items)).toEqual(['Section A', 'Section B'])
  })

  it('keeps fragments on one printed line together', () => {
    const items = [
      { str: 'Grade', transform: [1, 0, 0, 1, 50, 700] },
      { str: 'average:', transform: [1, 0, 0, 1, 90, 700] },
      { str: '3.8', transform: [1, 0, 0, 1, 150, 700] },
    ]
    expect(linesFromTextItems(items)).toEqual(['Grade average: 3.8'])
  })

  it('returns nothing for no items', () => {
    expect(linesFromTextItems([])).toEqual([])
  })

  // With real widths the reader can measure the gaps between fragments, which
  // is how it tells one word from two, and two words from two columns.
  it('rejoins a word pdf.js split in half', () => {
    const items = [
      { str: 'Intern', transform: [1, 0, 0, 1, 110, 700], width: 34 },
      { str: 'ational', transform: [1, 0, 0, 1, 144, 700], width: 36 },
      { str: 'Students', transform: [1, 0, 0, 1, 184, 700], width: 44 },
    ]
    expect(linesFromTextItems(items)).toEqual(['International Students'])
  })

  it('marks a wide gap as a column break, so two fields on one line stay apart', () => {
    const items = [
      { str: 'Nationality - ______', transform: [1, 0, 0, 1, 50, 700], width: 100 },
      { str: 'Passport Number - ______', transform: [1, 0, 0, 1, 260, 700], width: 120 },
    ]
    expect(linesFromTextItems(items)).toEqual(['Nationality - ______\tPassport Number - ______'])
  })
})

describe('annotationTextItems', () => {
  const textItems = [{ str: 'Student Full Name:', transform: [1, 0, 0, 1, 50, 700], width: 90 }]

  // The reason a half-filled PDF looked completely empty: the answers are in
  // form-field annotations, and getTextContent() does not return them.
  it('reads a value typed into the PDF and puts it on the right line', () => {
    const annots = [{ subtype: 'Widget', fieldValue: 'Lisa', rect: [150, 696, 300, 712] }]
    const merged = mergePageItems(textItems, annots)
    expect(linesFromTextItems(merged)).toEqual(['Student Full Name: Lisa'])
  })

  it('ignores an empty or hidden form field', () => {
    expect(annotationTextItems([{ subtype: 'Widget', fieldValue: '', rect: [1, 1, 2, 2] }], [])).toEqual([])
    expect(
      annotationTextItems([{ subtype: 'Widget', fieldValue: 'x', hidden: true, rect: [1, 1, 2, 2] }], []),
    ).toEqual([])
  })

  it('leaves a page with no annotations exactly as it was', () => {
    expect(mergePageItems(textItems, [])).toBe(textItems)
  })
})

describe('humanSize', () => {
  it('formats bytes readably', () => {
    expect(humanSize(512)).toBe('512 B')
    expect(humanSize(2048)).toBe('2 KB')
    expect(humanSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
