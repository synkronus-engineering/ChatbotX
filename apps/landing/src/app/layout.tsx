import type { Metadata } from "next"
import { SITE_NAME } from "../lib/site-copy"
import "./globals.css"

export const metadata: Metadata = {
  title: `${SITE_NAME} — Cinco herramientas de IA para tu negocio`,
  description:
    "AI Chat, Booking, CRM, Social y Commerce en un solo espacio de trabajo. Conecta WhatsApp, Messenger, Instagram y Telegram.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <script src="/config.js" />
      </head>
      <body>{children}</body>
    </html>
  )
}
