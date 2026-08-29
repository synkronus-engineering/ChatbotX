import type { NextConfig } from "next"

const config: NextConfig = {
  output: "standalone",
  transpilePackages: ["@chatbotx.io/slice-tenancy", "@chatbotx.io/database"],
}

export default config
