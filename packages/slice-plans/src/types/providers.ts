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
  /** LS test-mode flag — the webhook route cross-checks LEMONSQUEEZY_MODE. */
  testMode?: boolean
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
