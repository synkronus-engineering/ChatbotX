import { db, sql } from "@chatbotx.io/database/client"

/**
 * E1 workspace provisioning — creates Workspaces through the MIT-zone
 * workspaceService seam (community: 1 workspace per owner = 1 tenant).
 * Records our ent.workspace_meta overlay for plan/locale/suspension.
 */
export type ProvisionInput = {
  ownerEmail: string
  name: string
  plan?: string
  locale?: string
}

export type ProvisionResult = {
  workspaceId: string
  created: boolean
}

export const provisionWorkspace = async (
  input: ProvisionInput,
): Promise<ProvisionResult> => {
  const { ownerEmail, name, plan = "free", locale = "es" } = input

  const owner = await db.query.userModel.findFirst({
    where: { email: ownerEmail },
    columns: { id: true },
  })

  if (!owner) {
    throw new Error(
      `Owner ${ownerEmail} not found — invite them first (console panel sends invite)`,
    )
  }

  // Community limit: 1 workspace per owner (= 1 tenant per customer)
  const owned = await db.query.workspaceModel.findFirst({
    where: { ownerId: owner.id },
    columns: { id: true },
  })

  if (owned) {
    return { workspaceId: owned.id, created: false }
  }

  // Create workspace via the app-level service (sets owner membership,
  // resolves tenantId, consumes quota)
  const { workspaceService } = await import("@chatbotx.io/business")
  const workspace = await workspaceService.create({
    data: { name, ownerId: owner.id },
    createdBy: owner.id,
  })

  // Record our overlay in ent.workspace_meta
  await db.execute(
    sql`INSERT INTO ent.workspace_meta (workspace_id, plan, locale)
        VALUES (${workspace.id}, ${plan}, ${locale})
        ON CONFLICT DO NOTHING`,
  )

  return { workspaceId: workspace.id, created: true }
}

export const suspendWorkspace = async (workspaceId: string): Promise<void> => {
  await db.execute(
    sql`UPDATE ent.workspace_meta SET suspended_at = now() WHERE workspace_id = ${workspaceId}`,
  )
}

export const reactivateWorkspace = async (
  workspaceId: string,
): Promise<void> => {
  await db.execute(
    sql`UPDATE ent.workspace_meta SET suspended_at = NULL WHERE workspace_id = ${workspaceId}`,
  )
}

export const listWorkspaces = async () => {
  const result = await db.execute(
    sql`SELECT wm.workspace_id, wm.plan, wm.locale, wm.suspended_at,
               w.name, u.email as owner_email
        FROM ent.workspace_meta wm
        JOIN "Workspace" w ON w.id = wm.workspace_id
        JOIN "User" u ON u.id = w.owner_id
        ORDER BY w.name`,
  )
  return result.rows
}
