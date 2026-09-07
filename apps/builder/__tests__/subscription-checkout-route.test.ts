// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  getCurrentUserId,
  workspaceFindById,
  resolveEffectivePlan,
  getPlanByKey,
  createLsCheckout,
} = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  workspaceFindById: vi.fn(),
  resolveEffectivePlan: vi.fn(),
  getPlanByKey: vi.fn(),
  createLsCheckout: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { findById: workspaceFindById },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/slice-plans", () => ({
  PLAN_KEYS: { free: "free", pro: "pro" },
  resolveEffectivePlan,
  getPlanByKey,
  createLsCheckout,
}))

vi.mock("@/lib/auth/utils", () => ({ getCurrentUserId }))
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const { POST } = await import("@/app/api/subscription/checkout/route")

type RouteRequest = Parameters<typeof POST>[0]
const asRouteRequest = (req: Request): RouteRequest =>
  req as unknown as RouteRequest

const WORKSPACE = { id: "77", ownerId: "user-1" }

const request = (body: unknown): Request =>
  new Request("http://localhost/api/subscription/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const PLAN_FREE = { key: "free", monthlyPriceCents: 0 }
const PLAN_PRO = {
  key: "pro",
  monthlyPriceCents: 2900,
  lsVariantId: "variant-1",
  name: "Pro",
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserId.mockResolvedValue("user-1")
  workspaceFindById.mockResolvedValue(WORKSPACE)
  resolveEffectivePlan.mockResolvedValue({
    effectivePlanKey: "free",
    onTrial: false,
    plan: PLAN_FREE,
    subscription: null,
  })
  getPlanByKey.mockResolvedValue(PLAN_PRO)
  createLsCheckout.mockResolvedValue({
    checkoutUrl: "https://checkout.example/x",
    expiresAt: null,
  })
})

describe("POST /api/subscription/checkout", () => {
  test("401 without a session", async () => {
    getCurrentUserId.mockResolvedValue(null)
    const response = await POST(asRouteRequest(request({ workspaceId: "77" })))
    expect(response.status).toBe(401)
  })

  test("400 when workspaceId is missing", async () => {
    const response = await POST(asRouteRequest(request({})))
    expect(response.status).toBe(400)
  })

  test("404 for an unknown workspace id", async () => {
    const { ChatbotXException } = await import("@chatbotx.io/business/errors")
    workspaceFindById.mockRejectedValue(new ChatbotXException("nope"))
    const response = await POST(asRouteRequest(request({ workspaceId: "77" })))
    expect(response.status).toBe(404)
  })

  test("403 when the caller is not the owner", async () => {
    workspaceFindById.mockResolvedValue({ ...WORKSPACE, ownerId: "user-2" })
    const response = await POST(asRouteRequest(request({ workspaceId: "77" })))
    expect(response.status).toBe(403)
  })

  test("409 when a pro subscription is already active", async () => {
    resolveEffectivePlan.mockResolvedValue({
      effectivePlanKey: "pro",
      onTrial: false,
      plan: PLAN_PRO,
      subscription: { status: "active" },
    })
    const response = await POST(asRouteRequest(request({ workspaceId: "77" })))
    expect(response.status).toBe(409)
    expect(createLsCheckout).not.toHaveBeenCalled()
  })

  test("503 while the LS variant is unconfigured", async () => {
    getPlanByKey.mockResolvedValue({ ...PLAN_PRO, lsVariantId: null })
    const response = await POST(asRouteRequest(request({ workspaceId: "77" })))
    expect(response.status).toBe(503)
    expect(createLsCheckout).not.toHaveBeenCalled()
  })

  test("502 when LS checkout creation fails", async () => {
    createLsCheckout.mockRejectedValue(new Error("ls down"))
    const response = await POST(asRouteRequest(request({ workspaceId: "77" })))
    expect(response.status).toBe(502)
  })

  test("returns the hosted checkout url on success", async () => {
    const response = await POST(asRouteRequest(request({ workspaceId: "77" })))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: "https://checkout.example/x",
      expiresAt: null,
    })
    expect(createLsCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        variantId: "variant-1",
        workspaceId: "77",
        monthlyPriceCents: 2900,
        planName: "Pro",
      }),
    )
  })

  test("allows checkout from a trial (not yet active pro)", async () => {
    resolveEffectivePlan.mockResolvedValue({
      effectivePlanKey: "pro",
      onTrial: true,
      plan: PLAN_PRO,
      subscription: { status: "trial" },
    })
    const response = await POST(asRouteRequest(request({ workspaceId: "77" })))
    expect(response.status).toBe(200)
  })
})
