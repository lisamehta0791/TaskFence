/**
 * @vitest-environment jsdom
 *
 * The workspace is the product, so this covers the journey a person actually
 * walks — and, since it is the question everyone asks first, that the page you
 * land on is *not* a scholarship.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DemoPage from './DemoPage'
import { ApprovalManager } from '../components/ledger/ApprovalManager'
import { useTaskFenceStore } from '../lib/store/taskfenceStore'
import { useAgentConsole } from '../lib/agent/console'
import { FORM_DOMAINS, resetAllRecords, useRecordStore } from '../lib/domains'
import { registerTools } from '../lib/webmcp/adapter'
import { allTools } from '../lib/webmcp'

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
  window.scrollTo = (() => {}) as never
  registerTools(allTools)
})

beforeEach(() => {
  cleanup()
  useTaskFenceStore.getState().resetSession()
  resetAllRecords()
  useAgentConsole.getState().clear()
})

function renderDemo() {
  return render(
    <MemoryRouter initialEntries={['/demo']}>
      <DemoPage />
      <ApprovalManager />
    </MemoryRouter>,
  )
}

const openScholarship = () =>
  act(() => {
    fireEvent.click(screen.getByRole('radio', { name: /Example · scholarship/i }))
  })

const setRules = () =>
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /Set the rules/i }))
  })

describe('this is not a scholarship app', () => {
  it('lands on the blank, document-driven workspace', () => {
    renderDemo()
    expect(screen.getByText('Your form')).toBeTruthy()
    expect(screen.queryByText(/Horizon Futures Scholarship/i)).toBeNull()
  })

  it('tells you to bring your own form', () => {
    renderDemo()
    expect(screen.getByText(/No fields yet/i)).toBeTruthy()
    expect(screen.getByText(/reads the fields out of it/i)).toBeTruthy()
  })

  it('offers every workspace, with the examples marked as examples', () => {
    renderDemo()
    const picker = screen.getByRole('radiogroup', { name: /Workspace/i })
    expect(within(picker).getAllByRole('radio')).toHaveLength(FORM_DOMAINS.length)
    expect(within(picker).getByRole('radio', { name: /Your own form/i })).toBeTruthy()
    expect(within(picker).getByRole('radio', { name: /Example · scholarship/i })).toBeTruthy()
    expect(within(picker).getByRole('radio', { name: /Example · job application/i })).toBeTruthy()
  })

  it('switches to a completely different form in one click', async () => {
    renderDemo()
    openScholarship()
    await waitFor(() => expect(screen.getByText(/Horizon Futures Scholarship/i)).toBeTruthy())

    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: /Example · job application/i }))
    })
    await waitFor(() => expect(screen.getByText(/Meridian Labs/i)).toBeTruthy())
    expect(screen.queryByText(/Horizon Futures Scholarship/i)).toBeNull()
  })
})

describe('a form built from a document', () => {
  it('fences fields that did not exist a moment ago', async () => {
    renderDemo()
    const store = useRecordStore('custom')

    // Stands in for an upload: the extractor is covered in its own suite.
    act(() => {
      store.getState().addField({
        id: 'passportNumber',
        label: 'Passport number',
        type: 'text',
        group: 'Identity',
        required: true,
      })
      store.getState().setValue('passportNumber', 'X1234567', 'human')
      store.getState().addField({
        id: 'visaType',
        label: 'Visa type',
        type: 'text',
        group: 'Identity',
        required: true,
      })
    })

    await waitFor(() => expect(screen.getByText('Passport number')).toBeTruthy())
    setRules()

    // Your answer is protected; the blank one is the agent's to fill.
    await waitFor(() => expect(screen.getAllByText(/locked — your answer/i).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/agent may fill/i).length).toBeGreaterThan(0)
  })
})

describe('the workspace journey', () => {
  it('shows the four steps so nobody has to guess what to do', () => {
    renderDemo()
    const flow = screen.getByLabelText(/Where you are/i)
    expect(within(flow).getByText(/Set up your record/i)).toBeTruthy()
    expect(within(flow).getByText(/Say what you want done/i)).toBeTruthy()
    expect(within(flow).getByText(/Let the agent work/i)).toBeTruthy()
    expect(within(flow).getByText(/Check and change/i)).toBeTruthy()
  })

  it('locks the agent out until the rules are set', () => {
    renderDemo()
    expect(screen.getByText(/Finish step 2 first/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Start the agent/i })).toBeNull()

    const ledger = screen.getByLabelText(/Delegation ledger/i)
    expect(within(ledger).getByText(/No rules yet/i)).toBeTruthy()
  })

  it('turns the typed sentence into rules, and only then lets the agent run', async () => {
    renderDemo()
    openScholarship()
    await waitFor(() => expect(screen.getByText(/Horizon Futures Scholarship/i)).toBeTruthy())
    setRules()

    const contract = useTaskFenceStore.getState().contractFor('scholarship')
    expect(contract?.status).toBe('active')
    expect(contract?.rules.some((r) => r.effect === 'DENY')).toBe(true)

    expect(screen.getByText(/Here is what that means in practice/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Start the agent/i })).toBeTruthy()
  })

  it('marks an answered field locked and a blank one fillable', async () => {
    renderDemo()
    openScholarship()
    await waitFor(() => expect(screen.getByText(/Horizon Futures Scholarship/i)).toBeTruthy())
    setRules()

    expect(screen.getAllByText(/locked — your answer/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/agent may fill/i).length).toBeGreaterThan(0)
  })

  it('tells you plainly when the agent has finished, and what to do next', async () => {
    renderDemo()
    openScholarship()
    await waitFor(() => expect(screen.getByText(/Horizon Futures Scholarship/i)).toBeTruthy())
    setRules()

    act(() => {
      useAgentConsole.setState({ finishedAt: Date.now(), running: false })
    })

    expect(screen.getByText(/Your agent has finished/i)).toBeTruthy()
    expect(screen.getByText(/Everything below is still yours/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /See exactly what it did/i })).toBeTruthy()
  })
})
