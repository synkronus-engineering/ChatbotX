import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ParsedWebhookEvent } from "../types/providers"

const { dbTransaction, dbSelect, dbInsert, dbUpdate } = vi.hoisted(() => ({
  dbTransaction: vi.fn(),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => dbTransaction(fn),
    select: () => dbSelect(),
    insert: () => dbInsert(),
    update: () => dbUpdate(),
  },
}))

const {
  createSubscriptionOnProvision,
  processWebhookEvent,
  replayUnappliedEvents,
} = await import("../service/lifecycle")

const event = (
  overrides: Partial<ParsedWebhookEvent> = {},
): ParsedWebhookEvent => ({
  eventId: "evt-1",
  eventName: "subscription_created",
  eventCreatedAt: "2026-08-30T00:00:00Z",
  providerSubscriptionId: "sub-1",
  providerCustomerId: "cst-1",
  custom: { workspace_id: "42" },
  attributes: {
    status: "active",
    variant: 7,
    current_billing_period_start: "2026-08-01T00:00:00Z",
    current_billing_period_end: "2026-09-01T00:00:00Z",
  },
  raw: {},
  ...overrides,
})

const RAW = "raw-body"

interface TxProps {
  /** Optional hook replacing the subscription upsert (to force apply failure). */
  applyFn?: () => Promise<void>
  /** Rows returned by the ls_event dedup insert (empty = conflict/duplicate). */
  dedupInserted: unknown[]
  /** Rows for the existing-event lookup (read when dedupInserted is empty). */
  existingEvent?: { appliedAt: Date | null }[]
  /** Rows for the tenant_subscription lookup by ls_subscription_id. */
  existingSubscription?: { planKey: string; workspaceId: string }[]
}

function makeTx(props: TxProps) {
  const appliedSets: { appliedAt: Date }[] = []
  const upsertValues: unknown[] = []

  const tx = {
    insert: vi.fn(() => ({
      values: (row: Record<string, unknown>) => {
        if ("eventId" in row) {
          return {
            onConflictDoNothing: () => ({
              returning: async () => props.dedupInserted,
            }),
          }
        }
        upsertValues.push(row)
        return {
          onConflictDoUpdate: () =>
            props.applyFn ? props.applyFn() : Promise.resolve(),
        }
      },
    })),
    select: vi.fn(() => {
      const queue = [
        ...(props.existingEvent ?? []),
        ...(props.existingSubscription ?? []),
      ]
      return {
        from: () => ({
          where: async () => queue.splice(0, 1),
        }),
      }
    }),
    update: vi.fn(() => ({
      set: (arg: { appliedAt: Date }) => {
        appliedSets.push(arg)
        return { where: async () => [] }
      },
    })),
  }
  return { tx, appliedSets, upsertValues }
}

/** Wires db.transaction to run against the given tx shape. */
function runWith(props: TxProps) {
  const harness = makeTx(props)
  dbTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(harness.tx),
  )
  return harness
}

beforeEach(() => {
  dbTransaction.mockReset()
  dbSelect.mockReset()
  dbInsert.mockReset()
  dbUpdate.mockReset()
})

