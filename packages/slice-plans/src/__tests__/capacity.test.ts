import { beforeEach, describe, expect, it, vi } from "vitest"

const { dbSelect } = vi.hoisted(() => ({ dbSelect: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { select: () => dbSelect() },
}))

const {
  assertChannelCapacity,
  assertMemberCapacity,
  assertWorkspaceCapacity,
  getCapacitySnapshot,
  PlanCapacityError,
} = await import("../service/capacity")

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

const FREE_PLAN = {
  ...PRO_PLAN,
  key: "free",
  workspacesLimit: 1,
  channelsLimit: 2,
  membersLimit: 3,
}

const PRO_TRIAL_SUB = {
  workspaceId: "1",
  planKey: "pro",
  status: "trial",
  trialEndsAt: new Date("2026-09-13T00:00:00Z"),
  periodStart: null,
  periodEnd: null,
  lsCustomerId: null,
  lsSubscriptionId: null,
}

/**
 * The snapshot and gates only use `select().from(x).where(y)` chains, so one
 * mock shape covers every query; rows are queued in deterministic call order
 * (the snapshot queries sequentially for exactly this reason).
 */
function queueRows(...rows: unknown[][]) {
  dbSelect.mockImplementation(() => {
    const next = rows.shift() ?? []
    return {
      from: vi.fn(() => ({ where: vi.fn(async () => next) })),
    }
  })
}

const count = (value: number) => [{ value }]

const MISSING_PLAN_ERROR = /ent\.plan row missing/

beforeEach(() => {
  dbSelect.mockReset()
})

describe("getCapacitySnapshot", () => {
  it("maps effective-plan limits against live counts", async () => {
    queueRows(
      [{ id: "1" }], // owned workspaces (owner plan state)
      [PRO_TRIAL_SUB], // subscription row for owned workspace
      [PRO_PLAN], // plan row for the subscription
      [PRO_TRIAL_SUB], // subscription row for the target workspace
      [PRO_PLAN], // plan row for the target workspace
      count(1), // owned workspaces count
      count(2), // connected channels count
      count(4), // distinct members count
    )

    const snapshot = await getCapacitySnapshot({
      ownerId: "user-1",
      workspaceId: "1",
    })

    expect(snapshot).toEqual([
      { metric: "workspaces", limit: 10, used: 1 },
      { metric: "channels", limit: 10, used: 2 },
      { metric: "members", limit: 15, used: 4 },
    ])
  })

  it("falls back to free limits without a subscription row", async () => {
    queueRows(
      [{ id: "1" }],
      [], // no subscription for owned workspace
      [FREE_PLAN],
      [], // no subscription for target workspace
      [FREE_PLAN],
      count(1),
      count(0),
      count(1),
    )

    const snapshot = await getCapacitySnapshot({
      ownerId: "user-1",
      workspaceId: "1",
    })

    expect(snapshot).toEqual([
      { metric: "workspaces", limit: 1, used: 1 },
      { metric: "channels", limit: 2, used: 0 },
      { metric: "members", limit: 3, used: 1 },
    ])
  })
})

describe("capacity gates", () => {
  it("blocks the workspace metric at the owner's plan ceiling", async () => {
    queueRows(
      [{ id: "1" }],
      [PRO_TRIAL_SUB],
      [PRO_PLAN],
      count(10), // already at pro's workspaces limit
    )
    await expect(assertWorkspaceCapacity("user-1")).rejects.toBeInstanceOf(
      PlanCapacityError,
    )
  })

  it("blocks channels at the free ceiling", async () => {
    queueRows(
      [], // no subscription
      [FREE_PLAN],
      count(2), // free channels limit reached
    )
    await expect(assertChannelCapacity("1")).rejects.toThrowError(
      PlanCapacityError,
    )
  })

  it("fails loudly when the plan row is missing (integrity break)", async () => {
    queueRows(
      [], // no subscription
      [], // and no plan row — the seed is gone
    )
    await expect(assertChannelCapacity("1")).rejects.toThrow(MISSING_PLAN_ERROR)
  })

  it("passes members under the ceiling", async () => {
    queueRows([PRO_TRIAL_SUB], [PRO_PLAN], count(4))
    await expect(assertMemberCapacity("1")).resolves.toBeUndefined()
  })
})
