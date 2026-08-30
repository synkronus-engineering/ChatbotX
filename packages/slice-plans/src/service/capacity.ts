import { db } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { and, count, countDistinct, eq, ne } from "drizzle-orm"
import {
  type EffectivePlanState,
  resolveEffectivePlan,
  resolveFreePlanState,
} from "./plan-resolution"

export type CapacityMetric = "channels" | "members" | "workspaces"

export class PlanCapacityError extends Error {
  readonly metric: CapacityMetric

  constructor(metric: CapacityMetric) {
    super(`Plan limit reached: ${metric}`)
    this.name = "PlanCapacityError"
    this.metric = metric
  }
}

/**
 * Live count of connected channels for a workspace. Disconnected inboxes keep
 * their rows but do not consume a channel slot — mirroring the vendor quota
 * release on disconnect (`inboxService.disconnect`).
 */
async function countConnectedChannels(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(inboxModel)
    .where(
      and(
        eq(inboxModel.workspaceId, workspaceId),
        ne(inboxModel.status, inboxStatuses.enum.disconnected),
      ),
    )
  return row?.value ?? 0
}

/** Distinct humans on a workspace (the vendor's teamMembers metric semantics). */
async function countWorkspaceMembers(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ value: countDistinct(workspaceMemberModel.userId) })
    .from(workspaceMemberModel)
    .where(eq(workspaceMemberModel.workspaceId, workspaceId))
  return row?.value ?? 0
}

async function countOwnedWorkspaces(ownerId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(workspaceModel)
    .where(eq(workspaceModel.ownerId, ownerId))
  return row?.value ?? 0
}

/**
 * Workspace-count gate (audit V4): the owner's plan ceiling vs how many
 * workspaces they already own. Called from `workspaceService.insertWorkspace`
 * next to the vendor `tryConsume` gate, and re-checked by the provision route
 * for a friendly error before any rows are written.
 */
export async function assertWorkspaceCapacity(ownerId: string): Promise<void> {
  const state = await resolveOwnerPlanState(ownerId)
  const limit = state.plan?.workspacesLimit
  if (limit === null || limit === undefined) {
    return
  }
  const owned = await countOwnedWorkspaces(ownerId)
  if (owned >= limit) {
    throw new PlanCapacityError("workspaces")
  }
}

/** Channel gate (audit V5) — mirrors `inboxService.connect`'s vendor quota check. */
export async function assertChannelCapacity(
  workspaceId: string,
): Promise<void> {
  const state = await resolveEffectivePlan(workspaceId)
  const limit = state.plan?.channelsLimit
  if (limit === null || limit === undefined) {
    return
  }
  const used = await countConnectedChannels(workspaceId)
  if (used >= limit) {
    throw new PlanCapacityError("channels")
  }
}

/** Team-member gate (audit V6) — mirrors the invite/accept vendor checks. */
export async function assertMemberCapacity(workspaceId: string): Promise<void> {
  const state = await resolveEffectivePlan(workspaceId)
  const limit = state.plan?.membersLimit
  if (limit === null || limit === undefined) {
    return
  }
  const used = await countWorkspaceMembers(workspaceId)
  if (used >= limit) {
    throw new PlanCapacityError("members")
  }
}

/**
 * The workspace metric is owner-scoped (one customer may own several
 * workspaces under Pro), so the plan ceiling comes from the best plan among
 * the owner's workspace subscriptions — the funnel keeps owners at one
 * workspace on free, and any active/trial Pro subscription raises the cap.
 */
async function resolveOwnerPlanState(
  ownerId: string,
): Promise<EffectivePlanState> {
  const owned = await db
    .select({ id: workspaceModel.id })
    .from(workspaceModel)
    .where(eq(workspaceModel.ownerId, ownerId))

  let best: EffectivePlanState | null = null
  for (const workspace of owned) {
    const state = await resolveEffectivePlan(workspace.id)
    const ceiling = state.plan?.workspacesLimit ?? 0
    const bestCeiling = best?.plan?.workspacesLimit ?? -1
    if (ceiling > bestCeiling) {
      best = state
    }
  }
  if (best) {
    return best
  }
  // No workspace yet: the free plan's ceiling applies to the first create.
  return resolveFreePlanState()
}
