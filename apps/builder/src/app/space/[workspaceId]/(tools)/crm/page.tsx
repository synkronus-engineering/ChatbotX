import { notFound } from "next/navigation"
import { ToolEmbedFrame } from "@/features/tools/tool-embed-frame"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"
import { toolUrl } from "@/lib/tools"

export default async function CrmToolPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  await resolveGuardedWorkspaceId(params, "flows")

  const src = toolUrl("crm")
  if (!src) {
    return notFound()
  }

  return (
    <div className="-m-6 h-[calc(100dvh-3rem)]">
      <ToolEmbedFrame src={src} tool="crm" />
    </div>
  )
}
