import { db } from "@chatbotx.io/database/client"
import { and, eq, lte } from "drizzle-orm"
import { PLAN_KEYS } from "../data/plans"
import {
  lsEventModel,
  planModel,
  tenantSubscriptionModel,
} from "../data/schema"
import type { ParsedWebhookEvent } from "../types/providers"
import { mapLsStatus } from "./lemonsqueezy"
import { getPlanByKey, type SubscriptionRecord } from "./plan-resolution"

const HANDLED_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_plan_changed",
  "subscription_cancelled",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_resumed",
  "subscription_expired",
  "subscription_payment_success",
  "subscription_payment_recovered",
  "subscription_payment_failed",
  "subscription_payment_refunded",
])

/** Best-effort derived plan from the checkout's variant id (fallback when custom_data is absent). */
async function findPlanByVariant(variantId: string) {
  const rows = await db
    .select()
    .from(planModel)
    .where(eq(planModel.lsVariantId, variantId))
  return rows[0] ?? null
}

/**
 * Records the event for dedup. Returns false when the event id was already
 * processed — the webhook route then answers 200 without re-applying (BaseLine's
 * `findByEventId` + UNIQUE backstop, expressed as our `ent.ls_event` PK).
 */
export async function recordEventOnce(event: {
  eventId: string
  eventName: string
  workspaceId: string | null
}): Promise<boolean> {
  const inserted = await db
    .insert(lsEventModel)
    .values({
      eventId: event.eventId,
      eventName: event.eventName,
      workspaceId: event.workspaceId,
    })
    .onConflictDoNothing({ target: lsEventModel.eventId })
    .returning({ eventId: lsEventModel.eventId })
  return inserted.length > 0
}

function toDate(value: unknown): Date | null {
  return typeof value === "string" && value ? new Date(value) : null
}

/**
 * Applies a lifecycle event to `ent.tenant_subscription`. Status comes from
 * the payload's LS status; the plan key resolves from the variant (falling
 * back to the existing row), and the workspace from `custom_data.workspace_id`
 * (falling back to the row already carrying this LS subscription id).
 */
export async function applyWebhookEvent(
  event: ParsedWebhookEvent,
): Promise<{ applied: boolean; workspaceId: string | null }> {
  if (!HANDLED_EVENTS.has(event.eventName)) {
    return { applied: false, workspaceId: null }
  }

  const customWorkspaceId = event.custom?.workspace_id
  const existingBySubscription = event.providerSubscriptionId
    ? (
        await db
          .select()
          .from(tenantSubscriptionModel)
          .where(
            eq(
              tenantSubscriptionModel.lsSubscriptionId,
              event.providerSubscriptionId,
            ),
          )
      )[0]
    : undefined

  const workspaceId = customWorkspaceId ?? existingBySubscription?.workspaceId
  if (!workspaceId) {
    return { applied: false, workspaceId: null }
  }

  const attributes = event.attributes
  const lsStatus =
    typeof attributes.status === "string" ? attributes.status : null
  const variantId =
    typeof attributes.variant === "number"
      ? String(attributes.variant)
      : typeof attributes.variant === "string"
        ? attributes.variant
        : null

  let planKey: string | null = null
  if (variantId) {
    const byVariant = await findPlanByVariant(variantId)
    planKey = byVariant?.key ?? null
  }
  planKey = planKey ?? existingBySubscription?.planKey ?? PLAN_KEYS.pro

  const status = lsStatus ? mapLsStatus(lsStatus) : "active"
  const periodStart = toDate(attributes.current_billing_period_start)
  const periodEnd = toDate(attributes.current_billing_period_end)
  const trialEndsAt = toDate(attributes.trial_ends_at)
  const cancelledAt = toDate(attributes.cancelled_at)
  const customerId = event.providerCustomerId

  // BaseLine's cancel semantics: `subscription_cancelled` means cancel-at-
  // period-end — entitlement continues ("active") until LS sends the terminal
  // `subscription_expired`, which is the only path that stores "expired".
  // The "canceled" enum value stays reserved for admin-forced cancels.
  const effectiveStatus = cancelledAt
    ? status === "expired"
      ? "expired"
      : "active"
    : status

  await db
    .insert(tenantSubscriptionModel)
    .values({
      workspaceId,
      planKey,
      status: effectiveStatus,
      trialEndsAt,
      periodStart,
      periodEnd,
      lsCustomerId: customerId ?? null,
      lsSubscriptionId: event.providerSubscriptionId ?? null,
    })
    .onConflictDoUpdate({
      target: tenantSubscriptionModel.workspaceId,
      set: {
        planKey,
        status: effectiveStatus,
        trialEndsAt,
        periodStart,
        periodEnd,
        ...(customerId ? { lsCustomerId: customerId } : {}),
        ...(event.providerSubscriptionId
          ? { lsSubscriptionId: event.providerSubscriptionId }
          : {}),
      },
    })

  return { applied: true, workspaceId }
}

/**
 * Provision-time entitlement row (PLAN-C task 4): the plan with
 * `trial_days > 0` (Pro, 14 days) starts as a trial over the free floor;
 * a trial-less default plan would start `active` (S1-AUDIT §5).
 */
export async function createSubscriptionOnProvision(
  workspaceId: string,
): Promise<SubscriptionRecord | null> {
  const pro = await getPlanByKey(PLAN_KEYS.pro)
  if (!pro) {
    return null
  }

  const now = new Date()
  const trialEndsAt =
    pro.trialDays > 0
      ? new Date(now.getTime() + pro.trialDays * 24 * 60 * 60 * 1000)
      : null

  await db
    .insert(tenantSubscriptionModel)
    .values({
      workspaceId,
      planKey: pro.key,
      status: trialEndsAt ? "trial" : "active",
      trialEndsAt,
      periodStart: now,
      periodEnd: trialEndsAt,
    })
    .onConflictDoNothing({ target: tenantSubscriptionModel.workspaceId })

  const row = (
    await db
      .select()
      .from(tenantSubscriptionModel)
      .where(eq(tenantSubscriptionModel.workspaceId, workspaceId))
  )[0]
  return row ?? null
}

/**
 * Sweep for the expire-trials route: flips ended trials to `expired`. Purely
 * a stored-status correction for UI accuracy — read-time resolution already
 * downgraded the effective plan (assertTrialNotExpired).
 */
export async function expireEndedTrials(): Promise<number> {
  const updated = await db
    .update(tenantSubscriptionModel)
    .set({ status: "expired" })
    .where(
      and(
        eq(tenantSubscriptionModel.status, "trial"),
        lte(tenantSubscriptionModel.trialEndsAt, new Date()),
      ),
    )
    .returning({ workspaceId: tenantSubscriptionModel.workspaceId })
  return updated.length
}
