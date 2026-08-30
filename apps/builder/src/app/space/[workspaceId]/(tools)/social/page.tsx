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
 * Contract 3: the social tool hand-off. The route is a server component so the
 * workspace access token never transits the client — it is minted server-side
 * from the session and passed to the tool inside the URL *fragment*, which
 * browsers never send to the server (keeping it out of tool access logs).
 */
export default async function SocialToolPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "flows")

  const toolBaseUrl = toolUrl("social")
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
          TOOL_SOCIAL_URL is configured but the access-token IdP is not — set
          AUTH_JWT_ISSUER and AUTH_JWT_AUDIENCE to enable the social tool.
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
      <ToolEmbedFrame src={ssoUrl.toString()} tool="social" />
    </div>
  )
}
