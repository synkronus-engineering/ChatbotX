"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  MessageCircleMoreIcon,
  RadioIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { WorkspaceOverview } from "../queries"

export function WorkspaceDashboard({
  workspaceId,
  overview,
}: {
  workspaceId: string
  overview: WorkspaceOverview
}) {
  const t = useTranslations()

  const kpis = [
    { key: "chats", label: t("dashboard.chats7d"), value: overview.chats7d },
    {
      key: "messages",
      label: t("dashboard.messages7d"),
      value: overview.messages7d,
    },
    {
      key: "contacts",
      label: t("fields.contacts.label"),
      value: overview.contacts,
    },
    {
      key: "channels",
      label: t("dashboard.channels"),
      value: overview.connectedChannels,
    },
    { key: "flows", label: t("fields.flows.label"), value: overview.flows },
  ]

  const quickActions = [
    {
      key: "inbox",
      label: t("fields.inbox.label"),
      url: `/space/${workspaceId}/inbox`,
      icon: MessageCircleMoreIcon,
    },
    {
      key: "flows",
      label: t("fields.flows.label"),
      url: `/space/${workspaceId}/flows`,
      icon: WorkflowIcon,
    },
    {
      key: "contacts",
      label: t("fields.contacts.label"),
      url: `/space/${workspaceId}/contacts`,
      icon: UsersIcon,
    },
    {
      key: "broadcasts",
      label: t("broadcasts.title"),
      url: `/space/${workspaceId}/broadcasts`,
      icon: RadioIcon,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-semibold text-lg">{t("dashboard.title")}</h1>
        {overview.plan && (
          <Badge aria-label={t("dashboard.plan")} variant="secondary">
            {t("dashboard.plan")}: {overview.plan}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.key}>
            <CardHeader className="pb-0">
              <CardTitle className="font-medium text-muted-foreground text-xs">
                {kpi.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="font-semibold text-2xl">
              {kpi.value.toLocaleString()}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-medium text-sm">
            {t("dashboard.quickActions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Link
              className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-secondary-foreground text-sm hover:bg-secondary/80"
              href={action.url}
              key={action.key}
            >
              <action.icon className="size-4" />
              {action.label}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
