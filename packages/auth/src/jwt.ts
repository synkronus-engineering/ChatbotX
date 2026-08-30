import { jwt } from "better-auth/plugins"
import { env } from "./keys"
import type { Auth } from "./server"

/** Default access-token lifetime; the SaaS contract caps tokens at 300s. */
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 300

/**
 * The `jwt` plugin instance, or `null` when the Konversify IdP envs are absent.
 * Key material needs no env: better-auth 1.6.x generates the ES256 keypair on
 * first use and stores it (private key encrypted with `BETTER_AUTH_SECRET`) in
 * the `Jwk` table, so activation is gated purely on issuer + audience being
 * configured. JWKS is served by the plugin at `<auth base path>/jwks`
 * (`/api/auth/jwks` on the builder).
 */
export function resolveJwtPlugin() {
  const issuer = env.AUTH_JWT_ISSUER
  const audience = env.AUTH_JWT_AUDIENCE
  if (!(issuer && audience)) {
    return null
  }

  const ttlSeconds =
    env.AUTH_JWT_TTL_SECONDS ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS

  return jwt({
    jwks: {
      // The contract pins ES256; the plugin would otherwise default to
      // EdDSA/Ed25519.
      keyPairConfig: { alg: "ES256" },
    },
    jwt: {
      issuer,
      audience,
      // A plain number is treated as an absolute `exp` timestamp by the plugin,
      // so the TTL must travel as a timespan string.
      expirationTime: `${ttlSeconds}s`,
    },
    // Shell/tool tokens are minted server-side (mintWorkspaceAccessToken); the
    // per-`/get-session` response header would sign a JWT nobody consumes.
    disableSettingJwtHeader: true,
  })
}

/** Whether access-token minting is configured for this deployment. */
export function isAccessTokenIdpEnabled(): boolean {
  return resolveJwtPlugin() !== null
}

/** Claims minted into every workspace access token (contract 1). */
export type WorkspaceAccessTokenInput = {
  user: { id: string; email: string }
  workspaceId: string
  role: string
  /**
   * Per-call TTL override in seconds (≤ contract cap). When omitted the
   * instance-wide `AUTH_JWT_TTL_SECONDS` applies.
   */
  ttlSeconds?: number
}

/**
 * The subset of a better-auth instance the mint helper needs. Declared
 * structurally because the plugin (and therefore `auth.api.signJWT`) only
 * exists on instances built with the IdP envs set.
 */
type JwtMintingAuth = {
  api: {
    signJWT: (args: {
      body: {
        payload: Record<string, unknown>
        overrideOptions?: Record<string, unknown>
      }
    }) => Promise<{ token: string }>
  }
}

/**
 * Mint a signed ES256 access token for a user's session in one workspace.
 * Server-side only — called from RSC embed pages; the issuer/audience/exp come
 * from the plugin config, so only the identity claims are supplied here.
 * `sub` = ChatbotX user id, plus `email`, `workspaceId` and the workspace role.
 */
export async function mintWorkspaceAccessToken(
  auth: Auth,
  input: WorkspaceAccessTokenInput,
): Promise<string> {
  const ttlSeconds = input.ttlSeconds
  if (
    ttlSeconds !== undefined &&
    ttlSeconds > DEFAULT_ACCESS_TOKEN_TTL_SECONDS
  ) {
    throw new Error(
      `Access-token TTL must not exceed ${DEFAULT_ACCESS_TOKEN_TTL_SECONDS}s`,
    )
  }

  // `overrideOptions` shallow-merges over the plugin options, so a TTL override
  // must restate the full `jwt` block or issuer/audience would be lost.
  const overrideOptions =
    ttlSeconds !== undefined &&
    ttlSeconds !==
      (env.AUTH_JWT_TTL_SECONDS ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS)
      ? {
          jwt: {
            issuer: env.AUTH_JWT_ISSUER,
            audience: env.AUTH_JWT_AUDIENCE,
            expirationTime: `${ttlSeconds}s`,
          },
        }
      : undefined

  const { token } = await (auth as unknown as JwtMintingAuth).api.signJWT({
    body: {
      payload: {
        iat: Math.floor(Date.now() / 1000),
        sub: input.user.id,
        email: input.user.email,
        workspaceId: input.workspaceId,
        role: input.role,
      },
      ...(overrideOptions && { overrideOptions }),
    },
  })
  return token
}
