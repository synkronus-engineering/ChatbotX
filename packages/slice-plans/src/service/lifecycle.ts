import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import logger from "@chatbotx.io/logger"
import { and, eq, isNull, lte } from "drizzle-orm"
import { PLAN_KEYS } from "../data/plans"
import {
  lsEventModel,
  planModel,
  type SubscriptionStatus,
  tenantSubscriptionModel,
} from "../data/schema"
import type { ParsedWebhookEvent } from "../types/providers"
import { mapLsStatus, parseWebhookEvent } from "./lemonsqueezy"
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

const NUMERIC_ID = /^\d+$/

/** Coerces a custom_data workspace id to a numeric id string, or null when absent/malformed. */
function numericWorkspaceId(value: string | undefined): string | null {
  return typeof value === "string" && NUMERIC_ID.test(value) ? value : null
}

async function findPlanByVariant(tx: DatabaseClient, variantId: string) {
  const rows = await tx
    .select()
    .from(planModel)
    .where(eq(planModel.lsVariantId, variantId))
  return rows[0] ?? null
}

function toDate(value: unknown): Date | null {
  return typeof value === "string" && value ? new Date(value) : null
}

function variantIdFrom(attributes: Record<string, unknown>): string | null {
  if (typeof attributes.variant === "number") {
    return String(attributes.variant)
  }
  if (typeof attributes.variant === "string") {
    return attributes.variant
  }
  return null
}

// BaseLine's cancel semantics: `subscription_cancelled` means cancel-at-
// period-end — entitlement continues ("active") until LS sends the terminal
// `subscription_expired`, which is the only path that stores "expired".
// The "canceled" enum value stays reserved for admin-forced cancels.
function effectiveStatusFrom(
  status: SubscriptionStatus,
  cancelledAt: Date | null,
): SubscriptionStatus {
  if (cancelledAt) {
    return status === "expired" ? "expired" : "active"
  }
  return status
}

/**
 * The subscription upsert for one resolved workspace. Runs inside the caller's
 * transaction so a failure rolls the dedup row back with it.
 */
async function applySubscriptionUpsert(
  tx: DatabaseClient,
  event: ParsedWebhookEvent,
  workspaceId: string,
  existingPlanKey: string | null,
): Promise<void> {
  const attributes = event.attributes
  const lsStatus =
    typeof attributes.status === "string" ? attributes.status : null
  const variantId = variantIdFrom(attributes)

  let planKey: string | null = null
  if (variantId) {
    const byVariant = await findPlanByVariant(tx, variantId)
    planKey = byVariant?.key ?? null
    if (!byVariant) {
      // An unknown variant must never silently grant pro: keep the current
      // plan (free floor when there is none) until the variant is mapped.
      logger.warn(
        { variantId, eventId: event.eventId },
        "webhook: variant not mapped to any plan",
      )
    }
  }
  planKey = planKey ?? existingPlanKey ?? PLAN_KEYS.free

  const status = lsStatus ? mapLsStatus(lsStatus) : "active"
  const periodStart = toDate(attributes.current_billing_period_start)
  const periodEnd = toDate(attributes.current_billing_period_end)
  const trialEndsAt = toDate(attributes.trial_ends_at)
  const cancelledAt = toDate(attributes.cancelled_at)
  const customerId = event.providerCustomerId

  const effectiveStatus = effectiveStatusFrom(status, cancelledAt)

  await tx
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
        updatedAt: new Date(),
        ...(customerId ? { lsCustomerId: customerId } : {}),
        ...(event.providerSubscriptionId
          ? { lsSubscriptionId: event.providerSubscriptionId }
          : {}),
      },
    })
}

export type WebhookProcessStatus =
  | "applied"
  | "duplicate"
  | "skipped-unhandled"
  | "unbound"

export interface WebhookProcessResult {
  status: WebhookProcessStatus
  workspaceId: string | null
}

/**
 * Records and applies one webhook event atomically (review P0 #2).
 *
 * The dedup insert and the subscription apply commit together: an apply
 * failure rolls the dedup row back too, so the route can answer 5xx and
 * Lemon Squeezy's retry of the SAME event re-inserts and re-applies instead
 * of hitting a "duplicate" wall. `appliedAt` is set in the same transaction;
 * the two states where it stays NULL are (a) events for a workspace that
 * cannot be resolved yet — dead-lettered for the replay sweep to retry once
 * the subscription binds — and (b) nothing else, since failures roll back.
 *
 * A resend of an event whose row exists with `appliedAt` NULL (possible only
 * if a committed unbound row's workspace later binds, or manual intervention)
 * re-runs the apply inside this transaction.
 */
export function processWebhookEvent(
  event: ParsedWebhookEvent,
  rawBody: string,
): Promise<WebhookProcessResult> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(lsEventModel)
      .values({
        eventId: event.eventId,
        eventName: event.eventName,
        workspaceId: numericWorkspaceId(event.custom?.workspace_id),
        rawPayload: rawBody,
      })
      .onConflictDoNothing({ target: lsEventModel.eventId })
      .returning({ eventId: lsEventModel.eventId })

    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ appliedAt: lsEventModel.appliedAt })
        .from(lsEventModel)
        .where(eq(lsEventModel.eventId, event.eventId))
      if (existing?.appliedAt) {
        return { status: "duplicate", workspaceId: null }
      }
    }

    if (!HANDLED_EVENTS.has(event.eventName)) {
      await markApplied(tx, event.eventId)
      return { status: "skipped-unhandled", workspaceId: null }
    }

    const customWorkspaceId = numericWorkspaceId(event.custom?.workspace_id)
    const existingBySubscription = event.providerSubscriptionId
      ? (
          await tx
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

    const workspaceId =
      customWorkspaceId ?? existingBySubscription?.workspaceId ?? null
    if (!workspaceId) {
      logger.warn(
        { eventId: event.eventId, eventName: event.eventName },
        "webhook: no workspace binding — dead-lettered for the replay sweep",
      )
      return { status: "unbound", workspaceId: null }
    }

    await applySubscriptionUpsert(
      tx,
      event,
      workspaceId,
      existingBySubscription?.planKey ?? null,
    )
    await markApplied(tx, event.eventId)
    return { status: "applied", workspaceId }
  })
}

async function markApplied(tx: DatabaseClient, eventId: string): Promise<void> {
  await tx
    .update(lsEventModel)
    .set({ appliedAt: new Date() })
    .where(eq(lsEventModel.eventId, eventId))
}

/**
 * Replay sweep for unapplied events (runs from the maintenance route):
 * re-parses the persisted raw payload and re-runs the atomic processing.
 * A row that still cannot bind stays NULL and is retried on the next sweep;
 * parse failures are logged and skipped, never fatal to the sweep.
 */
export async function replayUnappliedEvents(limit = 100): Promise<number> {
  const rows = await db
    .select({
      eventId: lsEventModel.eventId,
      rawPayload: lsEventModel.rawPayload,
    })
    .from(lsEventModel)
    .where(isNull(lsEventModel.appliedAt))
    .limit(limit)

  let replayed = 0
  for (const row of rows) {
    try {
      const event = parseWebhookEvent(row.rawPayload)
      const result = await processWebhookEvent(event, row.rawPayload)
      if (result.status === "applied" || result.status === "duplicate") {
        replayed += 1
      }
    } catch (err) {
      logger.warn(
        { err, eventId: row.eventId },
        "replay sweep: event re-parse or re-apply failed",
      )
    }
  }
  return replayed
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
 * Sweep for the maintenance route: flips ended trials to `expired`. Purely
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
