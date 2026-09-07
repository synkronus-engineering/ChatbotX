// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mint, guard, getCurrentUserAndTargetWorkspace } = vi.hoisted(() => ({
  mint: vi.fn(async (_auth: unknown, _input: unknown) => "signed-jwt-token"),
  guard: vi.fn(),
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/auth", () => ({
  isAccessTokenIdpEnabled: () => true,
  mintWorkspaceAccessToken: mint,
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  resolveGuardedWorkspaceId: guard,
}))

vi.mock("@/lib/auth/utils", () => ({ getCurrentUserAndTargetWorkspace }))

vi.mock("@/lib/auth/auth", () => ({ auth: {} }))

vi.mock("@/lib/tools", () => ({
  toolUrl: (tool: string) => `https://${tool}.konversify.app`,
}))

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))

const { default: SocialToolPage } = await import(
  "@/app/space/[workspaceId]/(tools)/social/page"
)

const params = (workspaceId: string) => ({
  params: Promise.resolve({ workspaceId }),
})

beforeEach(() => {
  vi.clearAllMocks()
  // The page destructures props, so the guard receives the raw params promise.
  guard.mockImplementation(
    async (p: Promise<{ workspaceId: string }>) => (await p).workspaceId,
  )
  getCurrentUserAndTargetWorkspace.mockResolvedValue({
    user: { id: "user-1", email: "owner@example.com" },
    targetWorkspaceMember: { role: "owner" },
  })
})

describe("social tool page — authorization chain (contract 1/3)", () => {
  test("mints with the route-param workspace and the TARGET member's role", async () => {
    // The session user is a mere agent on the workspace in the URL.
    getCurrentUserAndTargetWorkspace.mockResolvedValue({
      user: { id: "user-1", email: "agent@example.com" },
      targetWorkspaceMember: { role: "agent" },
    })

    await SocialToolPage(params("777"))

    expect(mint).toHaveBeenCalledTimes(1)
    // (authInstance, input) — the claims come from the second argument.
    const input = mint.mock.calls[0][1] as {
      role: string
      ttlSeconds: number
      user: { email: string; id: string }
      workspaceId: string
    }
    expect(input.workspaceId).toBe("777")
    expect(input.role).toBe("agent")
    expect(input.user).toEqual({
      id: "user-1",
      email: "agent@example.com",
    })
    expect(input.ttlSeconds).toBe(120)
  })

  test("the token travels only in the URL fragment, never the query", async () => {
    const element = (await SocialToolPage(params("777"))) as {
      props: { children: { props: { src: string } } }
    }

    const src = element.props.children.props.src
    expect(src.startsWith("https://social.konversify.app/sso#t=")).toBe(true)
    expect(src).toContain("#t=signed-jwt-token")
    // Nothing before the fragment may carry the token.
    const beforeFragment = src.split("#")[0]
    expect(beforeFragment.includes("signed-jwt-token")).toBe(false)
  })

  test("a non-member of the route-param workspace 404s before any mint", async () => {
    guard.mockRejectedValue(new Error("NEXT_NOT_FOUND"))

    await expect(SocialToolPage(params("888"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    )
    expect(mint).not.toHaveBeenCalled()
  })

  test("a session that resolves to no membership 404s without minting", async () => {
    getCurrentUserAndTargetWorkspace.mockResolvedValue(null)

    await expect(SocialToolPage(params("999"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    )
    expect(mint).not.toHaveBeenCalled()
  })
})
