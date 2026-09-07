// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const PLATFORM_HOST = "app.example.com"
const RESELLER_HOST = "chat.acme.com"

const {
  mockResolveTenantByDomain,
  mockResolveTenantFromOAuthState,
  mockResolveOAuthStateCallbackURL,
  mockResolveRelayTarget,
  mockGetSocialAuthForTenant,
  defaultHandler,
  socialHandler,
} = vi.hoisted(() => ({
  mockResolveTenantByDomain: vi.fn(),
  mockResolveTenantFromOAuthState: vi.fn(),
  mockResolveOAuthStateCallbackURL: vi.fn(),
  mockResolveRelayTarget: vi.fn(),
  mockGetSocialAuthForTenant: vi.fn(),
  defaultHandler: vi.fn(() => new Response("default")),
  socialHandler: vi.fn(() => new Response("social")),
}))

vi.mock("@chatbotx.io/auth/server", () => ({
  SOCIAL_PROVIDERS: ["google", "facebook"] as const,
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveTenantByDomain: mockResolveTenantByDomain,
  resolveTenantFromOAuthState: mockResolveTenantFromOAuthState,
  resolveOAuthStateCallbackURL: mockResolveOAuthStateCallbackURL,
  // Run the body immediately — tenant binding is exercised elsewhere.
  withTenant: (_tenantId: string, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    // The route uses the public URL for host comparison; in tests the request
    // URL already carries the public host.
    getPublicUrlFromRequest: (request: Request) => new URL(request.url),
  }
})

vi.mock("@/lib/auth/auth", () => ({
  auth: { handler: defaultHandler },
}))

vi.mock("@/lib/auth/auth-instances", () => ({
  getSocialAuthForTenant: mockGetSocialAuthForTenant,
}))

vi.mock("@/lib/oauth-referer", () => ({
  resolveRelayTarget: mockResolveRelayTarget,
}))

// Redirect re-homing is exercised in auth-redirect.test.ts; here it is a
// pass-through so routing/relay assertions stay isolated.
vi.mock("@/lib/auth-redirect", () => ({
  rewriteAuthRedirectToPublicHost: (_request: Request, response: Response) =>
    response,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn() },
}))

async function loadRoute() {
  vi.resetModules()
  return await import("@/app/api/auth/[...all]/route")
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSocialAuthForTenant.mockResolvedValue({ handler: socialHandler })
})

