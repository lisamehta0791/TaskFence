/**
 * @vitest-environment jsdom
 *
 * The thing that was actually reported: upload a document to a workspace with
 * a fixed field list (scholarship, job) and it should match on its own — no
 * clicking "add field" for anything the document already answers. That only
 * ever worked for the blank workspace before; this pins it for a fixed one.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DocumentPanel } from './DocumentPanel'
import { jobApplicationDomain, useRecordStore } from '../../lib/domains'

beforeEach(() => {
  cleanup()
  useRecordStore('job').getState().reset()
})

function upload(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } })
}

describe('DocumentPanel — automatic matching on a fixed-field workspace', () => {
  it('matches an uploaded CV against the job workspace\'s real fields, with no manual step', async () => {
    const { container } = render(<DocumentPanel domain={jobApplicationDomain} />)

    const file = new File(
      ['Current job title: Senior Backend Engineer\nSalary expectation: 81,000\nNotice period: 6 weeks'],
      'my-cv.txt',
      { type: 'text/plain' },
    )

    const input = container.querySelector('input[type="file"]') as HTMLElement

    await act(async () => {
      upload(input, file)
      await new Promise((r) => setTimeout(r, 30))
    })

    await waitFor(() => expect(screen.getByText(/Detected in my-cv\.txt/i)).toBeTruthy())
    expect(screen.getByText('Current job title')).toBeTruthy()
    expect(screen.getByText(/Senior Backend Engineer/)).toBeTruthy()
    expect(screen.getByText(/81,000/)).toBeTruthy()

    // And the underlying record actually has it — not just UI text.
    const values = useRecordStore('job').getState().documents
    expect(values.some((d) => Object.keys(d.extracted).includes('currentTitle'))).toBe(true)
  })

  it('flags a match against a field you already answered, instead of silently proposing to overwrite it', async () => {
    useRecordStore('job').getState().setValue('salaryExpectation', '68,000', 'human')
    const { container } = render(<DocumentPanel domain={jobApplicationDomain} />)

    const file = new File(['Salary expectation: 95,000'], 'offer-notes.txt', { type: 'text/plain' })
    const input = container.querySelector('input[type="file"]') as HTMLElement

    await act(async () => {
      upload(input, file)
      await new Promise((r) => setTimeout(r, 30))
    })

    await waitFor(() => expect(screen.getByText(/you already answered this/i)).toBeTruthy())
  })
})
