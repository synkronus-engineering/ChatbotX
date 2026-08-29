/**
 * E1 workspace provisioning — creates Workspaces through the MIT-zone
 * workspaceService seam and records our ent.workspace_meta overlay.
 * Idempotent per (ownerEmail, name).
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
  _input: ProvisionInput,
): Promise<ProvisionResult> => {
  await Promise.resolve()
  // Implementation lands with Task 4 once the service seam contract is
  // wired through the isolation suite (Task 3 gates this file's body).
  throw new Error("provisionWorkspace: not implemented (Task 4)")
}

export const suspendWorkspace = async (_workspaceId: string): Promise<void> => {
  await Promise.resolve()
  throw new Error("suspendWorkspace: not implemented (Task 4)")
}

export const reactivateWorkspace = async (
  _workspaceId: string,
): Promise<void> => {
  await Promise.resolve()
  throw new Error("reactivateWorkspace: not implemented (Task 4)")
}
