import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { type SubscriptionStatus, subscriptionStatuses } from "../data/schema"
import { keys } from "../keys"
import type { ParsedWebhookEvent } from "../types/providers"

const LS_API_BASE = "https://api.lemonsqueezy.com/v1"

export class WebhookSignatureError extends Error {
  constructor() {
    super("Invalid Lemon Squeezy webhook signature")
    this.name = "WebhookSignatureError"
  }
}

export class MalformedWebhookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MalformedWebhookError"
  }
}

/**
 * Verifies the `x-signature` header against the exact raw body string, the
 * way BaseLine's `LemonSqueezyProvider.verifyWebhookSignature` does: HMAC
 * hex digest with the shared secret, timing-safe comparison. Callers MUST
 * pass `req.text()` verbatim — re-serialized JSON breaks the digest.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) {
    return false
  }
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(digest, "utf8")
  const b = Buffer.from(signature, "utf8")
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(a, b)
}

/**
 * LS status string → our subscription status. Mirrors BaseLine's webhook-path
 * mapping collapsed onto PLAN-C's five-value enum (S1-AUDIT §5): `paused` and
 * `unpaid` fall to `past_due` (entitlement continues under dunning; LS later
 * reports `cancelled`/`expired` which carry the terminal statuses).
 */
export function mapLsStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "on_trial":
      return "trial"
    case "active":
      return "active"
    case "past_due":
    case "paused":
    case "unpaid":
      return "past_due"
    case "cancelled":
    case "canceled":
      return "canceled"
    case "expired":
      return "expired"
    default:
      return "active"
  }
}

interface LsWebhookPayload {
  data?: {
    id?: string
    type?: string
    attributes?: Record<string, unknown>
  }
  meta?: {
    event_name?: string
    webhook_id?: string
    custom_data?: Record<string, string>
    test_mode?: boolean
  }
}

function attributeString(
  attributes: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = attributes[key]
  return typeof value === "string" ? value : undefined
}

/**
 * BaseLine's parse shape: `meta.event_name` + `data` are mandatory; the
 * dedup id comes from `meta.webhook_id` (fallback: hash of the raw body);
 * the workspace routes via `custom_data.workspace_id` (BaseLine's
 * `custom_data.tenant_id` renamed for our tenancy).
 */
export function parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
  let payload: LsWebhookPayload
  try {
    payload = JSON.parse(rawBody) as LsWebhookPayload
  } catch {
    throw new MalformedWebhookError("Body is not valid JSON")
  }

  const eventName = payload.meta?.event_name
  if (!eventName) {
    throw new MalformedWebhookError("Missing meta.event_name")
  }
  const data = payload.data
  if (!data?.id) {
    throw new MalformedWebhookError("Missing data.id")
  }
  const attributes = data.attributes ?? {}

  const eventId =
    payload.meta?.webhook_id ??
    `ls-${createHash("sha1").update(rawBody).digest("hex").slice(0, 24)}`

  const providerSubscriptionId =
    data.type === "subscriptions"
      ? data.id
      : attributeString(attributes, "subscription_id")

  const createdAt =
    attributeString(attributes, "created_at") ?? new Date().toISOString()

  return {
    eventId,
    eventName,
    eventCreatedAt: createdAt,
    providerSubscriptionId,
    providerCustomerId: attributeString(attributes, "customer_id"),
    providerOrderId: attributeString(attributes, "order_id"),
    tenantId: undefined,
    custom: payload.meta?.custom_data,
    attributes,
    raw: payload as Record<string, unknown>,
  }
}

export interface CheckoutParams {
  /** Cents — overrides the variant's price so the DB stays the price source. */
  monthlyPriceCents: number
  planName: string
  redirectUrl: string
  variantId: string
  workspaceId: string
}

export interface CheckoutSession {
  checkoutUrl: string
  expiresAt: string | null
}

/**
 * Creates an LS checkout session (BaseLine `createCheckoutSession`, plus the
 * PLAN-C-mandated `custom_price` and `product_options.name` from ent.plan).
 * `checkout_data.custom` is a flat string map — workspace_id routes webhook
 * events back to this workspace.
 */
export async function createLsCheckout(
  params: CheckoutParams,
): Promise<CheckoutSession> {
  const env = keys()
  if (!(env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID)) {
    throw new Error("Lemon Squeezy is not configured")
  }

  const response = await fetch(`${LS_API_BASE}/checkouts`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            custom: { workspace_id: params.workspaceId },
          },
          custom_price: params.monthlyPriceCents,
          product_options: {
            name: params.planName,
            redirect_url: params.redirectUrl,
          },
          test_mode: env.LEMONSQUEEZY_MODE === "test",
        },
        relationships: {
          store: {
            data: { type: "stores", id: env.LEMONSQUEEZY_STORE_ID },
          },
          variant: {
            data: { type: "variants", id: params.variantId },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `Lemon Squeezy checkout failed (${response.status}): ${detail.slice(0, 400)}`,
    )
  }

  const body = (await response.json()) as {
    data?: { attributes?: { url?: string; expires_at?: string | null } }
  }
  const url = body.data?.attributes?.url
  if (!url) {
    throw new Error("Lemon Squeezy checkout response missing url")
  }
  return {
    checkoutUrl: url,
    expiresAt: body.data?.attributes?.expires_at ?? null,
  }
}

export function isSubscriptionStatus(
  value: string,
): value is SubscriptionStatus {
  return (subscriptionStatuses as readonly string[]).includes(value)
}
