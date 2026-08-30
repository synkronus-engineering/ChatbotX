import { db } from "@chatbotx.io/database/client"
import { eq } from "drizzle-orm"
import { PLAN_KEYS } from "../data/plans"
import {
  planModel,
  type SubscriptionStatus,
  tenantSubscriptionModel,
} from "../data/schema"

export interface PlanRecord {
  botMessagesLimit: number
  channelsLimit: number
  contactsLimit: number
  features: string[]
  key: string
  lsVariantId: string | null
  membersLimit: number
  monthlyPriceCents: number
  name: string
  trialDays: number
  workspacesLimit: number
}

export interface SubscriptionRecord {
  lsCustomerId: string | null
  lsSubscriptionId: string | null
  periodEnd: Date | null
  periodStart: Date | null
  planKey: string
  status: SubscriptionStatus
  trialEndsAt: Date | null
  workspaceId: string
}

export interface EffectivePlanState {
  /**
   * The plan whose limits apply right now. `trial` past `trialEndsAt`
   * resolves to free without any cron (the expire-trials route only fixes the
   * stored status for UI accuracy); `expired`/`canceled` fall back to free —
   * the free tier is a floor, never a block (S1-AUDIT §5).
   */
  effectivePlanKey: string
  /** True when the effective plan is granted by an unexpired trial. */
  onTrial: boolean
  plan: PlanRecord | null
  subscription: SubscriptionRecord | null
}

export async function getPlanByKey(key: string): Promise<PlanRecord | null> {
  const rows = await db.select().from(planModel).where(eq(planModel.key, key))
  return rows[0] ?? null
}

export function listPlans(): Promise<PlanRecord[]> {
  return db.select().from(planModel).orderBy(planModel.monthlyPriceCents)
}

export async function getSubscription(
  workspaceId: string,
): Promise<SubscriptionRecord | null> {
  const rows = await db
    .select()
    .from(tenantSubscriptionModel)
    .where(eq(tenantSubscriptionModel.workspaceId, workspaceId))
  const row = rows[0]
  if (!row) {
    return null
  }
  return {
    workspaceId: row.workspaceId,
    planKey: row.planKey,
    status: row.status,
    trialEndsAt: row.trialEndsAt,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    lsCustomerId: row.lsCustomerId,
    lsSubscriptionId: row.lsSubscriptionId,
  }
}

/**
 * PLAN-C's read-time trial guard. A `trial` row whose window has closed no
 * longer grants the stored plan — the caller treats it as the free floor
 * immediately, instead of waiting for the expire-trials sweep.
 */
export function assertTrialNotExpired(
  subscription: SubscriptionRecord,
  now = new Date(),
): boolean {
  if (subscription.status !== "trial") {
    return true
  }
  if (subscription.trialEndsAt === null) {
    return true
  }
  return subscription.trialEndsAt.getTime() > now.getTime()
}

export async function resolveFreePlanState(): Promise<EffectivePlanState> {
  const free = await getPlanByKey(PLAN_KEYS.free)
  return {
    effectivePlanKey: PLAN_KEYS.free,
    onTrial: false,
    plan: free,
    subscription: null,
  }
}

export async function resolveEffectivePlan(
  workspaceId: string,
  now = new Date(),
): Promise<EffectivePlanState> {
  const subscription = await getSubscription(workspaceId)
  if (!subscription) {
    // Workspaces that predate billing (legacy console provisioning) get the
    // free plan — fail-safe, never unlimited.
    return resolveFreePlanState()
  }

  const grantsStoredPlan =
    subscription.status === "active" ||
    subscription.status === "past_due" ||
    (subscription.status === "trial" &&
      assertTrialNotExpired(subscription, now))

  if (!grantsStoredPlan) {
    const free = await getPlanByKey(PLAN_KEYS.free)
    return {
      effectivePlanKey: PLAN_KEYS.free,
      onTrial: false,
      plan: free,
      subscription,
    }
  }

  const plan = await getPlanByKey(subscription.planKey)
  return {
    effectivePlanKey: subscription.planKey,
    onTrial: subscription.status === "trial",
    plan,
    subscription,
  }
}