describe("auth route — white-label relay", () => {
  test("relays the social callback from the platform host to the originating domain", async () => {
    mockResolveTenantFromOAuthState.mockResolvedValue("42")
    mockResolveOAuthStateCallbackURL.mockResolvedValue(
      `https://${RESELLER_HOST}/welcome`,
    )
    const relayTarget = `https://${RESELLER_HOST}/api/auth/callback/google?code=abc&state=xyz`
    mockResolveRelayTarget.mockResolvedValue(relayTarget)

    const { GET } = await loadRoute()
    const response = await GET(
      new Request(
        `https://${PLATFORM_HOST}/api/auth/callback/google?code=abc&state=xyz`,
      ),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(relayTarget)
    expect(socialHandler).not.toHaveBeenCalled()
    expect(defaultHandler).not.toHaveBeenCalled()
  })

  test("on the originating host the callback falls through to the per-provider instance", async () => {
    mockResolveTenantFromOAuthState.mockResolvedValue("42")
    mockResolveOAuthStateCallbackURL.mockResolvedValue(
      `https://${RESELLER_HOST}/welcome`,
    )
    // Re-entry on the reseller host → no relay.
    mockResolveRelayTarget.mockResolvedValue(null)

    const { GET } = await loadRoute()
    const response = await GET(
      new Request(
        `https://${RESELLER_HOST}/api/auth/callback/google?code=abc&state=xyz`,
      ),
    )

    expect(mockGetSocialAuthForTenant).toHaveBeenCalledWith("42", "google")
    expect(socialHandler).toHaveBeenCalledTimes(1)
    expect(await response.text()).toBe("social")
  })

  test("a non-social route uses the default auth instance and never relays", async () => {
    mockResolveTenantByDomain.mockResolvedValue("1")

    const { POST } = await loadRoute()
    const response = await POST(
      new Request(`https://${RESELLER_HOST}/api/auth/get-session`, {
        method: "POST",
        headers: { "x-domain": RESELLER_HOST },
      }),
    )

    expect(mockResolveRelayTarget).not.toHaveBeenCalled()
    expect(mockGetSocialAuthForTenant).not.toHaveBeenCalled()
    expect(defaultHandler).toHaveBeenCalledTimes(1)
    expect(await response.text()).toBe("default")
  })
})

type NextRouteRequest = Parameters<
  typeof import("@/app/api/auth/[...all]/route").OPTIONS
>[0]
const asNextRequest = (req: Request): NextRouteRequest =>
  req as unknown as NextRouteRequest

describe("auth route — CORS (withAuthCors + preflight)", () => {
  const LANDING = "https://konversify.app"
  const EVIL = "https://evil.example"

  async function loadForCors() {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", `https://${PLATFORM_HOST}`)
    vi.stubEnv("AUTH_TRUSTED_LANDING_URL", LANDING)
    return await import("@/app/api/auth/[...all]/route")
  }

  test("a trusted origin gets ACAO + ACAC + appended Vary on POST responses", async () => {
    const { POST } = await loadForCors()
    const response = await POST(
      new Request(`https://${PLATFORM_HOST}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: LANDING },
      }),
    )

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LANDING)
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    )
    expect(response.headers.get("vary")).toContain("Origin")
    // Body and status pass through the reconstruction untouched.
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("default")
  })

  test("set-cookie survives the CORS reconstruction", async () => {
    defaultHandler.mockImplementationOnce(
      () =>
        new Response("ok", {
          headers: { "set-cookie": "better-auth.session_token=t; Path=/" },
        }),
    )
    const { POST } = await loadForCors()
    const response = await POST(
      new Request(`https://${PLATFORM_HOST}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: LANDING },
      }),
    )

    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token=t",
    )
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LANDING)
  })

  test("an untrusted origin gets NO CORS headers", async () => {
    const { POST } = await loadForCors()
    const response = await POST(
      new Request(`https://${PLATFORM_HOST}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: EVIL },
      }),
    )

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull()
  })

  test("Origin:null is not trusted", async () => {
    const { POST } = await loadForCors()
    const response = await POST(
      new Request(`https://${PLATFORM_HOST}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: "null" },
      }),
    )

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })

  test("a request without an Origin header is same-origin: no CORS headers", async () => {
    const { POST } = await loadForCors()
    const response = await POST(
      new Request(`https://${PLATFORM_HOST}/api/auth/sign-in/email`, {
        method: "POST",
      }),
    )

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })

  test("OPTIONS from an untrusted origin is rejected with 403", async () => {
    const { logger } = await import("@/lib/log")
    const { OPTIONS } = await loadForCors()
    const response = await OPTIONS(
      asNextRequest(
        new Request(`https://${PLATFORM_HOST}/api/auth/sign-in/email`, {
          method: "OPTIONS",
          headers: { origin: EVIL },
        }),
      ),
    )

    expect(response.status).toBe(403)
    expect(logger.warn).toHaveBeenCalled()
  })

  test("OPTIONS from a trusted origin gets 204 and echoes the requested headers", async () => {
    const { OPTIONS } = await loadForCors()
    const response = await OPTIONS(
      asNextRequest(
        new Request(`https://${PLATFORM_HOST}/api/auth/sign-in/email`, {
          method: "OPTIONS",
          headers: {
            origin: LANDING,
            "access-control-request-headers": "content-type, x-custom",
          },
        }),
      ),
    )

    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(LANDING)
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    )
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "content-type, x-custom",
    )
    expect(response.headers.get("vary")).toContain("Origin")
  })
})
