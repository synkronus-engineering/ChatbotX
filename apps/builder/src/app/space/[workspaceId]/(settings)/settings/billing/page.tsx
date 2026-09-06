import {
  type EffectivePlanState,
  getCapacitySnapshot,
  getPlanByKey,
  PLAN_KEYS,
  resolveEffectivePlan,
  type SubscriptionStatus,
} from "@chatbotx.io/slice-plans"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { UsageBars } from "@/components/usage-bars"
import { UpgradeButton } from "@/features/billing/upgrade-button"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import type { QuotaMetric, QuotaMetricKey } from "@/lib/quota-metrics"

const DAY_MS = 24 * 60 * 60 * 1000

const STATUS_LABEL_KEYS: Record<SubscriptionStatus, string> = {
  active: "billing.status.active",
  canceled: "billing.status.canceled",
  expired: "billing.status.expired",
  past_due: "billing.status.past_due",
  trial: "billing.status.trial",
}

const USAGE_LABEL_KEYS: Record<string, string> = {
  channels: "billing.usage.channels",
  members: "billing.usage.teamMembers",
  workspaces: "billing.usage.workspaces",
}

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / DAY_MS))
}

export default async function BillingPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }

  const [t, format] = await Promise.all([getTranslations(), getFormatter()])

  // The ent schema only exists on forked deployments (upstream self-hosted
  // databases never ran the slice migrations), so a missing table degrades to
  // the not-configured card instead of failing the settings area.
  let state: EffectivePlanState | null = null
  let usage: Awaited<ReturnType<typeof getCapacitySnapshot>> = []
  let proVariantConfigured = false
  try {
    const [planState, snapshot, pro] = await Promise.all([
      resolveEffectivePlan(workspaceId),
      getCapacitySnapshot({
        ownerId: userAndWorkspace.targetWorkspace.ownerId,
        workspaceId,
      }),
      getPlanByKey(PLAN_KEYS.pro),
    ])
    state = planState
    usage = snapshot
    proVariantConfigured = Boolean(pro?.lsVariantId)
  } catch {
    state = null
  }

  if (!state) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("billing.notConfigured.title")}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {t("billing.notConfigured.description")}
        </CardContent>
      </Card>
    )
  }

  const status: SubscriptionStatus = state.subscription?.status ?? "active"
  const planName = state.plan?.name ?? state.effectivePlanKey
  const trialEndsAt = state.subscription?.trialEndsAt ?? null

  let trialText: string | null = null
  if (state.onTrial && trialEndsAt) {
    const daysLeft = daysUntil(trialEndsAt)
    if (daysLeft <= 0) {
      trialText = t("billing.trial.expired")
    } else if (daysLeft === 1) {
      trialText = t("billing.trial.endsTomorrow")
    } else {
      trialText = t("billing.trial.daysLeft", { days: daysLeft })
    }
  }

  const onActivePro =
    state.effectivePlanKey === PLAN_KEYS.pro &&
    state.subscription?.status === "active"
  const period = state.subscription
  let upgradeSlot: React.ReactNode = null
  if (!onActivePro) {
    upgradeSlot = proVariantConfigured ? (
      <UpgradeButton workspaceId={workspaceId} />
    ) : (
      <p className="text-muted-foreground text-sm">
        {t("billing.notConfigured.description")}
      </p>
    )
  }

  const metrics: QuotaMetric[] = usage
    .filter((entry) => entry.limit !== null)
    .map((entry) => ({
      key: entry.metric === "members" ? "teamMembers" : entry.metric,
      limit: entry.limit ?? 0,
      used: entry.used,
    }))
  const labels = Object.fromEntries(
    metrics.map((metric) => [metric.key, t(USAGE_LABEL_KEYS[metric.key])]),
  ) as Record<QuotaMetricKey, string>

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("billing.plan.currentLabel")}</CardTitle>
          <Badge variant="secondary">{t(STATUS_LABEL_KEYS[status])}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold text-2xl">{planName}</span>
            {trialText ? (
              <span className="text-muted-foreground text-sm">{trialText}</span>
            ) : null}
          </div>
          {status === "past_due" ? (
            <p className="text-destructive text-sm">
              {t("billing.pastDue.message")}
            </p>
          ) : null}
          {onActivePro && period?.periodStart && period.periodEnd ? (
            <p className="text-muted-foreground text-sm">
              {t("billing.period.current", {
                end: format.dateTime(period.periodEnd, { dateStyle: "medium" }),
                start: format.dateTime(period.periodStart, {
                  dateStyle: "medium",
                }),
              })}
            </p>
          ) : null}
          {onActivePro ? (
            <p className="text-muted-foreground text-sm">
              {t("billing.manage.hint")}
            </p>
          ) : null}
          {upgradeSlot}
        </CardContent>
      </Card>

      {metrics.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("billing.usageTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageBars labels={labels} metrics={metrics} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
