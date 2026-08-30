declare global {
  interface Window {
    __KONVERSIFY__?: { builderUrl?: string }
  }
}

/**
 * Builder origin, resolved at runtime: /config.js (rendered from the server
 * env) is the source of truth in deployed images; the build-time env value is
 * only a dev fallback. Empty string keeps URLs relative.
 */
export function runtimeBuilderUrl(): string {
  if (typeof window !== "undefined" && window.__KONVERSIFY__?.builderUrl) {
    return window.__KONVERSIFY__.builderUrl
  }
  return process.env.NEXT_PUBLIC_BUILDER_URL ?? ""
}
