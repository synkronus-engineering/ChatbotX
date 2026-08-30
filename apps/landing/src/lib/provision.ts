import { runtimeBuilderUrl } from "./config"

const PENDING_BUSINESS_KEY = "konversify.pendingBusinessName"

export function builderUrl(): string {
  return runtimeBuilderUrl()
}

export function buildWorkspaceUrl(workspaceId: string): string {
  return `${builderUrl()}/space/${workspaceId}/dashboard`
}

export function storePendingBusinessName(businessName: string): void {
  window.sessionStorage.setItem(PENDING_BUSINESS_KEY, businessName)
}

/** One-shot: the pending business name is consumed on first read after sign-in. */
export function takePendingBusinessName(): string | null {
  const value = window.sessionStorage.getItem(PENDING_BUSINESS_KEY)
  if (value !== null) {
    window.sessionStorage.removeItem(PENDING_BUSINESS_KEY)
  }
  return value
}

export interface ProvisionResult {
  created?: boolean
  workspaceId?: string
}

/**
 * Provisions the signed-up user's workspace through the builder API. Goes via
 * the landing's own /api/provision so the browser only ever talks same-origin;
 * the proxy forwards the session cookie (shared across *.konversify.app once
 * Track A's AUTH_COOKIE_DOMAIN deploys — works on localhost too because both
 * apps resolve the cookie against the builder origin server-side).
 */
export async function provisionWorkspace(
  businessName: string,
): Promise<ProvisionResult | null> {
  try {
    const response = await fetch("/api/provision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessName }),
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as ProvisionResult
  } catch {
    return null
  }
}
