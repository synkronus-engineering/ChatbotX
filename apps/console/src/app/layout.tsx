import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Konversify Console",
  description: "Tenant and workspace management",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <nav
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid #e5e5e5",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <strong style={{ fontSize: 16 }}>Konversify Console</strong>
          <a
            href="/workspaces"
            style={{ textDecoration: "none", color: "#2563eb" }}
          >
            Workspaces
          </a>
        </nav>
        <main style={{ padding: 24 }}>{children}</main>
      </body>
    </html>
  )
}
