/**
 * @vitest-environment jsdom
 *
 * The approval prompt is where the human actually exercises control, so it gets
 * tested the way it is used: a real blocked tool call raises it, and the three
 * outcomes a person can choose — allow once, allow with my own value, refuse —
 * each have to change what ends up in the application.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApprovalManager } from './ApprovalManager'
import { registerTools, callTool } from '../../lib/webmcp/adapter'
import { allTools } from '../../lib/webmcp'
import { scholarshipDomain } from '../../lib/domains/scholarship'
import { useApplicationStore } from '../../lib/store/applicationStore'
import { useTaskFenceStore } from '../../lib/store/taskfenceStore'

const STATEMENT =
  "Complete my scholarship application using my documents. Don't change anything I've already answered. If something is missing, ask me. Ask before you submit."

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
  useTaskFenceStore.getState().startDelegation(STATEMENT, scholarshipDomain)
})

/** Attempt the write the demo hinges on: overwriting an answer the human gave. */
function attemptBlockedWrite() {
  return callTool('updateApplication', {
    field: 'previousUniversity',
    value: 'Northgate State University',
    source: 'document',
  }) as Promise<{ ok: boolean }>
}

describe('the approval prompt', () => {
  it('appears when a call crosses a line the human drew, and says why', async () => {
    render(<ApprovalManager />)
    const call = attemptBlockedWrite()

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.getByText(/asking to cross a line you drew/i)).toBeTruthy()
    expect(screen.getByText(/already answered/i)).toBeTruthy()

    // It shows exactly what will be granted, before it is granted.
    expect(screen.getByText(/expires:\s*immediately after this one call/i)).toBeTruthy()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /No, don’t|No, don't/i }))
    })
    await expect(call).resolves.toMatchObject({ ok: false })
    expect(useApplicationStore.getState().values.previousUniversity.value).toBe('Riverside Community College')
  })

  it('allows the write once when the human says yes', async () => {
    render(<ApprovalManager />)
    const call = attemptBlockedWrite()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^Allow once$/i }))
    })

    await expect(call).resolves.toMatchObject({ ok: true })
    expect(useApplicationStore.getState().values.previousUniversity.value).toBe('Northgate State University')

    // ...and the grant is spent, so the identical call is stopped again.
    const again = attemptBlockedWrite()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /No, don’t|No, don't/i }))
    })
    await expect(again).resolves.toMatchObject({ ok: false })
  })

  it('writes the human’s correction, not the agent’s proposal', async () => {
    render(<ApprovalManager />)
    const call = attemptBlockedWrite()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())

    const input = screen.getByDisplayValue('Northgate State University') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'Northgate State Univ.' } })
    })

    // The button changes to make it obvious whose version is being written.
    const allow = await screen.findByRole('button', { name: /Allow my version, once/i })
    expect(screen.getByText(/will not be written/i)).toBeTruthy()

    act(() => {
      fireEvent.click(allow)
    })

    await expect(call).resolves.toMatchObject({ ok: true })
    expect(useApplicationStore.getState().values.previousUniversity.value).toBe('Northgate State Univ.')
  })

  it('pauses an irreversible submission even though nothing forbade it', async () => {
    render(<ApprovalManager />)
    // Fill everything the form requires so submission is otherwise valid.
    const app = useApplicationStore.getState()
    scholarshipDomain.fields
      .filter((f) => f.required)
      .forEach((f) => app.setValue(f.id, 'x', 'human'))

    const call = callTool('submitApplication', { confirm: true }) as Promise<{ ok: boolean }>
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.getByText(/needs your decision/i)).toBeTruthy()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^Allow once$/i }))
    })
    await expect(call).resolves.toMatchObject({ ok: true })
    expect(useApplicationStore.getState().submitted).toBe(true)
  })

  it('shows nothing at all when no decision is outstanding', () => {
    const { container } = render(<ApprovalManager />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