describe("processWebhookEvent", () => {
  it("applies the subscription and marks the event applied atomically", async () => {
    const harness = runWith({ dedupInserted: [{ eventId: "evt-1" }] })
    const result = await processWebhookEvent(event(), RAW)
    expect(result).toEqual({ status: "applied", workspaceId: "42" })
    expect(harness.upsertValues[0]).toMatchObject({
      planKey: "free",
      status: "active",
      workspaceId: "42",
    })
    expect(harness.appliedSets).toHaveLength(1)
    expect(harness.appliedSets[0].appliedAt).toBeInstanceOf(Date)
  })

  it("rolls the dedup row back with a failed apply (transaction rejects)", async () => {
    const harness = runWith({
      dedupInserted: [{ eventId: "evt-1" }],
      applyFn: () => Promise.reject(new Error("db down")),
    })
    await expect(processWebhookEvent(event(), RAW)).rejects.toThrow("db down")
    expect(harness.appliedSets).toHaveLength(0)
  })

  it("re-applies an identical resend after a failed first attempt", async () => {
    // First delivery: apply explodes (route 500s, transaction rolled back).
    runWith({
      dedupInserted: [{ eventId: "evt-1" }],
      applyFn: () => Promise.reject(new Error("transient")),
    })
    await expect(processWebhookEvent(event(), RAW)).rejects.toThrow("transient")

    // LS resend: the rollback removed the dedup row, so the insert succeeds
    // again and the apply is attempted — dedup only blocks after success.
    const harness = runWith({ dedupInserted: [{ eventId: "evt-1" }] })
    const result = await processWebhookEvent(event(), RAW)
    expect(result.status).toBe("applied")
    expect(harness.upsertValues).toHaveLength(1)
  })

  it("answers duplicate only when a prior apply completed", async () => {
    const harness = runWith({
      dedupInserted: [],
      existingEvent: [{ appliedAt: new Date("2026-08-30T00:00:00Z") }],
    })
    const result = await processWebhookEvent(event(), RAW)
    expect(result).toEqual({ status: "duplicate", workspaceId: null })
    expect(harness.upsertValues).toHaveLength(0)
  })

  it("re-applies a resend whose earlier attempt never completed", async () => {
    const harness = runWith({
      dedupInserted: [],
      existingEvent: [{ appliedAt: null }],
    })
    const result = await processWebhookEvent(event(), RAW)
    expect(result.status).toBe("applied")
    expect(harness.upsertValues).toHaveLength(1)
  })

  it("dead-letters unresolvable workspaces with appliedAt left null", async () => {
    const harness = runWith({
      dedupInserted: [{ eventId: "evt-1" }],
      existingSubscription: [],
    })
    const result = await processWebhookEvent(event({ custom: undefined }), RAW)
    expect(result).toEqual({ status: "unbound", workspaceId: null })
    expect(harness.appliedSets).toHaveLength(0)
  })

  it("marks unhandled event names applied without touching subscriptions", async () => {
    const harness = runWith({ dedupInserted: [{ eventId: "evt-1" }] })
    const result = await processWebhookEvent(
      event({ eventName: "order_created" }),
      RAW,
    )
    expect(result).toEqual({ status: "skipped-unhandled", workspaceId: null })
    expect(harness.upsertValues).toHaveLength(0)
    expect(harness.appliedSets).toHaveLength(1)
  })

  it("keeps the existing plan when the variant is unknown (never silent pro)", async () => {
    const harness = runWith({
      dedupInserted: [{ eventId: "evt-1" }],
      existingSubscription: [{ planKey: "pro", workspaceId: "42" }],
    })
    // variant 7 maps to no plan row (none carries that ls_variant_id)
    const result = await processWebhookEvent(event({ custom: undefined }), RAW)
    expect(result.status).toBe("applied")
    expect(harness.upsertValues[0]).toMatchObject({ planKey: "pro" })
  })

  it("floors to free when the variant is unknown and no row exists", async () => {
    const harness = runWith({
      dedupInserted: [{ eventId: "evt-1" }],
      existingSubscription: [],
    })
    // workspace resolves via custom_data; no subscription row exists yet and
    // the variant maps to no plan → free floor, never a silent pro.
    await processWebhookEvent(event(), RAW)
    expect(harness.upsertValues[0]).toMatchObject({ planKey: "free" })
  })

  it("maps a known variant to its plan, overriding the existing row's plan", async () => {
    const harness = runWith({
      dedupInserted: [{ eventId: "evt-1" }],
      // existing subscription row (free) is looked up first, then the
      // variant lookup resolves to the pro plan row.
      existingSubscription: [{ planKey: "free", workspaceId: "42" }],
    })
    const PRO_ROW = { key: "pro", lsVariantId: "7" }
    // The queue must live OUTSIDE the select implementation — a fresh queue
    // per call would hand every lookup the same first row.
    type LookupRow =
      | { appliedAt: Date | null }
      | { planKey: string; workspaceId: string }
    const queue: LookupRow[][] = [
      [{ planKey: "free", workspaceId: "42" }],
      [PRO_ROW as unknown as LookupRow],
    ]
    harness.tx.select.mockImplementation(() => ({
      from: () => ({ where: async () => queue.shift() ?? [] }),
    }))

    const result = await processWebhookEvent(event(), RAW)

    expect(result.status).toBe("applied")
    expect(harness.upsertValues[0]).toMatchObject({ planKey: "pro" })
  })

  it("applies subscription_plan_changed with the new variant's plan", async () => {
    const harness = runWith({ dedupInserted: [{ eventId: "evt-1" }] })
    const PRO_ROW = { key: "pro", lsVariantId: "7" }
    type LookupRow =
      | { appliedAt: Date | null }
      | { planKey: string; workspaceId: string }
    const queue: LookupRow[][] = [[], [PRO_ROW as unknown as LookupRow]]
    harness.tx.select.mockImplementation(() => ({
      from: () => ({ where: async () => queue.shift() ?? [] }),
    }))

    const result = await processWebhookEvent(
      event({ eventName: "subscription_plan_changed" }),
      RAW,
    )

    expect(result.status).toBe("applied")
    expect(harness.upsertValues[0]).toMatchObject({ planKey: "pro" })
  })

  it("drops a malformed custom workspace id instead of inserting it", async () => {
    const harness = runWith({ dedupInserted: [{ eventId: "evt-1" }] })
    const result = await processWebhookEvent(
      event({ custom: { workspace_id: "not-a-number" } }),
      RAW,
    )
    expect(result.status).toBe("unbound")
    expect(harness.upsertValues).toHaveLength(0)
  })
})

