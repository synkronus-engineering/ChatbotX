export const SITE_NAME = "Konversify"

export const HERO = {
  eyebrow: "Plataforma de agentes de IA para negocios",
  title: "Cinco herramientas de IA en un solo espacio de trabajo",
  subtitle:
    "Chat con IA, agenda, CRM, redes sociales y ventas — conectados a tus canales de WhatsApp, Messenger, Instagram y Telegram.",
  primaryCta: { label: "Crear cuenta gratis", href: "/signup" },
  secondaryCta: { label: "Ver precios", href: "#precios" },
} as const

export interface ToolCard {
  description: string
  icon: "chat" | "booking" | "crm" | "social" | "commerce"
  name: string
}

export const TOOLS: ToolCard[] = [
  {
    icon: "chat",
    name: "AI Chat",
    description:
      "Agentes que atienden, califican y venden por ti, 24/7, con tu información.",
  },
  {
    icon: "booking",
    name: "Booking",
    description:
      "Agenda inteligente que confirma citas y envía recordatorios por chat.",
  },
  {
    icon: "crm",
    name: "CRM",
    description:
      "Contactos, conversaciones e historial en un pipeline claro y automatizable.",
  },
  {
    icon: "social",
    name: "Social",
    description: "Publica y responde en tus redes desde una única bandeja.",
  },
  {
    icon: "commerce",
    name: "Commerce",
    description: "Catálogo, pedidos y pagos sin salir de la conversación.",
  },
] as const

export interface PlanColumn {
  cta: { href: string; label: string }
  features: string[]
  highlight: boolean
  limits: string[]
  name: string
  price: string
  priceNote: string
}

export const PLANS: PlanColumn[] = [
  {
    name: "Gratis",
    price: "$0",
    priceNote: "para siempre",
    highlight: false,
    limits: [
      "1 espacio de trabajo",
      "2 canales conectados",
      "3 miembros de equipo",
      "1.000 contactos",
      "500 mensajes de IA al mes",
    ],
    features: ["Las 5 herramientas", "Soporte por correo"],
    cta: { label: "Empezar gratis", href: "/signup" },
  },
  {
    name: "Pro",
    price: "$29",
    priceNote: "al mes",
    highlight: true,
    limits: [
      "10 espacios de trabajo",
      "10 canales conectados",
      "15 miembros de equipo",
      "10.000 contactos",
      "5.000 mensajes de IA al mes",
    ],
    features: [
      "Commerce con pagos",
      "Marca personalizada",
      "Dominios propios",
      "Registro de auditoría",
      "Campañas de email",
      "Acceso por API",
      "Modelos de IA avanzados",
    ],
    cta: { label: "Probar Pro 14 días gratis", href: "/signup" },
  },
] as const

export const TRIAL_NOTE =
  "Al crear tu cuenta empiezas con 14 días de Pro gratis. Sin tarjeta: al terminar, pasas al plan Gratis."

export const SIGNUP = {
  title: "Crea tu cuenta",
  subtitle: "Empieza hoy con 14 días de Pro. Sin tarjeta.",
  businessNameLabel: "Nombre de tu negocio",
  nameLabel: "Tu nombre",
  emailLabel: "Correo",
  passwordLabel: "Contraseña",
  submit: "Crear cuenta",
  submitting: "Creando cuenta…",
  signInPrompt: "¿Ya tienes cuenta?",
  signInLink: "Inicia sesión",
  verifyTitle: "Revisa tu correo",
  verifyBody:
    "Te enviamos un enlace de confirmación. Ábrelo para activar tu cuenta y luego inicia sesión — tu negocio quedará configurado automáticamente.",
  verifyCta: "Ya confirmé mi correo — iniciar sesión",
} as const

export const SIGNIN = {
  title: "Iniciar sesión",
  subtitle: "Bienvenido de vuelta.",
  emailLabel: "Correo",
  passwordLabel: "Contraseña",
  submit: "Entrar",
  submitting: "Entrando…",
  magicLinkLabel: "O recibe un enlace mágico por correo",
  magicLinkSubmit: "Enviar enlace",
  magicLinkSent: "Enlace enviado — revisa tu correo.",
  signUpPrompt: "¿Aún no tienes cuenta?",
  signUpLink: "Crea una gratis",
} as const

export const ERRORS = {
  generic: "Algo salió mal. Inténtalo de nuevo.",
  provision:
    "No pudimos crear tu espacio de trabajo. Entra a la app e inténtalo desde ahí.",
} as const
