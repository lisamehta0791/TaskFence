/**
 * Scripted runs for the built-in Agent Console.
 *
 * These mirror the demo walkthrough in the project document beat for beat, so
 * the recorded video and a judge clicking "Run the agent" see the same thing.
 * The script decides what the agent *attempts*; TaskFence decides what happens.
 */

import { useRecordStore } from '../domains'
import { formToolNames } from '../webmcp/tools/form'
import type { DomainSpec } from '../domains/types'
import { useSubscriptionStore } from '../store/subscriptionStore'
import type { ScenarioStep } from './console'

const PACE = 700

/**
 * Built fresh each run, for whichever workspace you are in, from whatever
 * documents and fields are actually on the page.
 *
 * Nothing is hard-coded to a form: the three demo beats — work done inside the
 * fence, a value the agent had to guess at, and a conflict with an answer you
 * wrote yourself — are *found* in your data. Upload your own PDF to a blank
 * workspace and the same three beats come out of your file.
 */
export function formScenario(domain: DomainSpec): ScenarioStep[] {
  const store = useRecordStore(domain.id)
  const { documents, values, fields } = store.getState()
  const n = formToolNames(domain)
  const noun = domain.form?.noun ?? 'record'
  const label = (id: string) => fields.find((f) => f.id === id)?.label ?? id

  const readable = documents.filter((d) => d.readable)
  const unreadable = documents.filter((d) => !d.readable)

  // What the documents can actually supply, and where it should go.
  const supplied: Array<{ field: string; value: string; documentId: string }> = []
  for (const doc of readable) {
    for (const [field, value] of Object.entries(doc.extracted)) {
      if (!fields.some((f) => f.id === field)) continue
      if (supplied.some((s) => s.field === field)) continue
      supplied.push({ field, value, documentId: doc.id })
    }
  }

  const isBlank = (id: string) => !(values[id]?.value ?? '').trim()
  const fillable = supplied.filter((s) => isBlank(s.field))
  // A document value that contradicts something the human already wrote.
  const conflict = supplied.find((s) => !isBlank(s.field) && values[s.field].value.trim() !== s.value.trim())
  // Required, still blank, and no document covers it.
  const guessNeeded = fields.find(
    (f) => f.required && isBlank(f.id) && !supplied.some((s) => s.field === f.id) && f.type !== 'textarea',
  )

  const steps: ScenarioStep[] = [
    {
      say: 'First, let me check what you have actually delegated to me on this page.',
      call: { name: 'getDelegation', input: { workspace: domain.id } },
      report: (r) => {
        const d = r?.data
        if (!d?.active)
          return 'There is no active delegation yet, so I am not authorised to do anything. Describe the task above first.'
        const off = (d.offLimits ?? []).map((x: any) => x.label).join('; ')
        return `Understood. I may: ${(d.youMay ?? []).map((x: any) => x.label).join('; ')}.${off ? ` Off limits: ${off}.` : ''}`
      },
      waitMs: 300,
    },
    {
      say: `Reading the ${noun} and the requirements.`,
      call: { name: n.get },
      report: (r) => {
        const blanks = (r?.data?.fields ?? []).filter((f: any) => f.status === 'blank')
        return blanks.length
          ? `${blanks.length} fields are still blank: ${blanks.map((f: any) => f.label).join(', ')}.`
          : 'Every field already has an answer.'
      },
      waitMs: PACE,
    },
    { call: { name: n.requirements }, waitMs: PACE },
    {
      say: readable.length
        ? `Now your documents — ${readable.length} I can read.`
        : 'Now your documents.',
      call: { name: n.listDocuments },
      waitMs: PACE,
    },
  ]

  for (const doc of readable.slice(0, 4)) {
    steps.push({ call: { name: n.readDocument, input: { documentId: doc.id } }, waitMs: 380 })
    steps.push({ call: { name: n.uploadDocument, input: { documentId: doc.id } }, waitMs: 280 })
  }

  if (unreadable.length) {
    steps.push({
      say: `I cannot read ${unreadable.map((d) => d.name).join(' or ')} — ${
        unreadable[0].note ?? 'no text could be extracted'
      } I will not guess at what is in it.`,
      waitMs: 500,
    })
  }

  if (fillable.length) {
    steps.push({
      say: `Your documents cover ${fillable.map((s) => label(s.field)).join(', ')}. Filling those in.`,
      waitMs: 400,
    })
    fillable.forEach((s, i) => {
      steps.push({
        call: {
          name: n.update,
          input: { field: s.field, value: s.value, source: 'document', documentId: s.documentId },
        },
        waitMs: i === 0 ? PACE : 380,
      })
    })
  } else {
    steps.push({
      say: 'Nothing in your documents maps onto a blank field, so there is nothing I can fill from them on my own.',
      waitMs: 400,
    })
  }

  if (guessNeeded) {
    steps.push({
      say: `The form still wants ${label(guessNeeded.id).toLowerCase()}, and that is not in any document I can read. I am not going to invent it quietly — I will put a value to you and you can correct it before it is written.`,
      call: {
        name: n.update,
        input: { field: guessNeeded.id, value: placeholderFor(guessNeeded.id), source: 'inference' },
      },
      report: (r) =>
        r?.ok
          ? `Recorded ${r.data.value}${r.data.amendedByHuman ? ' — your figure, not mine.' : '.'}`
          : undefined,
      waitMs: PACE,
    })
  }

  if (conflict) {
    steps.push({
      say: `One conflict: your document says “${conflict.value}” for ${label(conflict.field).toLowerCase()}, but the form already says “${values[conflict.field].value}”. You told me not to change answers you have already given, so I will not do it silently — I will try, and you decide.`,
      call: {
        name: n.update,
        input: {
          field: conflict.field,
          value: conflict.value,
          source: 'document',
          documentId: conflict.documentId,
        },
      },
      report: (r) => (r?.ok ? 'Updated — and that permission has already expired again.' : undefined),
      waitMs: 900,
    })
  }

  steps.push({
    say: `That is everything I can complete. Submitting the ${noun} is final, so it is yours to approve.`,
    call: { name: n.submit, input: { confirm: true } },
    report: (r) => (r?.ok ? `Submitted. Your reference is ${r.data.reference}.` : undefined),
    waitMs: 700,
    when: () => !store.getState().submitted,
  })

  steps.push({
    say: 'Task finished. Everything I did, and everything I was stopped from doing, is in the ledger on the right.',
    waitMs: 400,
  })

  return steps
}

