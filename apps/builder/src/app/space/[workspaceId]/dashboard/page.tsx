import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { WorkspaceDashboard } from "@/features/workspace-dashboard/components/workspace-dashboard"
import { getWorkspaceOverview } from "@/features/workspace-dashboard/queries"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

/**
 * Unified workspace overview. The enclosing dashboard layout already gates on
 * the `analytics` permission and renders the inbox cards above this page.
 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }

  const overview = await getWorkspaceOverview(workspaceId)

  return <WorkspaceDashboard overview={overview} workspaceId={workspaceId} />
}
