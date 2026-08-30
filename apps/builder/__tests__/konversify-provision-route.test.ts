// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { getCurrentUserId, provisionWorkspace, createSubscription } = vi.hoisted(
  () => ({
    getCurrentUserId: vi.fn(),
    provisionWorkspace: vi.fn(),
    createSubscription: vi.fn(),
  }),
)

const { workspaceFind, workspaceFindById, assertWorkspaceCapacity } =
  vi.hoisted(() => ({
    workspaceFind: vi.fn(),
    workspaceFindById: vi.fn(),
    assertWorkspaceCapacity: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    find: workspaceFind,
    findById: workspaceFindById,
  },
}))

vi.mock("@chatbotx.io/slice-plans", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/slice-plans")>()
  return {
    ...actual,
    assertWorkspaceCapacity,
    createSubscriptionOnProvision: createSubscription,
  }
})

vi.mock("@chatbotx.io/slice-tenancy", () => ({
  provisionWorkspace,
}))

vi.mock("@/lib/auth/utils", () => ({ getCurrentUserId }))
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const { POST } = await import("@/app/api/konversify/provision/route")

type RouteRequest = Parameters<typeof POST>[0]
const asRouteRequest = (req: Request): RouteRequest =>
  req as unknown as RouteRequest

const request = (body: unknown): Request =>
  new Request("http://localhost/api/konversify/provision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  getCurrentUserId.mockReset()
  provisionWorkspace.mockReset()
  createSubscription.mockReset()
  workspaceFind.mockReset()
  assertWorkspaceCapacity.mockReset()
  assertWorkspaceCapacity.mockResolvedValue(undefined)
  provisionWorkspace.mockResolvedValue({ workspaceId: "77", created: true })
  createSubscription.mockResolvedValue(null)
  workspaceFind.mockResolvedValue(undefined)
})

describe("POST /api/konversify/provision", () => {
  test("401 without a session", async () => {
    getCurrentUserId.mockResolvedValue(null)
    const response = await POST(
      asRouteRequest(request({ businessName: "Cafe" })),
    )
    expect(response.status).toBe(401)
  })

  test("provisions the session user's workspace and stamps the trial row", async () => {
    getCurrentUserId.mockResolvedValue("user-1")
    const response = await POST(
      asRouteRequest(request({ businessName: "Cafe Central" })),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      workspaceId: "77",
      created: true,
    })
    expect(provisionWorkspace).toHaveBeenCalledWith({
      ownerId: "user-1",
      name: "Cafe Central",
    })
    expect(createSubscription).toHaveBeenCalledWith("77")
  })

  test("rejects a missing businessName", async () => {
    getCurrentUserId.mockResolvedValue("user-1")
    const response = await POST(asRouteRequest(request({})))
    expect(response.status).toBe(400)
  })

  test("answers 402 when the owner is at the plan's workspace ceiling", async () => {
    getCurrentUserId.mockResolvedValue("user-1")
    const { PlanCapacityError } = await import("@chatbotx.io/slice-plans")
    assertWorkspaceCapacity.mockRejectedValue(
      new PlanCapacityError("workspaces"),
    )
    const response = await POST(
      asRouteRequest(request({ businessName: "Second" })),
    )
    expect(response.status).toBe(402)
    expect(provisionWorkspace).not.toHaveBeenCalled()
  })

  test("returns the existing workspace idempotently", async () => {
    getCurrentUserId.mockResolvedValue("user-1")
    workspaceFind.mockResolvedValue({ id: "77", ownerId: "user-1" })
    provisionWorkspace.mockResolvedValue({ workspaceId: "77", created: false })
    const response = await POST(
      asRouteRequest(request({ businessName: "Cafe" })),
    )
    await expect(response.json()).resolves.toEqual({
      workspaceId: "77",
      created: false,
    })
    expect(assertWorkspaceCapacity).not.toHaveBeenCalled()
  })
})
