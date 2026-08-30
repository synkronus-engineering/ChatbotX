"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Reserved postMessage protocol between a embedded tool and the shell
 * (contract 4). `konversify:ready` clears the loading state; `navigate` and
 * `toast` are reserved for later transport work — the seam exists so swapping
 * the transport (module federation, native) never touches shell navigation.
 */
type ToolEmbedMessage = {
  type:
    | "konversify:ready"
    | "konversify:navigate"
    | "konversify:toast"
    | (string & {})
}

export function ToolEmbed({ src, title }: { src: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Only trust messages from the embedded tool's own window; the protocol
    // prefix keeps unrelated window messages out of the seam.
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return
      }
      const data = event.data as { type?: ToolEmbedMessage["type"] } | null
      if (typeof data?.type !== "string") {
        return
      }
      if (!data.type.startsWith("konversify:")) {
        return
      }
      switch (data.type) {
        case "konversify:ready":
          setLoading(false)
          break
        // `konversify:navigate` / `konversify:toast` handlers land with the
        // transport work; intentionally unhandled for now.
        default:
          break
      }
    }
    window.addEventListener("message", onMessage)
    return () => {
      window.removeEventListener("message", onMessage)
    }
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {loading && (
        <div
          aria-label={`${title} is loading`}
          className="absolute inset-0 z-10 flex items-center justify-center bg-background"
          role="status"
        >
          <span className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad only clears the loading spinner; the iframe itself is not interactive. */}
      <iframe
        allow="clipboard-read; clipboard-write"
        className="h-full w-full border-0"
        onLoad={() => {
          // Tools that never emit `konversify:ready` still clear the loader.
          setLoading(false)
        }}
        ref={iframeRef}
        // `allow-same-origin` + `allow-scripts` together look like the classic
        // sandbox escape, but they scope to the tool's OWN origin — required so
        // the tool can hold its session cookie. The shell origin is never
        // reachable from inside the frame.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        src={src}
        title={title}
      />
    </div>
  )
}
