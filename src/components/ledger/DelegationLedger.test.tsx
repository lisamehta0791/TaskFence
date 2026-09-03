/**
 * @vitest-environment jsdom
 *
 * The ledger is the only window a person has into what their agent did, so the
 * two things that must hold are: it records everything in order, and rewinding
 * it also rewinds the rules — otherwise "what was it allowed to do at the
 * time?" is unanswerable.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DelegationLedger } from './DelegationLedger'
import { registerTools, callTool } from '../../lib/webmcp/adapter'
import { allTools } from '../../lib/webmcp'
import { scholarshipDomain } from '../../lib/domains/scholarship'
import { useApplicationStore } from '../../lib/store/applicationStore'
import { useTaskFenceStore } from '../../lib/store/taskfenceStore'

const STATEMENT =
  "Complete my scholarship application using my documents. Don't change anything I've already answered."

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as never
  registerTools(allTools)
})

beforeEach(() => {
  cleanup()
  useTaskFenceStore.getState().resetSession()
  useApplicationStore.getState().reset()
})

const ledger = () => screen.getByLabelText(/Delegation ledger/i)

async function runSomeWork() {
  useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)
  await callTool('getApplication', {})
  await callTool('readDocument', { documentId: 'doc_transcript' })
  await callTool('updateApplication', {
    field: 'gpa',
    value: '3.82 / 4.0',
    source: 'document',
    documentId: 'doc_transcript',
  })
}

describe('the ledger', () => {
  it('starts empty and says what will appear', () => {
    render(<DelegationLedger domain={scholarshipDomain} />)
    expect(within(ledger()).getByText(/Say what you want done in step 2/i)).toBeTruthy()
    expect(within(ledger()).getByText(/No rules yet/i)).toBeTruthy()
  })

  it('records every action in order, with a reason', async () => {
    await act(async () => {
      await runSomeWork()
    })
    render(<DelegationLedger domain={scholarshipDomain} />)

    const panel = ledger()
    expect(within(panel).getByText(/Read application/i)).toBeTruthy()
    expect(within(panel).getByText(/Read document/i)).toBeTruthy()
    expect(within(panel).getByText(/Fill a blank field/i)).toBeTruthy()
  })

  it('rewinds the record, and the rules along with it', async () => {
    await act(async () => {
      await runSomeWork()
    })
    render(<DelegationLedger domain={scholarshipDomain} />)

    const scrub = screen.getByLabelText('Replay') as HTMLInputElement
    expect(scrub).toBeTruthy()

    // Rewind to the very first entry.
    act(() => {
      fireEvent.change(scrub, { target: { value: '0' } })
    })
    expect(useTaskFenceStore.getState().replayIndex).toBe(0)
    // Rows animate out rather than vanishing, so they linger for one exit.
    await waitFor(() => expect(within(ledger()).queryByText(/Fill a blank field/i)).toBeNull())

    // The rules tab now shows the contract as it stood at that moment.
    act(() => {
      fireEvent.click(within(ledger()).getByRole('tab', { name: /Its rules/i }))
    })
    await waitFor(() => expect(within(ledger()).getByText(/as they stood at/i)).toBeTruthy())

    // Back to live.
    act(() => {
      fireEvent.click(within(ledger()).getByRole('tab', { name: /What it did/i }))
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /live/i })).toBeTruthy())
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /live/i }))
    })
    expect(useTaskFenceStore.getState().replayIndex).toBeNull()
    await waitFor(() => expect(within(ledger()).getByText(/Fill a blank field/i)).toBeTruthy())
  })

  it('offers no scrubber when there is nothing to rewind through', () => {
    render(<DelegationLedger domain={scholarshipDomain} />)
    expect(screen.queryByLabelText('Replay')).toBeNull()
  })

  it('points out that another agent has its own separate rules', async () => {
    const store = useTaskFenceStore.getState()
    store.startDelegation(STATEMENT, scholarshipDomain)
    store.setActiveAgent('agent_research')
    store.startDelegation('Just read it and tell me what is missing. Do not change anything.', scholarshipDomain)
    store.setActiveAgent('agent_chatgpt')

    render(<DelegationLedger domain={scholarshipDomain} />)
    act(() => {
      fireEvent.click(within(ledger()).getByRole('tab', { name: /Its rules/i }))
    })
    await waitFor(() => expect(within(ledger()).getByText(/separate rules on this task/i)).toBeTruthy())
  })

  it('exports a readable record of what was allowed and what happened', async () => {
    await act(async () => {
      await runSomeWork()
    })
    render(<DelegationLedger domain={scholarshipDomain} />)
    act(() => {
      fireEvent.click(within(ledger()).getByRole('tab', { name: /Record/i }))
    })

    await waitFor(() => expect(ledger().querySelector('.export__preview')).not.toBeNull())
    const preview = ledger().querySelector('.export__preview') as HTMLElement
    expect(preview.textContent).toMatch(/what I allowed my agent to do/i)
    expect(preview.textContent).toMatch(/I ruled out:/i)
    expect(preview.textContent).toMatch(/What actually happened:/i)
  })
})
