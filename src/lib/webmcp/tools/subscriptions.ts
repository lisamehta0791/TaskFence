/**
 * WebMCP tools for the second, contrasting domain: subscription clean-up.
 *
 * Nothing in this file changed the policy engine, the guard, the ledger or the
 * approval manager. A new domain is a DomainSpec plus tool executors — which is
 * the point: TaskFence is a pattern, not a one-off hack for one form.
 *
 * There is no payment processing here. Prices are fictional display data.
 */

import { SUBSCRIPTION_PLANS, subscriptionsDomain } from '../../domains/subscriptions'
import { useSubscriptionStore } from '../../store/subscriptionStore'
import type { WebMCPTool } from '../adapter'
import { guarded } from '../guard'

const domain = subscriptionsDomain

function subName(id: string): string {
  return useSubscriptionStore.getState().subscriptions.find((s) => s.id === id)?.name ?? id
}

export const subscriptionTools: WebMCPTool[] = [
  {
    name: 'listSubscriptions',
    description:
      'List every subscription on the account with its plan, monthly price, renewal date, status and when it was last used.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: (input) =>
      guarded(
        { domain, tool: 'listSubscriptions', args: input, title: 'Read subscriptions', intent: 'List all subscriptions' },
        () => ({
          subscriptions: useSubscriptionStore.getState().subscriptions.map((s) => ({
            subscriptionId: s.id,
            name: s.name,
            category: s.category,
            plan: s.plan,
            priceMonthly: s.priceMonthly,
            renewsOn: s.renewsOn,
            status: s.status,
            lastUsed: s.lastUsed,
            availablePlans: SUBSCRIPTION_PLANS[s.id] ?? [],
          })),
        }),
      ),
  },

  {
    name: 'getSubscription',
    description: 'Read one subscription in detail, including the plans it can be moved to.',
    inputSchema: {
      type: 'object',
      properties: { subscriptionId: { type: 'string', description: 'Id from listSubscriptions.' } },
      required: ['subscriptionId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: (input) => {
      const id = String(input.subscriptionId ?? '')
      return guarded(
        { domain, tool: 'getSubscription', args: input, field: id, title: 'Read subscription', detail: subName(id) },
        () => {
          const sub = useSubscriptionStore.getState().subscriptions.find((s) => s.id === id)
          if (!sub) throw new Error(`No subscription with id "${id}".`)
          return { ...sub, availablePlans: SUBSCRIPTION_PLANS[id] ?? [] }
        },
      )
    },
  },

  {
    name: 'getSpendSummary',
    description: 'Read a summary of monthly and annual spend, broken down by category and by how recently each service was used.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: (input) =>
      guarded(
        { domain, tool: 'getSpendSummary', args: input, title: 'Read spend summary', intent: 'Summarise spending' },
        () => {
          const subs = useSubscriptionStore.getState().subscriptions.filter((s) => s.status !== 'cancelled')
          const monthly = subs.reduce((sum, s) => sum + (s.status === 'active' ? s.priceMonthly : 0), 0)
          const stale = subs.filter((s) => /month/.test(s.lastUsed))
          return {
            monthlyTotal: Number(monthly.toFixed(2)),
            annualTotal: Number((monthly * 12).toFixed(2)),
            activeCount: subs.filter((s) => s.status === 'active').length,
            rarelyUsed: stale.map((s) => ({ subscriptionId: s.id, name: s.name, lastUsed: s.lastUsed })),
          }
        },
      ),
  },

  {
    name: 'changePlan',
    description: 'Move a subscription to a different plan (for example, downgrade it). Reversible.',
    inputSchema: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string' },
        plan: { type: 'string', description: 'One of availablePlans for that subscription.' },
      },
      required: ['subscriptionId', 'plan'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: (input) => {
      const id = String(input.subscriptionId ?? '')
      const plan = String(input.plan ?? '')
      return guarded(
        {
          domain,
          tool: 'changePlan',
          args: input,
          field: id,
          source: 'inference',
          title: 'Change plan',
          detail: `${subName(id)} → ${plan}`,
          intent: `Move ${subName(id)} to the ${plan} plan`,
        },
        (args) => {
          const finalPlan = String(args.plan ?? plan)
          const allowed = SUBSCRIPTION_PLANS[id] ?? []
          if (allowed.length && !allowed.includes(finalPlan)) {
            throw new Error(`"${finalPlan}" is not an available plan. Options: ${allowed.join(', ')}.`)
          }
          const updated = useSubscriptionStore.getState().changePlan(id, finalPlan)
          if (!updated) throw new Error(`No subscription with id "${id}".`)
          return { subscriptionId: id, plan: finalPlan, name: updated.name }
        },
      )
    },
  },

  {
    name: 'pauseSubscription',
    description: 'Pause a subscription. Reversible — billing stops until it is resumed.',
    inputSchema: {
      type: 'object',
      properties: { subscriptionId: { type: 'string' } },
      required: ['subscriptionId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: (input) => {
      const id = String(input.subscriptionId ?? '')
      return guarded(
        {
          domain,
          tool: 'pauseSubscription',
          args: input,
          field: id,
          source: 'inference',
          title: 'Pause subscription',
          detail: subName(id),
          intent: `Pause ${subName(id)}`,
        },
        () => {
          const updated = useSubscriptionStore.getState().pause(id)
          if (!updated) throw new Error(`No subscription with id "${id}".`)
          return { subscriptionId: id, status: 'paused', name: updated.name }
        },
      )
    },
  },

  {
    name: 'setRenewalReminder',
    description: 'Set a reminder before a subscription renews. Reversible and low risk.',
    inputSchema: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string' },
        when: { type: 'string', description: 'e.g. "3 days before renewal".' },
      },
      required: ['subscriptionId', 'when'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: (input) => {
      const id = String(input.subscriptionId ?? '')
      const when = String(input.when ?? '3 days before renewal')
      return guarded(
        {
          domain,
          tool: 'setRenewalReminder',
          args: input,
          field: id,
          source: 'inference',
          title: 'Set renewal reminder',
          detail: `${subName(id)} — ${when}`,
        },
        () => {
          useSubscriptionStore.getState().setReminder(id, when)
          return { subscriptionId: id, when }
        },
      )
    },
  },

  {
    name: 'cancelSubscription',
    description:
      'Cancel a subscription outright. This is irreversible in this demo, so TaskFence always pauses it for explicit human approval.',
    inputSchema: {
      type: 'object',
      properties: { subscriptionId: { type: 'string' } },
      required: ['subscriptionId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    execute: (input) => {
      const id = String(input.subscriptionId ?? '')
      return guarded(
        {
          domain,
          tool: 'cancelSubscription',
          args: input,
          field: id,
          source: 'inference',
          title: 'Cancel subscription',
          detail: `${subName(id)} — cannot be undone`,
          intent: `Cancel ${subName(id)} permanently`,
        },
        () => {
          const updated = useSubscriptionStore.getState().cancel(id)
          if (!updated) throw new Error(`No subscription with id "${id}".`)
          return { subscriptionId: id, status: 'cancelled', name: updated.name }
        },
      )
    },
  },
]
