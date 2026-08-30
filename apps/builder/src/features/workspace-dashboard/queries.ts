import { and, db, eq, gte } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  contactModel,
  conversationModel,
  flowModel,
  inboxModel,
  messageModel,
} from "@chatbotx.io/database/schema"
import { workspaceMetaModel } from "@chatbotx.io/slice-tenancy"

export type WorkspaceOverview = {
  chats7d: number
  messages7d: number
  contacts: number
  connectedChannels: number
  flows: number
  /** Konversify plan from `ent.workspace_meta`, or null when unreadable. */
  plan: string | null
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Read the Konversify plan badge. The `ent` schema only exists on forked
 * deployments (upstream self-hosted databases never ran the slice-tenancy
 * migrations), so a missing table degrades to "no badge" instead of failing the
 * whole dashboard.
 */
async function readWorkspacePlan(workspaceId: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ plan: workspaceMetaModel.plan })
      .from(workspaceMetaModel)
      .where(eq(workspaceMetaModel.workspaceId, workspaceId))
      .limit(1)
    return row?.plan ?? null
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
