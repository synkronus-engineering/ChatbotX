import type { Metadata } from "next"
import {
  HERO,
  PLANS,
  SITE_NAME,
  TOOLS,
  type ToolCard,
  TRIAL_NOTE,
} from "../lib/site-copy"

export const metadata: Metadata = {
  title: `${SITE_NAME} — Cinco herramientas de IA para tu negocio`,
}

function ToolIcon({ icon }: { icon: ToolCard["icon"] }) {
  switch (icon) {
    case "chat":
      return (
        <svg
          aria-hidden="true"
          fill="none"
          height="22"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
          width="22"
        >
          <path
            d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case "booking":
      return (
        <svg
          aria-hidden="true"
          fill="none"
          height="22"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
          width="22"
        >
          <rect height="16" rx="2" width="18" x="3" y="5" />
          <path d="M8 3v4M16 3v4M3 10h18" strokeLinecap="round" />
        </svg>
      )
    case "crm":
      return (
        <svg
          aria-hidden="true"
          fill="none"
          height="22"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
          width="22"
        >
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 11a3 3 0 1 0 0-6M15.5 19a5.6 5.6 0 0 1 2-4.3" />
        </svg>
      )
    case "social":
      return (
        <svg
          aria-hidden="true"
          fill="none"
          height="22"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
          width="22"
        >
          <circle cx="6.5" cy="7" r="2.6" />
          <circle cx="17.5" cy="7" r="2.6" />
          <path d="M8.7 8.5l6.6 5M15.3 8.5l-6.6 5" strokeLinecap="round" />
          <path d="M12 13.5V19M9.5 19h5" strokeLinecap="round" />
        </svg>
      )
    case "commerce":
      return (
        <svg
          aria-hidden="true"
          fill="none"
          height="22"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
          width="22"
        >
          <path d="M4 5h2l2.2 10.5a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L21 8H7" />
          <circle cx="10" cy="20.4" r="1.3" />
          <circle cx="17.5" cy="20.4" r="1.3" />
        </svg>
      )
    default:
      return null
  }
}

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <div className="site-header-inner container">
          <a className="brand" href="/">
            <span className="brand-mark">K</span>
            {SITE_NAME}
          </a>
          <nav className="nav-links">
            <a href="#herramientas">Herramientas</a>
            <a href="#precios">Precios</a>
            <a className="nav-cta" href="/signup">
              Empezar gratis
            </a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <span className="eyebrow">{HERO.eyebrow}</span>
          <h1>{HERO.title}</h1>
          <p>{HERO.subtitle}</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={HERO.primaryCta.href}>
              {HERO.primaryCta.label}
            </a>
            <a className="btn btn-secondary" href={HERO.secondaryCta.href}>
              {HERO.secondaryCta.label}
            </a>
          </div>
        </div>
      </section>

      <section className="section" id="herramientas">
        <div className="container">
          <h2 className="section-title">Todo lo que tu negocio necesita</h2>
          <p className="section-subtitle">
            Cinco herramientas que comparten los mismos contactos, canales y
            automatizaciones — sin costos ni integraciones extra.
          </p>
          <div className="tools-grid">
            {TOOLS.map((tool) => (
              <article className="tool-card" key={tool.name}>
                <div className="tool-icon">
                  <ToolIcon icon={tool.icon} />
                </div>
                <h3>{tool.name}</h3>
                <p>{tool.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="precios">
        <div className="container">
          <h2 className="section-title">Precios simples</h2>
          <p className="section-subtitle">
            Empieza gratis. Sube a Pro cuando tu operación crezca.
          </p>
          <div className="pricing-grid">
            {PLANS.map((plan) => (
              <article
                className={plan.highlight ? "plan-card highlight" : "plan-card"}
                key={plan.name}
              >
                <span className="plan-name">{plan.name}</span>
                <div className="plan-price">
                  <span className="amount">{plan.price}</span>
                  <span className="note">{plan.priceNote}</span>
                </div>
                <ul className="plan-list">
                  {plan.limits.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                  <li className="plan-list-heading">Además:</li>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <a
                  className={
                    plan.highlight
                      ? "btn btn-primary btn-block plan-cta"
                      : "btn btn-secondary btn-block plan-cta"
                  }
                  href={plan.cta.href}
                >
                  {plan.cta.label}
                </a>
              </article>
            ))}
          </div>
          <p className="trial-note">{TRIAL_NOTE}</p>
        </div>
      </section>

      <section className="section final-cta">
        <div className="container">
          <h2>Activa tu negocio hoy</h2>
          <p>Crea tu cuenta en menos de un minuto.</p>
          <a className="btn btn-primary" href="/signup">
            Crear cuenta gratis
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container">
          © {new Date().getFullYear()} {SITE_NAME}
        </div>
      </footer>
    </>
  )
}
