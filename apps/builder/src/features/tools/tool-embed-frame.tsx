"use client"

import { ToolEmbed } from "@chatbotx.io/tool-embed"
import { useTranslations } from "next-intl"
import type { ToolKey } from "@/lib/tools"

/**
 * Server pages hand over a tool key + resolved src; the translated iframe title
 * resolves here because `useTranslations` is client-side in the builder.
 */
export function ToolEmbedFrame({ tool, src }: { tool: ToolKey; src: string }) {
  const t = useTranslations()
  const titles: Record<ToolKey, string> = {
    booking: t("tools.booking"),
    crm: t("tools.crm"),
    social: t("tools.social"),
  }

  return <ToolEmbed src={src} title={titles[tool]} />
}
