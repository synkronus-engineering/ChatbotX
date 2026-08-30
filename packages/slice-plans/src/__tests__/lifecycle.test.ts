import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ParsedWebhookEvent } from "../types/providers"

const { insert, update, dbSelect } = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  dbSelect: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { insert, update, select: () => dbSelect() },
}))

const { applyWebhookEvent, createSubscriptionOnProvision, recordEventOnce } =
  await import("../service/lifecycle")

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

/** Captures the `.values(...)` argument and returns the chain shape each query uses. */
function stubInsert(values: unknown[], chain: "returning" | "awaited") {
  let captured: unknown
  const terminal =
    chain === "returning" ? vi.fn(async () => values) : Promise.resolve(values)
  insert.mockImplementation((() => ({
    values: (arg: unknown) => {
      captured = arg
      return chain === "returning"
        ? { onConflictDoNothing: () => ({ returning: terminal }) }
        : {
            onConflictDoNothing: () => terminal,
            onConflictDoUpdate: () => terminal,
          }
    },
  })) as typeof insert)
  return () => captured
}

function stubSelect(rowsByCall: unknown[][]) {
  dbSelect.mockImplementation(() => {
    const rows = rowsByCall.shift() ?? []
    return {
      from: vi.fn(() => ({
        where: vi.fn(async () => rows),
        orderBy: vi.fn(async () => rows),
      })),
    }
  })
}

beforeEach(() => {
  insert.mockReset()
  update.mockReset()
  // default: no plan row matches a variant, no subscription row pre-exists
  stubSelect([])
})

describe("recordEventOnce", () => {
  it("returns true on first insert", async () => {
    stubInsert([{ eventId: "evt-1" }], "returning")
    expect(
      await recordEventOnce({
        eventId: "evt-1",
        eventName: "subscription_created",
        workspaceId: "42",
      }),
    ).toBe(true)
  })

  it("returns false when the event id already exists (replay)", async () => {
    stubInsert([], "returning")
    expect(
      await recordEventOnce({
        eventId: "evt-1",
        eventName: "subscription_created",
        workspaceId: "42",
      }),
    ).toBe(false)
  })
})

describe("applyWebhookEvent", () => {
  it("upserts the subscription for the custom_data workspace", async () => {
    const getValues = stubInsert([{ workspaceId: "42" }], "awaited")
    const result = await applyWebhookEvent(event())
    expect(result).toEqual({ applied: true, workspaceId: "42" })
    const values = getValues() as {
      planKey: string
      status: string
      workspaceId: string
    }
    expect(values.workspaceId).toBe("42")
    expect(values.status).toBe("active")
  })

  it("resolves the workspace from ls_subscription_id when custom_data is absent", async () => {
    const getValues = stubInsert([{ workspaceId: "77" }], "awaited")
    stubSelect([[{ workspaceId: "77", planKey: "pro" }]])
    const result = await applyWebhookEvent(event({ custom: undefined }))
    expect(result.applied).toBe(true)
    expect(result.workspaceId).toBe("77")
    const values = getValues() as { workspaceId: string }
    expect(values.workspaceId).toBe("77")
  })

  it("keeps entitlement active on cancel-at-period-end", async () => {
    const getValues = stubInsert([{ workspaceId: "42" }], "awaited")
    await applyWebhookEvent(
      event({
        eventName: "subscription_cancelled",
        attributes: {
          status: "cancelled",
          cancelled_at: "2026-08-30T00:00:00Z",
        },
      }),
    )
    const values = getValues() as { status: string }
    expect(values.status).toBe("active")
  })

  it("stores expired on the terminal expiry event", async () => {
    const getValues = stubInsert([{ workspaceId: "42" }], "awaited")
    await applyWebhookEvent(
      event({
        eventName: "subscription_expired",
        attributes: {
          status: "expired",
          cancelled_at: "2026-08-30T00:00:00Z",
        },
      }),
    )
    const values = getValues() as { status: string }
    expect(values.status).toBe("expired")
  })

  it("skips events it does not handle", async () => {
    const result = await applyWebhookEvent(
      event({ eventName: "order_created" }),
    )
    expect(result).toEqual({ applied: false, workspaceId: null })
    expect(insert).not.toHaveBeenCalled()
  })

  it("skips when no workspace can be resolved", async () => {
    const result = await applyWebhookEvent(event({ custom: undefined }))
    expect(result.applied).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })
})

describe("createSubscriptionOnProvision", () => {
  const PRO_PLAN_ROW = {
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
  const SUBSCRIPTION_ROW = {
    workspaceId: "42",
    planKey: "pro",
    status: "trial",
    trialEndsAt: new Date("2026-09-13T00:00:00Z"),
    periodStart: null,
    periodEnd: null,
    lsCustomerId: null,
    lsSubscriptionId: null,
  }

  it("writes a pro trial row when the plan has trial days", async () => {
    stubSelect([[PRO_PLAN_ROW], [SUBSCRIPTION_ROW]])
    const getValues = stubInsert([], "awaited")
    const row = await createSubscriptionOnProvision("42")
    const values = getValues() as {
      planKey: string
      status: string
      trialEndsAt: Date | null
    }
    expect(values.planKey).toBe("pro")
    expect(values.status).toBe("trial")
    expect(values.trialEndsAt).toBeInstanceOf(Date)
    expect(row?.status).toBe("trial")
  })
})