describe("createSubscriptionOnProvision", () => {
  it("writes a pro trial row when the plan has trial days", async () => {
    const planQueue = [
      [
        {
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
        },
      ],
      [
        {
          workspaceId: "42",
          planKey: "pro",
          status: "trial",
          trialEndsAt: new Date("2026-09-13T00:00:00Z"),
          periodStart: null,
          periodEnd: null,
          lsCustomerId: null,
          lsSubscriptionId: null,
        },
      ],
    ]
    dbSelect.mockImplementation(() => ({
      from: () => ({ where: async () => planQueue.shift() ?? [] }),
    }))
    let insertedRow: Record<string, unknown> | undefined
    dbInsert.mockImplementation(() => ({
      values: (row: Record<string, unknown>) => {
        insertedRow = row
        return { onConflictDoNothing: () => Promise.resolve() }
      },
    }))

    const row = await createSubscriptionOnProvision("42")

    expect(insertedRow).toMatchObject({ planKey: "pro", status: "trial" })
    expect((insertedRow as { trialEndsAt: Date }).trialEndsAt).toBeInstanceOf(
      Date,
    )
    expect(row?.status).toBe("trial")
  })
})

describe("replayUnappliedEvents", () => {
  const SWEPT_ROW = {
    eventId: "evt-1",
    rawPayload: JSON.stringify({
      meta: {
        event_name: "subscription_created",
        custom_data: { workspace_id: "42" },
      },
      data: {
        type: "subscriptions",
        id: "sub-1",
        attributes: { status: "active" },
      },
    }),
  }

  it("re-parses and re-applies unapplied rows", async () => {
    dbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [SWEPT_ROW],
        }),
      }),
    }))
    const harness = runWith({
      dedupInserted: [],
      existingEvent: [{ appliedAt: null }],
    })

    const replayed = await replayUnappliedEvents()

    expect(replayed).toBe(1)
    expect(harness.upsertValues).toHaveLength(1)
    expect(harness.appliedSets).toHaveLength(1)
  })

  it("counts an already-applied replay target as handled", async () => {
    dbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [SWEPT_ROW],
        }),
      }),
    }))
    runWith({
      dedupInserted: [],
      existingEvent: [{ appliedAt: new Date("2026-08-30T00:00:00Z") }],
    })

    const replayed = await replayUnappliedEvents()

    expect(replayed).toBe(1)
  })

  it("survives unparseable rows and keeps sweeping", async () => {
    dbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ eventId: "bad", rawPayload: "not json" }],
        }),
      }),
    }))
    runWith({ dedupInserted: [] })

    const replayed = await replayUnappliedEvents()

    expect(replayed).toBe(0)
  })
})
