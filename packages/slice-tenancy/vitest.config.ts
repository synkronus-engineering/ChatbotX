import preset from "@chatbotx.io/vitest-config/node"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: preset.test,
})
