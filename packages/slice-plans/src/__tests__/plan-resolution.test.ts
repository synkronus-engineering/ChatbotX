import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SubscriptionRecord } from "../service/plan-resolution"

const { dbSelect } = vi.hoisted(() => ({ dbSelect: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { select: () => dbSelect() },
}))

const { assertTrialNotExpired, resolveEffectivePlan } = await import(
  "../service/plan-resolution"
)

const PRO_PLAN = {
  key: "pro",
  name: "Pro",
  workspacesLimit: 10,
  channelsLimit: 10,
  membersLimit: 15,
  contactsLimit: 10_000,
  botMessagesLimit: 5000,
  features: [],
  monthlyPriceCents: 2900,
  trialDays: 14,
  lsVariantId: null,
}

const FREE_PLAN = { ...PRO_PLAN, key: "free", name: "Free" }

const subscription = (
  overrides: Partial<SubscriptionRecord> = {},
): SubscriptionRecord => ({
  workspaceId: "1",
  planKey: "pro",
  status: "trial",
  trialEndsAt: new Date("2026-09-10T00:00:00Z"),
  periodStart: null,
  periodEnd: null,
  lsCustomerId: null,
  lsSubscriptionId: null,
  ...overrides,
})

/** Queue table rows per getPlanByKey/getSubscription call order. */
function tableReturns(...rows: unknown[][]): void {
  dbSelect.mockImplementation(() => {
    const next = rows.shift() ?? []
    return {
      from: vi.fn(() => ({
        where: vi.fn(async () => next),
        orderBy: vi.fn(async () => next),
      })),
    }
  })
}

beforeEach(() => {
  dbSelect.mockReset()
})

describe("assertTrialNotExpired", () => {
  const now = new Date("2026-08-30T00:00:00Z")

  it("keeps an unexpired trial entitled", () => {
    expect(assertTrialNotExpired(subscription(), now)).toBe(true)
  })

  it("expires a trial past its window", () => {
    expect(
      assertTrialNotExpired(
        subscription({ trialEndsAt: new Date("2026-08-01T00:00:00Z") }),
        now,
      ),
    ).toBe(false)
  })

  it("treats a trial without an end date as unexpired", () => {
    expect(
      assertTrialNotExpired(subscription({ trialEndsAt: null }), now),
    ).toBe(true)
  })
})

describe("resolveEffectivePlan", () => {
  it("falls back to free for a workspace without a subscription row", async () => {
    tableReturns([FREE_PLAN], [])
    const state = await resolveEffectivePlan("1")
    expect(state.effectivePlanKey).toBe("free")
    expect(state.onTrial).toBe(false)
  })

  it("grants the stored plan on an unexpired trial", async () => {
    tableReturns([subscription()], [PRO_PLAN])
    const state = await resolveEffectivePlan("1")
    expect(state.effectivePlanKey).toBe("pro")
    expect(state.onTrial).toBe(true)
  })

  it("downgrades an expired trial to free at read time", async () => {
    tableReturns(
      [subscription({ trialEndsAt: new Date("2026-08-01T00:00:00Z") })],
      [FREE_PLAN],
    )
    const state = await resolveEffectivePlan("1")
    expect(state.effectivePlanKey).toBe("free")
    expect(state.onTrial).toBe(false)
  })

  it.each([
    "expired",
    "canceled",
  ] as const)("downgrades a %s subscription to free", async (status) => {
    tableReturns([subscription({ status })], [FREE_PLAN])
    const state = await resolveEffectivePlan("1")
    expect(state.effectivePlanKey).toBe("free")
  })

  it("keeps past_due entitled (grace)", async () => {
    tableReturns([subscription({ status: "past_due" })], [PRO_PLAN])
    const state = await resolveEffectivePlan("1")
    expect(state.effectivePlanKey).toBe("pro")
  })
})
