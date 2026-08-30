import { env } from "@/env"

export const TOOL_KEYS = ["booking", "crm", "social"] as const

export type ToolKey = (typeof TOOL_KEYS)[number]

const TOOL_URL_ENV: Record<ToolKey, string | undefined> = {
  booking: env.TOOL_BOOKING_URL,
  crm: env.TOOL_CRM_URL,
  social: env.TOOL_SOCIAL_URL,
}

/** The configured base URL for a tool, or `null` when the tool is disabled. */
export function toolUrl(tool: ToolKey): string | null {
  return TOOL_URL_ENV[tool] ?? null
}

/** Tools with a configured URL, in sidebar order. */
export function enabledToolKeys(): ToolKey[] {
  return TOOL_KEYS.filter((tool) => toolUrl(tool) !== null)
}
