import { magicLinkClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { runtimeBuilderUrl } from "./config"

export const authClient = createAuthClient({
  baseURL: `${runtimeBuilderUrl()}/api/auth`,
  plugins: [magicLinkClient()],
})
