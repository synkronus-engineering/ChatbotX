/**
 * Payment-provider abstraction, ported from BaseLine
 * `src/@features/subscription-management/types/providers.ts` (Contract 5).
 * The member names and string values are kept verbatim so behavior and
 * future BaseLine diffs stay comparable; BaseLine's TS enums are expressed
 * as `as const` objects + derived types (the repo's noEnum lint rule).
 * Supabase-era naming that referenced tenants is unchanged here — tenancy is
 * applied by the services layer, which maps `tenant_id` concepts onto our
 * workspace ids.
 */

export const PaymentProviderType = {
  LEMONSQUEEZY: "lemonsqueezy",
} as const
export type PaymentProviderType =
  (typeof PaymentProviderType)[keyof typeof PaymentProviderType]

export const ProviderSubscriptionStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  PAUSED: "paused",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const
export type ProviderSubscriptionStatus =
  (typeof ProviderSubscriptionStatus)[keyof typeof ProviderSubscriptionStatus]

export const ProviderTransactionStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  DECLINED: "declined",
  VOIDED: "voided",
  ERROR: "error",
} as const
export type ProviderTransactionStatus =
  (typeof ProviderTransactionStatus)[keyof typeof ProviderTransactionStatus]

/**
 * Abstract event taxonomy (dotted). Lemon Squeezy sends snake_case names
 * (`subscription_created`); the adapter's dispatch switch matches the raw
 * names — that switch, not this map, is the source of truth for handling.
 */
export const WebhookEventType = {
  SUBSCRIPTION_CREATED: "subscription.created",
  SUBSCRIPTION_ACTIVATED: "subscription.activated",
  SUBSCRIPTION_PAUSED: "subscription.paused",
  SUBSCRIPTION_RESUMED: "subscription.resumed",
  SUBSCRIPTION_CANCELLED: "subscription.cancelled",
  SUBSCRIPTION_EXPIRED: "subscription.expired",
  SUBSCRIPTION_RENEWAL_SOON: "subscription.renewal_soon",
  SUBSCRIPTION_ITEM_ADDED: "subscription.item.added",
  SUBSCRIPTION_ITEM_UPDATED: "subscription.item.updated",
  SUBSCRIPTION_ITEM_REMOVED: "subscription.item.removed",
  PAYMENT_SUCCEEDED: "payment.succeeded",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_REFUNDED: "payment.refunded",
  INVOICE_CREATED: "invoice.created",
  INVOICE_PAID: "invoice.paid",
  INVOICE_PAYMENT_FAILED: "invoice.payment_failed",
} as const
export type WebhookEventType =
  (typeof WebhookEventType)[keyof typeof WebhookEventType]

export type ProrationMode =
  | "create_prorations"
  | "no_prorations"
  | "invoice_immediately"

export interface ProrationOpts {
  disableProrations?: boolean
  invoiceImmediately?: boolean
}

export interface PauseOpts {
  mode?: "void" | "free"
  resumesAt?: string
}

export interface ParsedWebhookEvent {
  attributes: Record<string, unknown>
  custom?: Record<string, string>
  eventCreatedAt: string
  eventId: string
  eventName: string
  providerCustomerId?: string
  providerOrderId?: string
  providerSubscriptionId?: string
  raw: Record<string, unknown>
  subscriptionId?: string
  tenantId?: string
}

export interface PaymentProviderConfig {
  apiKey: string
  baseUrl?: string
  publicKey?: string
  sandbox: boolean
  type: PaymentProviderType
  webhookSecret: string
}

export interface CreateSubscriptionData {
  customerEmail: string
  customerId: string
  customerName?: string
  interval?: "month" | "year"
  metadata?: Record<string, string>
  paymentSourceId?: string
  planPricingId: string
  trialDays?: number
}

export interface ProviderSubscription {
  cancelledAt?: Date
  currentPeriodEnd: Date
  currentPeriodStart: Date
  customerId: string
  id: string
  metadata?: Record<string, string>
  pausedAt?: Date
  planId: string
  providerStatus?: string
  status: ProviderSubscriptionStatus
  trialEnd?: Date
}

export interface WebhookEvent {
  data: Record<string, unknown>
  id: string
  provider: PaymentProviderType
  rawPayload: string
  signature: string
  subscriptionId?: string
  timestamp: Date
  transactionId?: string
  type: WebhookEventType
}

export interface WebhookProcessingResult {
  error?: string
  eventType: WebhookEventType
  message?: string
  subscriptionId?: string
  success: boolean
}
