import type { DomainSpec, FieldSpec } from './types'

/**
 * Second, contrasting domain (stretch goal from the design doc).
 *
 * The point of this page is that the policy engine, ledger, approval manager
 * and WebMCP guard are re-used unchanged — only the DomainSpec and the tool
 * implementations differ. Nothing here touches real money: there is no payment
 * processing anywhere in this project.
 */

export interface SubscriptionRecord {
  id: string
  name: string
  category: string
  plan: string
  priceMonthly: number
  renewsOn: string
  status: 'active' | 'paused' | 'cancelled'
  lastUsed: string
  note?: string
}

export const SUBSCRIPTION_SEED: SubscriptionRecord[] = [
  {
    id: 'sub_lumen',
    name: 'Lumen Video',
    category: 'Streaming',
    plan: 'Premium 4K',
    priceMonthly: 17.99,
    renewsOn: '2026-09-14',
    status: 'active',
    lastUsed: '2 days ago',
  },
  {
    id: 'sub_forge',
    name: 'Forge Design Suite',
    category: 'Creative tools',
    plan: 'Pro annual',
    priceMonthly: 42.0,
    renewsOn: '2026-11-02',
    status: 'active',
    lastUsed: '6 months ago',
    note: 'Used for a project that finished in March.',
  },
  {
    id: 'sub_atlas',
    name: 'Atlas Cloud Storage',
    category: 'Utilities',
    plan: '2 TB',
    priceMonthly: 9.99,
    renewsOn: '2026-09-03',
    status: 'active',
    lastUsed: 'yesterday',
  },
  {
    id: 'sub_pulse',
    name: 'Pulse Fitness',
    category: 'Health',
    plan: 'Unlimited classes',
    priceMonthly: 34.5,
    renewsOn: '2026-09-21',
    status: 'active',
    lastUsed: '4 months ago',
  },
  {
    id: 'sub_verse',
    name: 'Verse Audiobooks',
    category: 'Reading',
    plan: 'Standard',
    priceMonthly: 11.0,
    renewsOn: '2026-10-08',
    status: 'paused',
    lastUsed: '3 weeks ago',
  },
]

export const SUBSCRIPTION_PLANS: Record<string, string[]> = {
  sub_lumen: ['Basic', 'Standard HD', 'Premium 4K'],
  sub_forge: ['Starter', 'Pro monthly', 'Pro annual'],
  sub_atlas: ['200 GB', '2 TB', '5 TB'],
  sub_pulse: ['Off-peak', 'Unlimited classes'],
  sub_verse: ['Standard', 'Family'],
}

export const subscriptionFields: FieldSpec[] = SUBSCRIPTION_SEED.map((s) => ({
  id: s.id,
  label: s.name,
  type: 'select',
  group: s.category,
  required: false,
  options: SUBSCRIPTION_PLANS[s.id],
}))

export const subscriptionsDomain: DomainSpec = {
  id: 'subscriptions',
  route: '/subscriptions',
  taskTitle: 'Subscription clean-up',
  subject: 'subscriptions',
  readTools: ['listSubscriptions', 'getSubscription', 'getSpendSummary'],
  writeTools: ['changePlan', 'pauseSubscription', 'setRenewalReminder'],
  uploadTools: [],
  submitTools: [],
  deleteTools: ['cancelSubscription'],
  allTools: [
    'listSubscriptions',
    'getSubscription',
    'getSpendSummary',
    'changePlan',
    'pauseSubscription',
    'setRenewalReminder',
    'cancelSubscription',
  ],
  irreversibleTools: ['cancelSubscription'],
  operationOf: {
    listSubscriptions: 'READ',
    getSubscription: 'READ',
    getSpendSummary: 'READ',
    changePlan: 'WRITE',
    pauseSubscription: 'WRITE',
    setRenewalReminder: 'WRITE',
    cancelSubscription: 'DELETE',
  },
  fields: subscriptionFields,
  exampleStatement:
    "Find subscriptions I haven't used in months and downgrade them. Don't cancel anything without asking me first.",
  altStatements: [
    'Review my subscriptions and tell me where I am wasting money. Do not change anything.',
    'Pause anything I have not used in three months, but never cancel.',
  ],
}
