import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  MalformedWebhookError,
  mapLsStatus,
  parseWebhookEvent,
  verifyWebhookSignature,
} from "../service/lemonsqueezy"

const SECRET = "test-webhook-secret"

const sign = (body: string): string =>
  createHmac("sha256", SECRET).update(body).digest("hex")

function subscriptionPayload(overrides: {
  customData?: Record<string, string>
  eventName?: string
  webhookId?: string
}): string {
  return JSON.stringify({
    meta: {
      event_name: overrides.eventName ?? "subscription_created",
      webhook_id: overrides.webhookId ?? "evt-1",
      custom_data: overrides.customData,
    },
    data: {
      type: "subscriptions",
      id: "sub-1",
      attributes: {
        status: "active",
        customer_id: "cst-1",
        variant: 12_345,
        current_billing_period_start: "2026-08-01T00:00:00Z",
        current_billing_period_end: "2026-09-01T00:00:00Z",
      },
    },
  })
}

describe("verifyWebhookSignature", () => {
  const body = subscriptionPayload({})

  it("accepts a locally-signed payload", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true)
  })

  it("rejects a signature computed over different bytes", () => {
    expect(verifyWebhookSignature(body, sign("tampered"), SECRET)).toBe(false)
  })

  it("rejects a missing header", () => {
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false)
  })

  it("rejects the correct digest signed with the wrong secret", () => {
    const wrongSecret = createHmac("sha256", "other-secret")
      .update(body)
      .digest("hex")
    expect(verifyWebhookSignature(body, wrongSecret, SECRET)).toBe(false)
  })
})

describe("parseWebhookEvent", () => {
  it("reads event name, ids and custom_data", () => {
    const event = parseWebhookEvent(
      subscriptionPayload({
        customData: { workspace_id: "42" },
        webhookId: "evt-99",
      }),
    )
    expect(event.eventId).toBe("evt-99")
    expect(event.eventName).toBe("subscription_created")
    expect(event.providerSubscriptionId).toBe("sub-1")
    expect(event.providerCustomerId).toBe("cst-1")
    expect(event.custom?.workspace_id).toBe("42")
    expect(event.attributes.status).toBe("active")
  })

  it("derives a stable event id when webhook_id is absent", () => {
    const payload = JSON.parse(subscriptionPayload({})) as {
      meta: Record<string, unknown>
    }
    delete payload.meta.webhook_id
    const body = JSON.stringify(payload)
    const first = parseWebhookEvent(body)
    const second = parseWebhookEvent(body)
    expect(first.eventId).toMatch(/^ls-/)
    expect(first.eventId).toBe(second.eventId)
  })

  it("takes the subscription id from attributes for invoice payloads", () => {
    const body = JSON.stringify({
      meta: { event_name: "subscription_payment_success" },
      data: {
        type: "invoices",
        id: "inv-1",
        attributes: { subscription_id: "sub-9" },
      },
    })
    const event = parseWebhookEvent(body)
    expect(event.providerSubscriptionId).toBe("sub-9")
  })

  it("rejects a payload without meta.event_name", () => {
    expect(() => parseWebhookEvent("{}")).toThrow(MalformedWebhookError)
  })
})

describe("mapLsStatus", () => {
  it("maps every LS status onto the PLAN-C enum", () => {
    expect(mapLsStatus("on_trial")).toBe("trial")
    expect(mapLsStatus("active")).toBe("active")
    expect(mapLsStatus("past_due")).toBe("past_due")
    expect(mapLsStatus("paused")).toBe("past_due")
    expect(mapLsStatus("unpaid")).toBe("past_due")
    expect(mapLsStatus("cancelled")).toBe("canceled")
    expect(mapLsStatus("canceled")).toBe("canceled")
    expect(mapLsStatus("expired")).toBe("expired")
  })
})
