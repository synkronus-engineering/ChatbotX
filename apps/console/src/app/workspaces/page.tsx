import { listWorkspaces } from "@chatbotx.io/slice-tenancy"
import NewWorkspaceForm from "./new-workspace-form"

export const dynamic = "force-dynamic"

type WorkspaceRow = {
  workspace_id: string
  plan: string
  locale: string
  suspended_at: string | null
  name: string
  owner_email: string
}

export default async function WorkspacesPage() {
  let workspaces: WorkspaceRow[] = []
  let error: string | null = null

  try {
    const rows = await listWorkspaces()
    workspaces = rows as unknown as WorkspaceRow[]
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load workspaces"
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Workspaces</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Each workspace is a tenant. One workspace per owner (community edition).
      </p>

      {error && (
        <div
          style={{
            padding: 12,
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 8,
            marginBottom: 16,
            color: "#dc2626",
          }}
        >
          {error}
        </div>
      )}

      <NewWorkspaceForm />

      {workspaces.length === 0 ? (
        <p style={{ color: "#999", marginTop: 32 }}>No workspaces yet.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: 24,
          }}
        >
          <thead>
            <tr
              style={{ textAlign: "left", borderBottom: "2px solid #e5e5e5" }}
            >
              <th style={th}>Name</th>
              <th style={th}>Owner</th>
              <th style={th}>Plan</th>
              <th style={th}>Locale</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((ws) => (
              <tr
                key={ws.workspace_id}
                style={{ borderBottom: "1px solid #eee" }}
              >
                <td style={td}>{ws.name}</td>
                <td style={td}>{ws.owner_email}</td>
                <td style={td}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: 12,
                      background: ws.plan === "free" ? "#f3f4f6" : "#dbeafe",
                      color: ws.plan === "free" ? "#374151" : "#1d4ed8",
                    }}
                  >
                    {ws.plan}
                  </span>
                </td>
                <td style={td}>{ws.locale}</td>
                <td style={td}>
                  {ws.suspended_at ? (
                    <span style={{ color: "#dc2626" }}>Suspended</span>
                  ) : (
                    <span style={{ color: "#16a34a" }}>Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  color: "#666",
}

const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
}
