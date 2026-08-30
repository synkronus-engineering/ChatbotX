import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Hoisted mock handles. `vi.mock` factories run before module top-level, so any
 * value a factory references must be created with `vi.hoisted`.
 */
const { betterAuthMock, drizzleAdapterMock, jwtMock } = vi.hoisted(() => ({
  betterAuthMock: vi.fn((config: Record<string, unknown>) => config),
  drizzleAdapterMock: vi.fn(() => ({})),
  jwtMock: vi.fn((options: Record<string, unknown>) => ({
    id: "jwt",
    options,
  })),
}))

// Mirrors bearer-plugin.test.ts: stub `betterAuth` to hand back its config so
// the plugin list can be inspected without a live DB.
vi.mock("better-auth", async () => {
  const actual =
    await vi.importActual<typeof import("better-auth")>("better-auth")
  return {
    ...actual,
    betterAuth: betterAuthMock,
  }
})

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: drizzleAdapterMock,
}))

vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}))

vi.mock("better-auth/plugins", () => ({
  anonymous: () => ({ id: "anonymous" }),
  bearer: () => ({ id: "bearer" }),
  jwt: jwtMock,
  magicLink: () => ({ id: "magic-link" }),
  oneTimeToken: () => ({ id: "one-time-token" }),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  accountModel: {},
  jwkModel: {},
  ROOT_TENANT_ID: "1",
  sessionModel: {},
  userModel: {},
  verificationModel: {},
}))

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { listActiveDomains: vi.fn().mockResolvedValue([]) },
  platformCredentialService: {
    findDecryptedForUser: vi.fn(),
    findDecryptedPlatform: vi.fn(),
  },
  resolveTenantSettingsByDomain: vi.fn(),
  tenantService: { findById: vi.fn() },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "test-id",
  getPublicOriginFromRequest: vi.fn(),
}))

vi.mock("@chatbotx.io/mail", () => ({
  DEFAULT_FORGOT_PASSWORD_SUBJECT: "reset",
  DEFAULT_MAGIC_LINK_SUBJECT: "magic",
  DEFAULT_SIGNUP_SUBJECT: "signup",
  sendMagicLink: vi.fn(),
  sendResetPassword: vi.fn(),
  sendSignUpVerification: vi.fn(),
}))

const ISSUER = "https://my.example.com"
const AUDIENCE = "konversify-tools"
const COOKIE_DOMAIN = ".example.com"

type AuthConfigShape = {
  plugins: Array<{ id: string; options?: Record<string, unknown> }>
  advanced?: {
    crossSubDomainCookies?: { enabled: boolean; domain: string }
  }
}

const loadCreatedConfig = async (): Promise<AuthConfigShape> => {
  const { createAuth } = await import("../src/server")
  createAuth({})
  return betterAuthMock.mock.calls[0]?.[0] as AuthConfigShape
}

