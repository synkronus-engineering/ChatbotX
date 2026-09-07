import {
  isAccessTokenIdpEnabled,
  mintWorkspaceAccessToken,
} from "@chatbotx.io/auth"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { notFound } from "next/navigation"
import { ToolEmbedFrame } from "@/features/tools/tool-embed-frame"
import { auth } from "@/lib/auth/auth"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { toolUrl } from "@/lib/tools"

/**
 * Contract 3: the booking tool hand-off (cal.diy). Same shape as the social
 * page — the workspace access token is minted server-side from the session
 * and passed inside the URL *fragment*, which browsers never send to the
 * server (keeping it out of tool access logs).
 */
export default async function BookingToolPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "flows")

  const toolBaseUrl = toolUrl("booking")
  if (!toolBaseUrl) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }

  if (!isAccessTokenIdpEnabled()) {
    return (
      <Card className="mx-auto mt-8 max-w-md">
        <CardContent className="text-muted-foreground text-sm">
          TOOL_BOOKING_URL is configured but the access-token IdP is not — set
          AUTH_JWT_ISSUER and AUTH_JWT_AUDIENCE to enable the booking tool.
        </CardContent>
      </Card>
    )
  }

  const token = await mintWorkspaceAccessToken(auth, {
    user: {
      id: userAndWorkspace.user.id,
      email: userAndWorkspace.user.email,
    },
    workspaceId,
    role: userAndWorkspace.targetWorkspaceMember.role,
    ttlSeconds: 120,
  })

  const ssoUrl = new URL("/sso", toolBaseUrl)
  ssoUrl.hash = `t=${token}`

  return (
    <div className="-m-6 h-[calc(100dvh-3rem)]">
      <ToolEmbedFrame src={ssoUrl.toString()} tool="booking" />
    </div>
  )
}
