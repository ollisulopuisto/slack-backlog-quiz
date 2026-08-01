"use client";

import { BET_MARKETS, betStandings } from "@/lib/betMarkets";
import { RoomState } from "@/lib/types";
import { motion } from "framer-motion";
import { Lock, TrendingUp } from "lucide-react";

/**
 * The between-questions market screen for the projector.
 *
 * Bars are backer counts, and they move as phones come in — the graph updating
 * live under the room's nose is the whole point of pausing here.
 */
export default function BetMarketBoard({ room }: { room: RoomState }) {
  const totalPlayers = Object.keys(room.players).length;
  const closed = Boolean(room.areBetsClosed);

  return (
    <div
      className="glass-panel"
      style={{ padding: "2.5rem", width: "100%" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          marginBottom: "0.5rem",
        }}
      >
        <TrendingUp size={36} style={{ color: "var(--neon-cyan)" }} />
        <h2 style={{ fontSize: "2.5rem", fontWeight: 900 }}>
          Ennustusmarkkina
        </h2>
      </div>

      <p
        style={{
          textAlign: "center",
          color: closed ? "var(--neon-gold)" : "var(--text-muted)",
          fontWeight: 700,
          marginBottom: "2rem",
        }}
      >
        {closed ? (
          <>
            <Lock size={16} style={{ verticalAlign: "-2px" }} /> Markkina on
            suljettu — vedot lukittu.
          </>
        ) : (
          "Päivitä veto puhelimella. Voit vaihtaa niin monta kertaa kuin haluat!"
        )}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "2.5rem",
        }}
      >
        {BET_MARKETS.map((market) => {
          const standings = betStandings(market.id, room);
          const votes = standings.reduce((n, s) => n + s.backers.length, 0);
          const leader = standings[0]?.backers.length ?? 0;

          return (
            <div key={market.id}>
              <h3
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  marginBottom: "0.25rem",
                }}
              >
                {market.question}
              </h3>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.95rem",
                  marginBottom: "1.25rem",
                }}
              >
                {votes} / {totalPlayers} vetoa · {market.points} p oikeasta
              </p>

              {standings.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                  Ei vielä yhtään vetoa.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}
                >
                  {standings.map((entry) => (
                    <div key={entry.playerId}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontWeight: 700,
                          fontSize: "1.05rem",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <span>{entry.name}</span>
                        <span style={{ color: "var(--neon-cyan)" }}>
                          {entry.backers.length}
                        </span>
                      </div>
                      <div
                        style={{
                          height: "1.5rem",
                          borderRadius: "8px",
                          background: "rgba(255, 255, 255, 0.06)",
                          overflow: "hidden",
                        }}
                      >
                        <motion.div
                          initial={false}
                          animate={{
                            width: `${
                              leader > 0
                                ? (entry.backers.length / leader) * 100
                                : 0
                            }%`,
                          }}
                          transition={{ type: "spring", stiffness: 120, damping: 20 }}
                          style={{
                            height: "100%",
                            background:
                              "linear-gradient(90deg, var(--primary-accent), var(--secondary-accent))",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