describe("access-token IdP wiring", () => {
  beforeEach(() => {
    vi.resetModules()
    betterAuthMock.mockClear()
    drizzleAdapterMock.mockClear()
    jwtMock.mockClear()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", "https://app.example.com")
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("no jwt plugin and no cookie domain when the IdP envs are unset", async () => {
    const config = await loadCreatedConfig()

    expect(config.plugins.map((plugin) => plugin.id)).not.toContain("jwt")
    expect(config.advanced?.crossSubDomainCookies).toBeUndefined()
  })

  test("issuer + audience activate the jwt plugin with ES256 and contract claims config", async () => {
    vi.stubEnv("AUTH_JWT_ISSUER", ISSUER)
    vi.stubEnv("AUTH_JWT_AUDIENCE", AUDIENCE)
    vi.stubEnv("AUTH_JWT_TTL_SECONDS", "300")

    const config = await loadCreatedConfig()

    const ids = config.plugins.map((plugin) => plugin.id)
    expect(ids).toContain("jwt")
    // The IdP plugin is prepended so nextCookies stays last.
    expect(ids.indexOf("next-cookies")).toBe(ids.length - 1)

    const jwtOptions = config.plugins.find((plugin) => plugin.id === "jwt")
      ?.options as {
      jwks: { keyPairConfig: { alg: string } }
      jwt: {
        issuer: string
        audience: string
        expirationTime: string
      }
    }
    expect(jwtOptions.jwks.keyPairConfig.alg).toBe("ES256")
    expect(jwtOptions.jwt.issuer).toBe(ISSUER)
    expect(jwtOptions.jwt.audience).toBe(AUDIENCE)
    expect(jwtOptions.jwt.expirationTime).toBe("300s")
  })

  test("jwks model is mapped into the drizzle adapter schema", async () => {
    await loadCreatedConfig()

    const adapterOptions = drizzleAdapterMock.mock.calls[0]?.[1] as {
      schema: Record<string, unknown>
    }
    expect(adapterOptions.schema.jwks).toBeDefined()
  })

  test("AUTH_COOKIE_DOMAIN scopes the session cookie cross-subdomain", async () => {
    vi.stubEnv("AUTH_COOKIE_DOMAIN", COOKIE_DOMAIN)

    const config = await loadCreatedConfig()

    expect(config.advanced?.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: COOKIE_DOMAIN,
    })
  })

  test("issuer alone does not activate the plugin", async () => {
    vi.stubEnv("AUTH_JWT_ISSUER", ISSUER)

    const config = await loadCreatedConfig()

    expect(config.plugins.map((plugin) => plugin.id)).not.toContain("jwt")
  })
})

describe("mintWorkspaceAccessToken", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", "https://app.example.com")
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const stubAuth = (capture: {
    payload?: Record<string, unknown>
    overrideOptions?: Record<string, unknown>
  }) =>
    ({
      api: {
        signJWT: vi.fn(
          ({
            body,
          }: {
            body: {
              payload: Record<string, unknown>
              overrideOptions?: Record<string, unknown>
            }
          }) => {
            capture.payload = body.payload
            capture.overrideOptions = body.overrideOptions
            return Promise.resolve({ token: "signed-token" })
          },
        ),
      },
    }) as never

  test("mints the contract-1 claim set", async () => {
    vi.stubEnv("AUTH_JWT_ISSUER", ISSUER)
    vi.stubEnv("AUTH_JWT_AUDIENCE", AUDIENCE)
    const capture: {
      payload?: Record<string, unknown>
      overrideOptions?: Record<string, unknown>
    } = {}

    const { mintWorkspaceAccessToken } = await import("../src/jwt")
    const token = await mintWorkspaceAccessToken(stubAuth(capture), {
      user: { id: "42", email: "owner@example.com" },
      workspaceId: "7",
      role: "owner",
    })

    expect(token).toBe("signed-token")
    expect(capture.payload).toMatchObject({
      sub: "42",
      email: "owner@example.com",
      workspaceId: "7",
      role: "owner",
    })
    expect(typeof capture.payload?.iat).toBe("number")
    expect(capture.overrideOptions).toBeUndefined()
  })

  test("a TTL override restates the full jwt block so iss/aud survive", async () => {
    vi.stubEnv("AUTH_JWT_ISSUER", ISSUER)
    vi.stubEnv("AUTH_JWT_AUDIENCE", AUDIENCE)
    const capture: {
      payload?: Record<string, unknown>
      overrideOptions?: Record<string, unknown>
    } = {}

    const { mintWorkspaceAccessToken } = await import("../src/jwt")
    await mintWorkspaceAccessToken(stubAuth(capture), {
      user: { id: "42", email: "owner@example.com" },
      workspaceId: "7",
      role: "agent",
      ttlSeconds: 120,
    })

    expect(capture.overrideOptions).toEqual({
      jwt: {
        issuer: ISSUER,
        audience: AUDIENCE,
        expirationTime: "120s",
      },
    })
  })

  test("rejects a TTL above the contract cap", async () => {
    const { mintWorkspaceAccessToken } = await import("../src/jwt")
    await expect(
      mintWorkspaceAccessToken(stubAuth({}), {
        user: { id: "42", email: "owner@example.com" },
        workspaceId: "7",
        role: "owner",
        ttlSeconds: 301,
      }),
    ).rejects.toThrow("must not exceed 300")
  })
})