/** A deliberately obvious stand-in, so an unedited guess is easy to spot. */
function placeholderFor(field: string): string {
  if (/income|gap|amount|fee/i.test(field)) return '4,500'
  if (/depend|count|number/i.test(field)) return '4'
  if (/email/i.test(field)) return 'referee@example.edu'
  if (/date|graduat/i.test(field)) return 'June 2027'
  return 'my best estimate — please correct this'
}

export function subscriptionScenario(): ScenarioStep[] {
  return [
    {
      say: 'Checking what you have delegated for your subscriptions.',
      call: { name: 'getDelegation', input: { workspace: 'subscriptions' } },
      waitMs: 300,
    },
    {
      say: 'Reading the account and what it costs you.',
      call: { name: 'listSubscriptions' },
      waitMs: PACE,
    },
    {
      call: { name: 'getSpendSummary' },
      report: (r) =>
        r?.ok
          ? `You are spending ${r.data.monthlyTotal} a month — ${r.data.annualTotal} a year. ${r.data.rarelyUsed.length} services have not been touched in months.`
          : undefined,
      waitMs: PACE,
    },
    {
      say: 'Forge Design Suite has not been used since March. Downgrading it rather than cancelling.',
      call: { name: 'changePlan', input: { subscriptionId: 'sub_forge', plan: 'Starter' } },
      waitMs: PACE,
    },
    {
      say: 'Pulse Fitness is also idle. I will set a reminder before it renews instead of touching it.',
      call: { name: 'setRenewalReminder', input: { subscriptionId: 'sub_pulse', when: '5 days before renewal' } },
      waitMs: PACE,
    },
    {
      say: 'Cancelling Pulse outright would save the most, but that cannot be undone — so it goes to you.',
      call: { name: 'cancelSubscription', input: { subscriptionId: 'sub_pulse' } },
      report: (r) => (r?.ok ? `${r.data.name} cancelled, with your explicit approval.` : undefined),
      waitMs: 700,
      when: () =>
        useSubscriptionStore.getState().subscriptions.find((s) => s.id === 'sub_pulse')?.status !== 'cancelled',
    },
    { say: 'Done. Same fence, different site — nothing in the policy engine changed.', waitMs: 300 },
  ]
}

/**
 * A tiny, deterministic phrase matcher for the free-text box. It is not a
 * model: it maps a handful of phrasings onto tool calls so a judge can poke the
 * agent by hand. Unmatched input is reported honestly rather than guessed at.
 */
export function interpret(text: string): { name: string; input: Record<string, unknown> } | null {
  const t = text.trim().toLowerCase()
  if (!t) return null

  if (/(delegation|permission|allowed|what can you|boundaries)/.test(t)) {
    return { name: 'getDelegation', input: {} }
  }
  if (/(requirement)/.test(t)) return { name: 'getRequirements', input: {} }
  if (/(read|show|get).*(application|form|field)/.test(t) || t === 'read application') {
    return { name: 'getApplication', input: {} }
  }
  if (/(list|show).*(document|file)/.test(t)) return { name: 'listDocuments', input: {} }
  if (/transcript/.test(t)) return { name: 'readDocument', input: { documentId: 'doc_transcript' } }
  if (/income/.test(t) && /(read|open|document)/.test(t)) {
    return { name: 'readDocument', input: { documentId: 'doc_income' } }
  }
  if (/(submit|send it|finalise|finalize)/.test(t)) {
    return { name: 'submitApplication', input: { confirm: true } }
  }
  if (/(subscription|spend)/.test(t)) return { name: 'listSubscriptions', input: {} }
  if (/cancel/.test(t)) return { name: 'cancelSubscription', input: { subscriptionId: 'sub_pulse' } }
  if (/(why|explain|blocked)/.test(t)) return { name: 'explainLastDecision', input: {} }

  const set = t.match(/^(?:set|fill|put|change)\s+([a-z]+)\s+(?:to|=)\s+(.+)$/i)
  if (set) {
    return {
      name: 'updateApplication',
      input: { field: set[1], value: set[2].replace(/^["']|["']$/g, ''), source: 'inference' },
    }
  }
  return null
}
