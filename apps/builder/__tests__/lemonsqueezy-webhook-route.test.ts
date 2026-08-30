// @vitest-environment node

import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { applyWebhookEvent, recordEventOnce } = vi.hoisted(() => ({
  applyWebhookEvent: vi.fn(),
  recordEventOnce: vi.fn(),
}))

vi.mock("@chatbotx.io/slice-plans", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/slice-plans")>()
  return {
    ...actual,
    applyWebhookEvent,
    recordEventOnce,
  }
})

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const { POST } = await import(
  "@/app/api/subscription/webhooks/lemonsqueezy/route"
)

type RouteRequest = Parameters<typeof POST>[0]
const asRouteRequest = (req: Request): RouteRequest =>
  req as unknown as RouteRequest

const SECRET = "whsec-test"

function signedRequest(body: string, signature: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" })
  if (signature !== null) {
    headers.set("x-signature", signature)
  }
  return new Request(
    "http://localhost/api/subscription/webhooks/lemonsqueezy",
    {
      method: "POST",
      headers,
      body,
    },
  )
}

const sign = (body: string): string =>
  createHmac("sha256", SECRET).update(body).digest("hex")

const subscriptionBody = (): string =>
  JSON.stringify({
    meta: {
      event_name: "subscription_created",
      webhook_id: "evt-route-1",
      custom_data: { workspace_id: "42" },
    },
    data: {
      type: "subscriptions",
      id: "sub-1",
      attributes: { status: "active", customer_id: "cst-1" },
    },
  })

beforeEach(() => {
  vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", SECRET)
  applyWebhookEvent.mockReset()
  recordEventOnce.mockReset()
  recordEventOnce.mockResolvedValue(true)
  applyWebhookEvent.mockResolvedValue({ applied: true, workspaceId: "42" })
})

describe("POST /api/subscription/webhooks/lemonsqueezy", () => {
  test("applies a validly signed payload", async () => {
    const response = await POST(
      asRouteRequest(
        signedRequest(subscriptionBody(), sign(subscriptionBody())),
      ),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      status: "applied",
    })
    expect(recordEventOnce).toHaveBeenCalledWith({
      eventId: "evt-route-1",
      eventName: "subscription_created",
      workspaceId: "42",
    })
    expect(applyWebhookEvent).toHaveBeenCalledTimes(1)
  })

  test("rejects a bad signature with 401 and applies nothing", async () => {
    const body = subscriptionBody()
    const response = await POST(
      asRouteRequest(signedRequest(body, sign("different-bytes"))),
    )
    expect(response.status).toBe(401)
    expect(recordEventOnce).not.toHaveBeenCalled()
    expect(applyWebhookEvent).not.toHaveBeenCalled()
  })

  test("rejects a missing signature header with 401", async () => {
    const response = await POST(
      asRouteRequest(signedRequest(subscriptionBody(), null)),
    )
    expect(response.status).toBe(401)
  })

  test("treats a replayed event id as a no-op (200, not re-applied)", async () => {
    recordEventOnce.mockResolvedValue(false)
    const body = subscriptionBody()
    const response = await POST(asRouteRequest(signedRequest(body, sign(body))))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      status: "duplicate",
    })
    expect(applyWebhookEvent).not.toHaveBeenCalled()
  })

  test("still answers 200 (deferred) when applying throws", async () => {
    applyWebhookEvent.mockRejectedValue(new Error("boom"))
    const body = subscriptionBody()
    const response = await POST(asRouteRequest(signedRequest(body, sign(body))))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      status: "deferred",
    })
  })
})
