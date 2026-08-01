"use client";
import { formatScore, slideMaxPoints } from "@/lib/scoring";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { captureHostKeyFromUrl, hostFetch } from "@/lib/hostClient";
import { RoomState, SlideData, Player } from "@/lib/types";
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Printer,
  RefreshCw,
  Trophy,
  Users,
  ShieldCheck,
} from "lucide-react";

export default function SummaryPage() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  // Draft values for the number inputs. The 2s poll owns `room`, so an input
  // bound straight to server state fights the host while they type.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const fetchRoom = useCallback(async () => {
    try {
      const res = await hostFetch("/api/room");
      if (res.ok) {
        const data: RoomState = await res.json();
        setRoom(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    captureHostKeyFromUrl();
    fetchRoom();
    const interval = setInterval(fetchRoom, 2000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  const handleScoreChange = async (
    slideId: string | number,
    playerId: string,
    points: number
  ) => {
    if (!Number.isFinite(points)) return;
    const key = `${slideId}_${playerId}`;
    setSavingMap((prev) => ({ ...prev, [key]: true }));
    // Server state is authoritative once the write lands
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    try {
      const res = await hostFetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "override_score",
          slideId,
          playerId,
          points,
        }),
      });
      if (res.ok) {
        const updatedRoom = await res.json();
        setRoom(updatedRoom);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingMap((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  if (loading || !room) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
        }}
      >
        <h3>Ladataan vastausten yhteenvetoa...</h3>
      </div>
    );
  }

  const playersList: Player[] = Object.values(room.players).sort(
    (a, b) => b.score - a.score
  );
  const questionSlides: SlideData[] = room.slides.filter(
    (s) =>
      s.type === "multiple_choice" ||
      s.type === "connect_pairs" ||
      s.type === "open_ended" ||
      s.type === "prediction_market" ||
      s.type === "slider"
  );

  const totalPlayers = playersList.length;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        maxWidth: "1400px",
        margin: "0 auto",
        color: "#ffffff",
      }}
    >
      {/* HEADER / NAVIGATION BAR */}
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link href="/deck" className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ArrowLeft size={18} /> Esitystilaan (/deck)
          </Link>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 900, margin: 0, display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <ShieldCheck style={{ color: "var(--neon-green)" }} size={32} /> Admin-Varmuuskopio ja manuaalipisteytys
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button onClick={fetchRoom} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <RefreshCw size={16} /> Päivitä
          </button>
          <button onClick={handlePrint} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Printer size={16} /> Tulosta / Tallenna PDF
          </button>
        </div>
      </div>

      {/* SUMMARY STATS & BACKUP BANNER */}
      <div
        className="glass-panel"
        style={{
          padding: "1.5rem 2rem",
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1.5rem",
          borderColor: "var(--neon-green)",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "var(--neon-green)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CheckCircle2 size={22} /> Vastausarkisto ja manuaalitarkistus
          </h3>
          <p style={{ margin: "0.4rem 0 0 0", color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Kaikki pelaajien syöttämät vastaukset tallentuvat tänne reaaliaikaisesti. Voit tarvittaessa korjata tai muuttaa pisteitä manuaalisesti.
          </p>
        </div>

        <div style={{ display: "flex", gap: "1.5rem" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Rekisteröityneitä</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--neon-cyan)" }}>
              <Users size={18} style={{ marginRight: "0.3rem", display: "inline" }} /> {totalPlayers} pelaajaa
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Kysymyksiä</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--neon-gold)" }}>
              {questionSlides.length} tehtävää
            </div>
          </div>
        </div>
      </div>

      {/* LEADERBOARD SUMMARY TABLE */}
      <div style={{ marginBottom: "3rem" }}>
        <h2 style={{ fontSize: "1.4rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Trophy style={{ color: "var(--neon-gold)" }} size={24} /> Pelaajien kokonaistilanne ja pisteet
        </h2>
        <div className="glass-panel" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-glass)", background: "rgba(255,255,255,0.05)" }}>
                <th style={{ padding: "1rem" }}>Sija</th>
                <th style={{ padding: "1rem" }}>Pelaaja</th>
                <th style={{ padding: "1rem" }}>Vastattuja tehtäviä</th>
                <th style={{ padding: "1rem", textAlign: "right" }}>Kokonaispisteet</th>
              </tr>
            </thead>
            <tbody>
              {playersList.map((p, idx) => {
                const answeredCount = Object.keys(p.answers || {}).length;
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "1rem", fontWeight: 800, color: idx === 0 ? "var(--neon-gold)" : "inherit" }}>
                      #{idx + 1}
                    </td>
                    <td style={{ padding: "1rem", fontWeight: 700, fontSize: "1.1rem" }}>{p.name}</td>
                    <td style={{ padding: "1rem", color: "var(--text-muted)" }}>
                      {answeredCount} / {questionSlides.length}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right", fontWeight: 900, fontSize: "1.2rem", color: "var(--neon-green)" }}>
                      {formatScore(p.score)} p
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* COMPILED QUESTIONS & PLAYER ANSWERS DETAILED MATRIX */}
      <h2 style={{ fontSize: "1.4rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Edit3 style={{ color: "var(--neon-cyan)" }} size={24} /> Kysymyskohtaiset vastaukset & Manuaalinen pisteytys
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {questionSlides.map((slide, sIdx) => {
          const answeredCount = playersList.filter((p) => p.answers[slide.id] !== undefined).length;
          const allAnswered = answeredCount >= totalPlayers && totalPlayers > 0;

          return (
            <div
              key={slide.id}
              className="glass-panel"
              style={{
                padding: "1.5rem 2rem",
                borderColor: allAnswered ? "var(--neon-green)" : "var(--border-glass)",
              }}
            >
              {/* SLIDE HEADER */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
                    <span className="badge-category">Kysymys {sIdx + 1}: {slide.category}</span>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Max: {formatScore(slideMaxPoints(slide))} p</span>
                    {allAnswered && (
                      <span style={{ fontSize: "0.8rem", background: "rgba(16, 185, 129, 0.2)", color: "var(--neon-green)", padding: "0.2rem 0.6rem", borderRadius: "8px", fontWeight: 700 }}>
                        ✓ Kaikki vastanneet
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: "1.25rem", margin: 0 }}>{slide.question}</h3>
                </div>

                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: allAnswered ? "var(--neon-green)" : "var(--neon-gold)", background: "rgba(255,255,255,0.05)", padding: "0.5rem 1rem", borderRadius: "10px" }}>
                  Vastanneet: {answeredCount} / {totalPlayers}
                </div>
              </div>

              {/* CORRECT ANSWER INDICATOR */}
              <div style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid var(--neon-green)", borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.95rem" }}>
                <strong style={{ color: "var(--neon-green)" }}>Oikea vastaus / tulos: </strong>
                {slide.type === "multiple_choice" && slide.options && slide.correctAnswer !== undefined && (
                  <span>{slide.options[slide.correctAnswer]} (Vaihtoehto {slide.correctAnswer + 1})</span>
                )}
                {slide.type === "prediction_market" && slide.options && slide.resolvedOutcome !== undefined && (
                  <span>{slide.options[slide.resolvedOutcome]}</span>
                )}
                {slide.type === "slider" && (
                  <span>{slide.correctValue?.toLocaleString("fi-FI")} {slide.unit || ""}</span>
                )}
                {slide.type === "open_ended" && (
                  <span>{slide.correctAnswerText || "Avoin tehtävä"}</span>
                )}
                {slide.type === "connect_pairs" && slide.pairs && (
                  <span>{slide.pairs.map((p) => `${p.left} = ${p.right}`).join(" | ")}</span>
                )}
              </div>

              {/* ANSWERS LIST FOR THIS SLIDE */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1rem" }}>
                {playersList.map((player) => {
                  const rawAns = player.answers[slide.id];
                  const currentScore = player.scoresPerSlide?.[slide.id] ?? 0;
                  const isAnswered = rawAns !== undefined && rawAns !== null;
                  const savingKey = `${slide.id}_${player.id}`;
                  const isSaving = savingMap[savingKey];

                  let formattedAns = "(Ei vastattu)";
                  if (isAnswered) {
                    if (slide.type === "multiple_choice" && slide.options) {
                      const idx = Number(rawAns);
                      formattedAns = slide.options[idx] ? `[${idx + 1}] ${slide.options[idx]}` : String(rawAns);
                    } else if (slide.type === "prediction_market" && slide.options) {
                      const outcome = typeof rawAns === "object" ? rawAns.outcome : rawAns;
                      formattedAns = slide.options[outcome] || String(rawAns);
                    } else if (slide.type === "slider") {
                      formattedAns = `${Number(rawAns).toLocaleString("fi-FI")} ${slide.unit || ""}`;
                    } else if (slide.type === "connect_pairs" && typeof rawAns === "object") {
                      formattedAns = Object.entries(rawAns)
                        .map(([l, r]) => `${l} ➔ ${r}`)
                        .join(", ");
                    } else {
                      formattedAns = String(rawAns);
                    }
                  }

                  return (
                    <div
                      key={player.id}
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        border: isAnswered ? "1px solid rgba(255,255,255,0.15)" : "1px dashed rgba(255,255,255,0.1)",
                        borderRadius: "12px",
                        padding: "1rem",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                          <span style={{ fontWeight: 800, fontSize: "1rem", color: "var(--neon-cyan)" }}>{player.name}</span>
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: currentScore > 0 ? "var(--neon-green)" : "var(--text-muted)" }}>
                            {formatScore(currentScore)} p
                          </span>
                        </div>
                        <div style={{ fontSize: "0.95rem", color: isAnswered ? "#ffffff" : "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "0.6rem 0.8rem", borderRadius: "8px", wordBreak: "break-word" }}>
                          {formattedAns}
                        </div>
                      </div>

                      {/* MANUAL SCORE OVERRIDE BUTTONS & INPUT */}
                      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>Pisteet:</span>
                        <button
                          onClick={() => handleScoreChange(slide.id, player.id, 0)}
                          className="btn-secondary"
                          style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: currentScore === 0 ? "rgba(239, 68, 68, 0.3)" : undefined }}
                        >
                          0 p
                        </button>
                        <button
                          onClick={() => handleScoreChange(slide.id, player.id, slideMaxPoints(slide) / 2)}
                          className="btn-secondary"
                          style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: currentScore === slideMaxPoints(slide) / 2 ? "rgba(245, 158, 11, 0.3)" : undefined }}
                        >
                          {formatScore(slideMaxPoints(slide) / 2)} p
                        </button>
                        <button
                          onClick={() => handleScoreChange(slide.id, player.id, slideMaxPoints(slide))}
                          className="btn-secondary"
                          style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: currentScore === slideMaxPoints(slide) ? "rgba(16, 185, 129, 0.3)" : undefined }}
                        >
                          {formatScore(slideMaxPoints(slide))} p
                        </button>
                        <input
                          type="number"
                          value={drafts[savingKey] ?? String(currentScore)}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [savingKey]: e.target.value,
                            }))
                          }
                          onBlur={(e) => {
                            const parsed = Number(e.target.value);
                            if (e.target.value.trim() === "" || isNaN(parsed)) {
                              setDrafts((prev) => {
                                const next = { ...prev };
                                delete next[savingKey];
                                return next;
                              });
                              return;
                            }
                            if (parsed !== currentScore) {
                              handleScoreChange(slide.id, player.id, parsed);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          title="Kirjoita pisteet ja paina Enter tai siirry pois kentästä"
                          style={{
                            width: "60px",
                            padding: "0.2rem 0.4rem",
                            borderRadius: "6px",
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid var(--border-glass)",
                            color: "#ffffff",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            textAlign: "center",
                          }}
                        />
                        {isSaving && <span style={{ fontSize: "0.7rem", color: "var(--neon-cyan)" }}>Tallennetaan...</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
