/**
 * Seed catalog (PLAN-C task 2). The migration inserts these rows; the
 * constants here stay the single source so schema drift is impossible — the
 * seed SQL is generated from this shape, and lookups at runtime read the DB.
 */
export const PLAN_KEYS = {
  free: "free",
  pro: "pro",
} as const

export type PlanKey = (typeof PLAN_KEYS)[keyof typeof PLAN_KEYS]

export interface PlanSeed {
  botMessagesLimit: number
  channelsLimit: number
  contactsLimit: number
  features: string[]
  key: PlanKey
  /**
   * Left NULL until the LS product exists — EXEC-TRACKS §LS state records the
   * human step (create "Konversify Pro" $29/mo in test + live mode); the
   * orchestrator then fills the variant ids here.
   */
  lsVariantId: string | null
  membersLimit: number
  monthlyPriceCents: number
  name: string
  trialDays: number
  workspacesLimit: number
}

export const PLAN_SEEDS: PlanSeed[] = [
  {
    key: PLAN_KEYS.free,
    name: "Free",
    workspacesLimit: 1,
    channelsLimit: 2,
    membersLimit: 3,
    contactsLimit: 1000,
    botMessagesLimit: 500,
    features: [],
    monthlyPriceCents: 0,
    trialDays: 0,
    lsVariantId: null,
  },
  {
    key: PLAN_KEYS.pro,
    name: "Pro",
    workspacesLimit: 10,
    channelsLimit: 10,
    membersLimit: 15,
    contactsLimit: 10_000,
    botMessagesLimit: 5000,
    features: [
      "commerce",
      "branding",
      "domains",
      "audit",
      "email",
      "api",
      "advancedAI",
    ],
    monthlyPriceCents: 2900,
    trialDays: 14,
    lsVariantId: null,
  },
]
