"use client";

import { Edit3, Monitor, Smartphone, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div
        className="glass-panel"
        style={{
          padding: "3rem 2.5rem",
          maxWidth: "760px",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            padding: "0.5rem 1rem",
            borderRadius: "9999px",
            background: "rgba(139, 92, 246, 0.2)",
            border: "1px solid var(--primary-accent)",
            color: "var(--primary-glow)",
            fontSize: "0.85rem",
            fontWeight: 700,
            marginBottom: "1.5rem",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <Sparkles size={16} /> 10-VUOTISHISTORIAKVARTETTI 2016–2026
        </div>

        <h1
          style={{
            fontSize: "3rem",
            fontWeight: 900,
            lineHeight: 1.15,
            marginBottom: "1rem",
            background:
              "linear-gradient(135deg, #ffffff 0%, var(--primary-glow) 50%, var(--secondary-accent) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Slack Backlog Quiz
        </h1>

        <p
          style={{
            fontSize: "1.2rem",
            color: "var(--text-muted)",
            marginBottom: "2.5rem",
            lineHeight: 1.6,
          }}
        >
          Tervetuloa 10 vuoden Slack-historiakatsaukseen! Yli 1 000 000 viestiä
          muutettuna 15+ dian interaktiiviseksi visailukokemukseksi.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1.25rem",
          }}
        >
          <Link
            href="/deck"
            className="glass-panel"
            style={{
              padding: "1.75rem 1.25rem",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.85rem",
            }}
          >
            <Monitor size={42} style={{ color: "var(--neon-cyan)" }} />
            <div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800 }}>
                Valkokangas
              </h3>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  marginTop: "0.25rem",
                }}
              >
                Esitystila isolle näytölle (/deck)
              </p>
            </div>
          </Link>

          <Link
            href="/play"
            className="glass-panel"
            style={{
              padding: "1.75rem 1.25rem",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.85rem",
            }}
          >
            <Smartphone size={42} style={{ color: "var(--secondary-accent)" }} />
            <div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800 }}>
                Puhelinohjain
              </h3>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  marginTop: "0.25rem",
                }}
              >
                Liity peliin puhelimella (/play)
              </p>
            </div>
          </Link>

          <Link
            href="/editor"
            className="glass-panel"
            style={{
              padding: "1.75rem 1.25rem",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.85rem",
            }}
          >
            <Edit3 size={42} style={{ color: "var(--neon-gold)" }} />
            <div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800 }}>
                Visa-Editori
              </h3>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  marginTop: "0.25rem",
                }}
              >
                Luo & muokkaa kysymyksiä (/editor)
              </p>
            </div>
          </Link>
        </div>

        <div
          style={{
            marginTop: "2.5rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid var(--border-glass)",
            fontSize: "0.9rem",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          <Trophy size={16} style={{ color: "var(--neon-gold)" }} /> Parsittu
          1 072 775 viestistä | Valmis Vercel-deployaukseen!
        </div>
      </div>
    </div>
  );
}
