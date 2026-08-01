"use client";

import { BET_MARKETS } from "@/lib/betMarkets";
import { RoomState } from "@/lib/types";
import { Check, Lock, TrendingUp } from "lucide-react";
import { useState } from "react";

/**
 * The player's side of the standing market.
 *
 * Every pick is a toggle you can keep changing — the deck pauses on a market
 * screen after each question precisely so people can be talked into switching.
 * Backing yourself is allowed, and usually the funniest option.
 */
export default function BetMarketPicker({
  room,
  playerId,
  onPlaced,
}: {
  room: RoomState;
  playerId: string;
  onPlaced: (room: RoomState) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closed = Boolean(room.areBetsClosed);
  const me = room.players[playerId];
  const roster = Object.values(room.players).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  async function place(marketId: string, pick: string) {
    if (closed) return;
    setPending(`${marketId}:${pick}`);
    setError(null);
    try {
      const res = await fetch("/api/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, marketId, pick }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Vetoa ei voitu kirjata.");
        return;
      }
      onPlaced(data.room);
    } catch {
      setError("Yhteysvirhe. Tarkista verkkoyhteys ja yritä uudelleen.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="glass-panel" style={{ padding: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          marginBottom: "0.35rem",
        }}
      >
        <TrendingUp size={24} style={{ color: "var(--neon-cyan)" }} />
        <h3 style={{ fontSize: "1.35rem", fontWeight: 800 }}>
          Ennustusmarkkina
        </h3>
      </div>

      <p
        style={{
          color: closed ? "var(--neon-gold)" : "var(--text-muted)",
          fontWeight: closed ? 700 : 400,
          marginBottom: "1.5rem",
        }}
      >
        {closed
          ? "Markkina on suljettu. Vetosi on lukittu."
          : "Voit vaihtaa vetoasi niin monta kertaa kuin haluat, aina siihen asti kun tarkistusvaihe alkaa."}
      </p>

      {error && (
        <p
          style={{
            color: "#fca5a5",
            fontWeight: 700,
            marginBottom: "1rem",
          }}
        >
          {error}
        </p>
      )}

      {roster.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          Odotetaan pelaajia — vetoja voi lyödä heti kun mukana on muitakin.
        </p>
      )}

      {BET_MARKETS.map((market) => {
        const myPick = me?.bets?.[market.id];
        return (
          <div key={market.id} style={{ marginBottom: "1.75rem" }}>
            <h4 style={{ fontSize: "1.1rem", fontWeight: 800 }}>
              {market.question}
            </h4>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9rem",
                marginBottom: "0.75rem",
              }}
            >
              {market.hint} Oikea veto {market.points} p.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              {roster.map((candidate) => {
                const selected = myPick === candidate.id;
                const busy = pending === `${market.id}:${candidate.id}`;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    disabled={closed || busy}
                    aria-pressed={selected}
                    onClick={() => place(market.id, candidate.id)}
                    className="btn-secondary btn-compact"
                    style={{
                      opacity: closed && !selected ? 0.45 : 1,
                      cursor: closed ? "default" : "pointer",
                      borderColor: selected ? "var(--neon-cyan)" : undefined,
                      background: selected
                        ? "rgba(6, 182, 212, 0.25)"
                        : undefined,
                      color: selected ? "var(--neon-cyan)" : undefined,
                      fontWeight: selected ? 800 : 600,
                    }}
                  >
                    {selected && <Check size={15} />}
                    {candidate.id === playerId
                      ? `${candidate.name} (sinä)`
                      : candidate.name}
                  </button>
                );
              })}
            </div>

            {closed && myPick && (
              <p
                style={{
                  marginTop: "0.6rem",
                  color: "var(--neon-gold)",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                }}
              >
                <Lock size={13} style={{ verticalAlign: "-2px" }} /> Lukittu:{" "}
                {room.players[myPick]?.name ?? "(poistunut)"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
