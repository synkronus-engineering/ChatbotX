import { db } from "@chatbotx.io/database/client"
import { workspaceMetaModel } from "../data/schema"

/**
 * E1 workspace provisioning — creates Workspaces through the MIT-zone
 * workspaceService seam (community: 1 workspace per owner, which maps
 * exactly to our 1-workspace-per-tenant model). Records our ent.workspace_meta
 * overlay for plan/locale/suspension state.
 *
 * The provisioning actor is the platform admin (PLATFORM_ADMIN_EMAIL);
 * the workspace owner is the tenant's designated user.
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

  // TODO(Task 4 impl): wire to workspaceService.create via the MIT seam.
  // The service-level community limit (1 workspace/owner) enforces our
  // 1-workspace-per-tenant model — no additional quota check needed.
  //
  // Flow:
  // 1. Find or invite the owner user by email (auth-service seam)
  // 2. workspaceService.create({ data: { name, ownerId }, createdBy: ADMIN })
  // 3. Insert ent.workspace_meta { workspaceId, plan, locale }
  // 4. Emit event: workspace.provisioned
  //
  // Implementation requires the auth-user lookup seam, which is Task 4's
  // next increment. The migration (Task 2) and isolation suite (Task 3)
  // are the gates that unblock this body.
  await Promise.resolve()
  throw new Error(
    `provisionWorkspace(${ownerEmail}, ${name}, ${plan}, ${locale}): Task 4 — auth-user seam wiring pending`,
  )
}

export const suspendWorkspace = async (workspaceId: string): Promise<void> => {
  await db
    .update(workspaceMetaModel)
    .set({ suspendedAt: new Date() })
    .where(eqWorkspace(workspaceId))
}

export const reactivateWorkspace = async (
  workspaceId: string,
): Promise<void> => {
  await db
    .update(workspaceMetaModel)
    .set({ suspendedAt: null })
    .where(eqWorkspace(workspaceId))
}

import { eq } from "drizzle-orm"

const eqWorkspace = (id: string) => eq(workspaceMetaModel.workspaceId, id)
