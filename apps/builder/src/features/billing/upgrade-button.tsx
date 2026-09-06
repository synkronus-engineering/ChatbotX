"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

/**
 * Starts a Lemon Squeezy checkout for Pro on behalf of the workspace owner
 * (the route re-checks ownership) and hands the browser the hosted checkout
 * URL. The page renders this only when the workspace is on the free plan and
 * the provider variant is configured.
 */
export function UpgradeButton({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const [pending, setPending] = useState(false)

  const startCheckout = async () => {
    setPending(true)
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
      const payload = (await response.json()) as {
        checkoutUrl?: string
        error?: string
      }
      if (!(response.ok && payload.checkoutUrl)) {
        toast.error(payload.error ?? t("billing.upgrade.error"))
        setPending(false)
        return
      }
      window.location.href = payload.checkoutUrl
    } catch {
      toast.error(t("billing.upgrade.error"))
      setPending(false)
    }
  }

  return (
    <Button disabled={pending} onClick={startCheckout} type="button">
      {pending ? t("billing.upgrade.pending") : t("billing.upgrade.cta")}
    </Button>
  )
}
