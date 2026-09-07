// @vitest-environment node

import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { processWebhookEvent } = vi.hoisted(() => ({
  processWebhookEvent: vi.fn(),
}))

vi.mock("@chatbotx.io/slice-plans", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/slice-plans")>()
  return {
    ...actual,
    processWebhookEvent,
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

const subscriptionBody = (
  overrides: { customData?: Record<string, string>; testMode?: boolean } = {},
): string =>
  JSON.stringify({
    meta: {
      event_name: "subscription_created",
      webhook_id: "evt-route-1",
      custom_data: overrides.customData ?? { workspace_id: "42" },
      ...(overrides.testMode === undefined
        ? {}
        : { test_mode: overrides.testMode }),
    },
    data: {
      type: "subscriptions",
      id: "sub-1",
      attributes: { status: "active", customer_id: "cst-1" },
    },
  })

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", SECRET)
  processWebhookEvent.mockReset()
  processWebhookEvent.mockResolvedValue({
    status: "applied",
    workspaceId: "42",
  })
})

describe("POST /api/subscription/webhooks/lemonsqueezy", () => {
  test("applies a validly signed payload", async () => {
    const body = subscriptionBody()
    const response = await POST(asRouteRequest(signedRequest(body, sign(body))))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      status: "applied",
    })
    expect(processWebhookEvent).toHaveBeenCalledTimes(1)
    expect(processWebhookEvent.mock.calls[0][0]).toMatchObject({
      eventId: "evt-route-1",
      eventName: "subscription_created",
    })
    expect(processWebhookEvent.mock.calls[0][1]).toBe(body)
  })

  test("rejects a bad signature with 401 and processes nothing", async () => {
    const body = subscriptionBody()
    const response = await POST(
      asRouteRequest(signedRequest(body, sign("different-bytes"))),
    )
    expect(response.status).toBe(401)
    expect(processWebhookEvent).not.toHaveBeenCalled()
  })

  test("rejects a missing signature header with 401", async () => {
    const response = await POST(
      asRouteRequest(signedRequest(subscriptionBody(), null)),
    )
    expect(response.status).toBe(401)
  })

  test("answers 200 duplicate when the processor reports a completed prior apply", async () => {
    processWebhookEvent.mockResolvedValue({
      status: "duplicate",
      workspaceId: null,
    })
    const body = subscriptionBody()
    const response = await POST(asRouteRequest(signedRequest(body, sign(body))))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      status: "duplicate",
    })
  })

  test("answers 500 when processing fails so LS retries the delivery", async () => {
    processWebhookEvent.mockRejectedValue(new Error("boom"))
    const body = subscriptionBody()
    const response = await POST(asRouteRequest(signedRequest(body, sign(body))))
    expect(response.status).toBe(500)
  })

  test("skips events whose test_mode disagrees with LEMONSQUEEZY_MODE", async () => {
    const body = subscriptionBody({ testMode: true })
    const response = await POST(asRouteRequest(signedRequest(body, sign(body))))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      status: "mode-mismatch",
    })
    expect(processWebhookEvent).not.toHaveBeenCalled()
  })

  test("processes test-mode events when the store runs in test mode", async () => {
    vi.stubEnv("LEMONSQUEEZY_MODE", "test")
    const body = subscriptionBody({ testMode: true })
    const response = await POST(asRouteRequest(signedRequest(body, sign(body))))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      status: "applied",
    })
  })

  test("answers 400 for a malformed custom_data workspace id", async () => {
    const body = subscriptionBody({
      customData: { workspace_id: "not-a-number" },
    })
    const response = await POST(asRouteRequest(signedRequest(body, sign(body))))
    expect(response.status).toBe(400)
    expect(processWebhookEvent).not.toHaveBeenCalled()
  })
})
