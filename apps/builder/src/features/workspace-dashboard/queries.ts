import { and, db, eq, gte } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  contactModel,
  conversationModel,
  flowModel,
  inboxModel,
  messageModel,
} from "@chatbotx.io/database/schema"
import { resolveEffectivePlan } from "@chatbotx.io/slice-plans"

export type WorkspaceOverview = {
  chats7d: number
  messages7d: number
  contacts: number
  connectedChannels: number
  flows: number
  /**
   * Konversify plan label (subscription-aware: trial appends the days left),
   * or null when the billing tables are unreadable.
   */
  plan: string | null
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Read the Konversify plan badge from the subscription, not the static
 * `ent.workspace_meta.plan` stamp: active/past_due/unexpired-trial grant the
 * stored plan (trial appends the days left per the dashboard's single string
 * slot), anything else falls back to the free floor. The `ent` schema only
 * exists on forked deployments, so a missing table still degrades to "no
 * badge" instead of failing the whole dashboard.
 */
async function readWorkspacePlan(workspaceId: string): Promise<string | null> {
  try {
    const state = await resolveEffectivePlan(workspaceId)
    const planName = state.plan?.name ?? state.effectivePlanKey
    if (!state.onTrial) {
      return planName
    }
    const trialEndsAt = state.subscription?.trialEndsAt
    if (!trialEndsAt) {
      return planName
    }
    const daysLeft = Math.max(
      0,
      Math.ceil((trialEndsAt.getTime() - Date.now()) / DAY_MS),
    )
    return `${planName} (${daysLeft}d)`
  } catch {
    return null
  }
}

export async function getWorkspaceOverview(
  workspaceId: string,
): Promise<WorkspaceOverview> {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS)

  const [chats7d, messages7d, contacts, connectedChannels, flows, plan] =
    await Promise.all([
      db.$count(
        conversationModel,
        and(
          eq(conversationModel.workspaceId, workspaceId),
          gte(conversationModel.createdAt, sevenDaysAgo),
        ),
      ),
      // 7-day window on Message stays inside the hypertable's hot (uncompressed)
      // chunks; the Message_workspace_created_idx index covers the predicate.
      db.$count(
        messageModel,
        and(
          eq(messageModel.workspaceId, workspaceId),
          gte(messageModel.createdAt, sevenDaysAgo),
        ),
      ),
      db.$count(contactModel, eq(contactModel.workspaceId, workspaceId)),
      db.$count(
        inboxModel,
        and(
          eq(inboxModel.workspaceId, workspaceId),
          eq(inboxModel.status, inboxStatuses.enum.connected),
        ),
      ),
      db.$count(flowModel, eq(flowModel.workspaceId, workspaceId)),
      readWorkspacePlan(workspaceId),
    ])

  return { chats7d, messages7d, contacts, connectedChannels, flows, plan }
}
