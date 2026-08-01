"use client";

import { advanceAction } from "@/lib/deckNavigation";
import { formatScore, slideMaxPoints } from "@/lib/scoring";
import { captureHostKeyFromUrl, hostFetch } from "@/lib/hostClient";
import BetMarketBoard from "@/components/BetMarketBoard";
import StatChartBoard from "@/components/StatChartBoard";
import QuoteCard from "@/components/QuoteCard";
import SourceContext from "@/components/SourceContext";
import EmojiText, { Emoji } from "@/components/EmojiText";
import QuizImage from "@/components/QuizImage";
import { RoomState } from "@/lib/types";
import { wifiQrPayload } from "@/lib/wifi";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Lock,
  Pencil,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Unlock,
  Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";

/** Whole-point buttons from the slide max down to zero: 3, 2, 1, 0. */
function scoreLadder(maxPts: number): number[] {
  const steps: number[] = [];
  for (let p = Math.floor(maxPts); p >= 0; p--) steps.push(p);
  return steps;
}

export default function HostDeckPage() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [joinUrl, setJoinUrl] = useState<string>("");
  const [needsHostKey, setNeedsHostKey] = useState(false);

  // Must run before the first fetch so ?key=... is available to it
  useEffect(() => {
    captureHostKeyFromUrl();
  }, []);

  const fetchRoom = useCallback(async () => {
    try {
      const res = await hostFetch("/api/room");
      if (res.ok) {
        const data = await res.json();
        setRoom(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/play`);
    }
  }, []);

  useEffect(() => {
    fetchRoom();
    const interval = setInterval(fetchRoom, 1000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  const handleAction = async (
    action:
      | "next"
      | "prev"
      | "lock"
      | "unlock"
      | "toggle_lock"
      | "start_review"
      | "end_review"
      | "reveal"
      | "reset"
      | "reload_deck"
      | "toggle_offline"
  ) => {
    try {
      const res = await hostFetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.status === 401) {
        setNeedsHostKey(true);
        return;
      }
      setNeedsHostKey(false);
      if (res.ok) {
        const data = await res.json();
        setRoom(data);
        if (action === "reveal" && currentSlide?.type === "scoreboard") {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  /**
   * Resetting clears the roster, every score and every bet, and there is no
   * undo — the previous state is overwritten on disk. Mid-quiz that is the
   * whole evening, so it says out loud what it is about to take.
   */
  const confirmReset = () => {
    const players = Object.values(room?.players ?? {});
    const scored = players.filter((p) => p.score > 0).length;
    const detail = players.length
      ? `${players.length} pelaajaa, joista ${scored} on kerännyt pisteitä`
      : "ei yhtään pelaajaa";

    if (
      window.confirm(
        `Nollataanko peli?\n\nPoistetaan: ${detail}, kaikki pisteet ja ` +
          `kaikki vedot. Pakka palaa ensimmäiseen diaan.\n\n` +
          `Tätä ei voi perua. Jos halusit vain päivittää kysymykset, ` +
          `peruuta ja käytä ”Lataa pakka”.`
      )
    ) {
      handleAction("reset");
    }
  };

  const handleScoreOpenEnded = async (playerId: string, points: number) => {
    if (!currentSlide) return;
    try {
      const res = await hostFetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "score_open_ended",
          slideId: currentSlide.id,
          playerId,
          points,
        }),
      });
      if (res.status === 401) {
        setNeedsHostKey(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setRoom(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space and Enter natively re-activate whatever button was last clicked.
      // Without this, clicking "Nollaa peli" and then tapping Space fires the
      // reset a second time *and* advances the slide.
      const target = e.target as HTMLElement | null;
      const isInteractive =
        target?.closest("button, a, input, textarea, select") != null;
      if (isInteractive && (e.key === " " || e.key === "Enter")) return;

      // Modified keystrokes belong to the browser (⌘R, ⌘←, …)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault(); // Space would otherwise scroll the deck
        // In review this is a two-press key: reveal, then move on. The whole
        // presentation stays on one finger.
        handleAction(
          room
            ? advanceAction(room, room.slides[room.currentSlideIndex])
            : "next"
        );
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleAction("prev");
      } else if (e.key.toLowerCase() === "l" || e.key.toLowerCase() === "s") {
        // Toggle, so an accidental lock is recoverable without leaving the slide
        handleAction("toggle_lock");
      } else if (e.key === "Enter" || e.key.toLowerCase() === "r") {
        if (room?.gamePhase === "review") {
          handleAction("reveal");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [room]);

  if (!room) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h2>Ladataan visaa...</h2>
      </div>
    );
  }

  const currentSlide = room.slides[room.currentSlideIndex];
  const playersList = Object.values(room.players).sort(
    (a, b) => b.score - a.score
  );
  const totalPlayers = playersList.length;

  // The deck can outlive its slide: saving a shorter quiz in /editor leaves the
  // index pointing past the end for one poll cycle.
  if (!currentSlide) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
        }}
      >
        <h2>Diaa ei löytynyt</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Esitys on tyhjä tai sitä muokattiin kesken pelin.
        </p>
        <button onClick={confirmReset} className="btn-primary">
          <RotateCcw size={18} /> Nollaa peli ja palaa alkuun
        </button>
      </div>
    );
  }

  const answeredPlayers = playersList.filter(
    (p) => p.answers[currentSlide.id] !== undefined
  );
  const answeredCount = answeredPlayers.length;

  const isQuestionType =
    currentSlide.type === "multiple_choice" ||
    currentSlide.type === "connect_pairs" ||
    currentSlide.type === "open_ended" ||
    currentSlide.type === "prediction_market";

  const isAnsweringPhase = room.gamePhase === "answering";
  const isReviewPhase = room.gamePhase === "review";

  // Shared by the forward button and the right-arrow handler, so the label
  // always matches what the key does.
  const nextStep = advanceAction(room, currentSlide);

  // Calculate live Polymarket odds
  let yesBets = 0;
  let noBets = 0;
  answeredPlayers.forEach((p) => {
    const ans = p.answers[currentSlide.id];
    const outcome = typeof ans === "object" ? ans.outcome : ans;
    if (outcome === 0) yesBets++;
    else if (outcome === 1) noBets++;
  });

  const totalBets = yesBets + noBets;
  const yesPct = totalBets > 0 ? Math.round((yesBets / totalBets) * 100) : 50;
  const noPct = 100 - yesPct;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "2rem",
      }}
    >
      {needsHostKey && (
        <div
          className="glass-panel"
          style={{
            padding: "1rem 1.5rem",
            marginBottom: "1rem",
            borderColor: "#ef4444",
            background: "rgba(239, 68, 68, 0.15)",
            color: "#fca5a5",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          🔑 Juontajan avain puuttuu. Avaa palvelimen käynnistyksessä tulostama
          osoite <code>/deck?key=...</code>, niin ohjaus toimii taas.
        </div>
      )}

      {/* Presenter toolbar: row 1 is what the game *is*, row 2 is what the host
          can *do* to it. Both wrap, so the controls never run off the screen. */}
      <header className="deck-header">
        <div className="deck-header-row">
          <h1
            style={{
              fontSize: "1.25rem",
              background:
                "linear-gradient(90deg, var(--primary-accent), var(--secondary-accent))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            SLACK BACKLOG QUIZ
          </h1>

          <span className="badge-category">
            Dia {room.currentSlideIndex + 1} / {room.slides.length}
          </span>

          {/* The phase used to be a badge next to a gold button labelled with
              the *other* phase, which read as a state label. One segmented
              control now shows and sets it. */}
          <div className="segmented" role="group" aria-label="Pelin vaihe">
            <button
              type="button"
              onClick={() => !isAnsweringPhase && handleAction("end_review")}
              aria-pressed={isAnsweringPhase}
              title="Pelaajat vastaavat kysymyksiin"
            >
              <Pencil size={14} /> Vastausvaihe
            </button>
            <button
              type="button"
              onClick={() => !isReviewPhase && handleAction("start_review")}
              aria-pressed={isReviewPhase}
              data-tone="gold"
              title="Käydään vastaukset läpi ja jaetaan pisteet"
            >
              <PlayCircle size={14} /> Tarkistusvaihe
            </button>
          </div>

          {room.isOfflineMode && (
            <span
              className="badge-category"
              style={{
                background: "rgba(245, 158, 11, 0.25)",
                borderColor: "var(--neon-gold)",
                color: "var(--neon-gold)",
              }}
            >
              📄 Paperivisa
            </span>
          )}

          {room.isQuestionLocked &&
            isQuestionType &&
            isAnsweringPhase &&
            !room.isOfflineMode && (
              <span
                className="badge-category"
                style={{
                  background: "rgba(239, 68, 68, 0.3)",
                  borderColor: "#ef4444",
                  color: "#fca5a5",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <Lock size={14} /> Suljettu
              </span>
            )}

          <div
            className="deck-header-spacer"
            style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}
          >
            {isQuestionType && isAnsweringPhase && !room.isOfflineMode && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                <CheckCircle2
                  size={20}
                  style={{
                    color:
                      answeredCount === totalPlayers && totalPlayers > 0
                        ? "var(--neon-green)"
                        : "var(--neon-gold)",
                  }}
                />
                <span>
                  Vastauksia{" "}
                  <strong style={{ color: "var(--neon-cyan)" }}>
                    {answeredCount}
                  </strong>{" "}
                  / {totalPlayers}
                </span>
              </div>
            )}

            {!room.isOfflineMode && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                <Users size={20} style={{ color: "var(--neon-cyan)" }} />
                <span>Pelaajia {totalPlayers}</span>
              </div>
            )}
          </div>
        </div>

        <div className="deck-header-row">
          <button
            onClick={() => handleAction("toggle_offline")}
            className="btn-secondary btn-compact"
            aria-pressed={Boolean(room.isOfflineMode)}
            style={{
              borderColor: room.isOfflineMode ? "var(--neon-gold)" : undefined,
              background: room.isOfflineMode
                ? "rgba(245, 158, 11, 0.25)"
                : undefined,
              color: room.isOfflineMode ? "var(--neon-gold)" : undefined,
            }}
            title="Kytke paperivisa eli offline-tila päälle tai pois"
          >
            <FileText size={16} /> Paperimoodi
          </button>

          <Link
            href="/summary"
            target="_blank"
            className="btn-secondary btn-compact"
            style={{
              borderColor:
                answeredCount === totalPlayers && totalPlayers > 0
                  ? "var(--neon-green)"
                  : undefined,
              color:
                answeredCount === totalPlayers && totalPlayers > 0
                  ? "var(--neon-green)"
                  : undefined,
            }}
            title="Avaa kaikkien vastausten yhteenveto ja manuaalitarkistus"
          >
            <ShieldCheck size={16} /> Yhteenveto
            {answeredCount === totalPlayers && totalPlayers > 0
              ? " (kaikki vastanneet)"
              : ""}
          </Link>

          <div
            className="deck-header-spacer"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <button
              onClick={() => handleAction("prev")}
              className="btn-secondary btn-compact"
              title="Edellinen dia (vasen nuoli)"
              aria-label="Edellinen dia"
            >
              <ChevronLeft size={20} />
            </button>

            {isAnsweringPhase && isQuestionType && (
              <button
                onClick={() => handleAction("toggle_lock")}
                className="btn-secondary btn-compact"
                aria-pressed={Boolean(room.isQuestionLocked)}
                style={{
                  borderColor: room.isQuestionLocked ? "#ef4444" : undefined,
                  background: room.isQuestionLocked
                    ? "rgba(239, 68, 68, 0.2)"
                    : undefined,
                  color: room.isQuestionLocked ? "#fca5a5" : undefined,
                }}
                title="Lukitse tai avaa kysymys (L / S)"
              >
                {room.isQuestionLocked ? (
                  <>
                    <Unlock size={16} /> Avaa
                  </>
                ) : (
                  <>
                    <Lock size={16} /> Lukitse
                  </>
                )}
              </button>
            )}

            {/* One forward control, labelled with whatever the right arrow
                will do next — so the host can read the screen instead of
                remembering which key reveals and which advances. */}
            <button
              onClick={() => handleAction(nextStep)}
              className={
                nextStep === "reveal"
                  ? "btn-primary btn-compact"
                  : "btn-secondary btn-compact"
              }
              title={
                nextStep === "reveal"
                  ? "Paljasta vastaus (oikea nuoli, väli, R tai Enter)"
                  : "Seuraava dia (oikea nuoli tai väli)"
              }
              aria-label={
                nextStep === "reveal" ? "Paljasta vastaus" : "Seuraava dia"
              }
            >
              {nextStep === "reveal" ? (
                <>
                  <Eye size={18} /> Paljasta vastaus
                </>
              ) : (
                <ChevronRight size={20} />
              )}
            </button>

            {/* These two were adjacent icon-only buttons wearing near-identical
                circular arrows, told apart only by a tooltip nobody reads
                mid-quiz. One is harmless and one deletes the evening, so they
                now carry their names, sit apart, and only the destructive one
                is red — and it asks first. */}
            <button
              onClick={() => handleAction("reload_deck")}
              className="btn-secondary btn-compact"
              title="Hakee kysymykset uudelleen tiedostosta. Pelaajat, pisteet ja vedot säilyvät."
            >
              <RefreshCw size={16} /> Lataa pakka
            </button>

            <button
              onClick={confirmReset}
              className="btn-secondary btn-compact"
              title="Poistaa pelaajat, pisteet ja vedot. Tätä ei voi perua."
              style={{
                marginLeft: "0.75rem",
                borderColor: "#ef4444",
                color: "#fca5a5",
              }}
            >
              <RotateCcw size={16} /> Nollaa peli
            </button>
          </div>
        </div>
      </header>

      {/* Main Slide Presentation Area */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 0",
        }}
      >
        {/* Deliberately NOT mode="wait". That mode holds the incoming slide
            until the outgoing one finishes exiting, and if the exit never
            finishes the deck is stuck showing the previous slide while the
            header already reads the new one. Chrome freezes requestAnimationFrame
            in an occluded tab, which stalls the exit indefinitely — so a host
            whose deck window gets covered would advance the slide and see
            nothing change. Overlapping the crossfade is a far cheaper failure. */}
        <AnimatePresence>
          <motion.div
            key={currentSlide?.id || 0}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, position: "absolute" }}
            transition={{ duration: 0.3 }}
            style={{ width: "100%", maxWidth: "1100px" }}
          >
            {/* WIFI SLIDE — scanned before anyone can reach /play at all */}
            {currentSlide?.type === "wifi" && currentSlide.ssid && (
              <div
                className="glass-panel"
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "2rem",
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: "3rem",
                      fontWeight: 900,
                      marginBottom: "0.5rem",
                    }}
                  >
                    {currentSlide.title ?? "Liity ensin wifiin"}
                  </h2>
                  <p style={{ fontSize: "1.25rem", color: "var(--text-muted)" }}>
                    {currentSlide.subtitle ??
                      "Skannaa koodi puhelimen kameralla — se liittää verkkoon ilman salasanan naputtelua."}
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "3rem",
                    background: "rgba(0, 0, 0, 0.4)",
                    padding: "2rem",
                    borderRadius: "24px",
                    border: "1px solid var(--border-glass)",
                  }}
                >
                  <div
                    style={{
                      background: "#ffffff",
                      padding: "1rem",
                      borderRadius: "16px",
                    }}
                  >
                    <QRCodeSVG
                      value={wifiQrPayload({
                        ssid: currentSlide.ssid,
                        password: currentSlide.password ?? "",
                      })}
                      size={220}
                    />
                  </div>

                  {/* The password in full too: a laptop and an older phone
                      can't scan this, and someone always has one. */}
                  <div style={{ textAlign: "left" }}>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      Verkko
                    </div>
                    <div
                      style={{
                        fontSize: "2.4rem",
                        fontWeight: 800,
                        color: "var(--neon-cyan)",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                        margin: "0.2rem 0 1.25rem 0",
                      }}
                    >
                      {currentSlide.ssid}
                    </div>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      Salasana
                    </div>
                    <div
                      style={{
                        fontSize: "2.4rem",
                        fontWeight: 800,
                        color: "var(--neon-gold)",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                        margin: "0.2rem 0 0 0",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {currentSlide.password}
                    </div>
                  </div>
                </div>

                <p style={{ color: "var(--text-muted)", fontSize: "1.05rem" }}>
                  Kun verkko on kiinni, seuraavalla dialla on koodi jolla
                  liityt itse visaan.
                </p>
              </div>
            )}

            {/* LOBBY SLIDE */}
            {currentSlide?.type === "lobby" && (
              <div
                className="glass-panel"
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "2rem",
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: "3rem",
                      fontWeight: 900,
                      marginBottom: "0.5rem",
                    }}
                  >
                    {currentSlide.title}
                  </h2>
                  <p
                    style={{
                      fontSize: "1.25rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {currentSlide.subtitle}
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "3rem",
                    background: "rgba(0, 0, 0, 0.4)",
                    padding: "2rem",
                    borderRadius: "24px",
                    border: "1px solid var(--border-glass)",
                  }}
                >
                  {joinUrl && (
                    <div
                      style={{
                        background: "#ffffff",
                        padding: "1rem",
                        borderRadius: "16px",
                      }}
                    >
                      <QRCodeSVG value={joinUrl} size={180} />
                    </div>
                  )}
                  <div style={{ textAlign: "left" }}>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      Liity osoitteessa
                    </div>
                    <div
                      style={{
                        fontSize: "2rem",
                        fontWeight: 800,
                        color: "var(--neon-cyan)",
                        margin: "0.2rem 0 1rem 0",
                      }}
                    >
                      {joinUrl.replace(/^https?:\/\//, "")}
                    </div>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      Huoneen koodi
                    </div>
                    <div
                      style={{
                        fontSize: "2.5rem",
                        fontWeight: 900,
                        letterSpacing: "0.1em",
                        color: "var(--neon-gold)",
                      }}
                    >
                      {room.code}
                    </div>
                  </div>
                </div>

                <div style={{ width: "100%", marginTop: "1rem" }}>
                  <h3
                    style={{
                      marginBottom: "1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <Users size={20} /> Aula ({totalPlayers} liittynyt):
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      justifyContent: "center",
                    }}
                  >
                    {playersList.map((p) => (
                      <span
                        key={p.id}
                        className="badge-category"
                        style={{
                          fontSize: "1.1rem",
                          padding: "0.6rem 1.25rem",
                        }}
                      >
                        {p.name}
                      </span>
                    ))}
                    {totalPlayers === 0 && (
                      <span style={{ color: "var(--text-muted)" }}>
                        Odotetaan pelaajia... Skannaa QR-koodi puhelimella!
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PREDICTION MARKET (POLYMARKET / KALSHI) SLIDE */}
            {currentSlide?.type === "prediction_market" && (
              <div className="glass-panel" style={{ padding: "3rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    className="badge-category"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(16, 185, 129, 0.3), rgba(6, 182, 212, 0.3))",
                      borderColor: "var(--neon-green)",
                      color: "var(--neon-green)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <TrendingUp size={16} /> MÖRTTI-MARKET (Ennustusmarkkina)
                  </span>
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      color: "var(--neon-gold)",
                    }}
                  >
                    {isAnsweringPhase
                      ? `Panoksia: ${answeredCount} / ${totalPlayers}`
                      : room.isAnswerRevealed
                      ? "✓ Markkina ratkaistu"
                      : "Paina 'Paljasta vastaus'"}
                  </div>
                </div>

                <h2
                  style={{
                    fontSize: "2.5rem",
                    margin: "1.5rem 0 2rem 0",
                    lineHeight: 1.25,
                    fontWeight: 900,
                  }}
                >
                  <EmojiText text={currentSlide.question} />
                </h2>

                <QuizImage src={currentSlide.imageUrl} variant="stage" />

                {/* POLYMARKET LIVE ODDS BAR & CARDS */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                    marginBottom: "2rem",
                  }}
                >
                  {/* Odds Bar */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "0.5rem",
                        fontWeight: 800,
                        fontSize: "1.25rem",
                      }}
                    >
                      <span style={{ color: "var(--neon-green)" }}>
                        KYLLÄ (YES) — {yesPct}% [ ¢{yesPct} ]
                      </span>
                      <span style={{ color: "var(--secondary-accent)" }}>
                        EI (NO) — {noPct}% [ ¢{noPct} ]
                      </span>
                    </div>

                    <div
                      style={{
                        height: "24px",
                        width: "100%",
                        borderRadius: "12px",
                        background: "rgba(255, 255, 255, 0.08)",
                        overflow: "hidden",
                        display: "flex",
                        border: "1px solid var(--border-glass)",
                      }}
                    >
                      <div
                        style={{
                          width: `${yesPct}%`,
                          background:
                            "linear-gradient(90deg, #10b981, #059669)",
                          transition: "width 0.5s ease",
                        }}
                      />
                      <div
                        style={{
                          width: `${noPct}%`,
                          background:
                            "linear-gradient(90deg, #ec4899, #be185d)",
                          transition: "width 0.5s ease",
                        }}
                      />
                    </div>
                  </div>

                  {/* Market Cards */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "1.5rem",
                    }}
                  >
                    <div
                      className={
                        isReviewPhase &&
                        room.isAnswerRevealed &&
                        currentSlide.resolvedOutcome === 0
                          ? "option-card correct"
                          : "glass-panel"
                      }
                      style={{
                        padding: "1.75rem",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "2rem",
                          fontWeight: 900,
                          color: "var(--neon-green)",
                        }}
                      >
                        KYLLÄ (YES)
                      </div>
                      <div
                        style={{ fontSize: "1.5rem", fontWeight: 800 }}
                      >
                        Todennäköisyys: {yesPct}%
                      </div>
                      <div
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Asetetut panokset: {yesBets} kpl
                      </div>
                    </div>

                    <div
                      className={
                        isReviewPhase &&
                        room.isAnswerRevealed &&
                        currentSlide.resolvedOutcome === 1
                          ? "option-card correct"
                          : "glass-panel"
                      }
                      style={{
                        padding: "1.75rem",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "2rem",
                          fontWeight: 900,
                          color: "var(--secondary-accent)",
                        }}
                      >
                        EI (NO)
                      </div>
                      <div
                        style={{ fontSize: "1.5rem", fontWeight: 800 }}
                      >
                        Todennäköisyys: {noPct}%
                      </div>
                      <div
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Asetetut panokset: {noBets} kpl
                      </div>
                    </div>
                  </div>
                </div>

                {isReviewPhase &&
                  room.isAnswerRevealed &&
                  currentSlide.explanation && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      style={{
                        padding: "1.25rem 1.5rem",
                        borderRadius: "14px",
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid var(--neon-green)",
                        color: "#ffffff",
                      }}
                    >
                      <strong>Markkinan ratkaisu:</strong>{" "}
                      {currentSlide.explanation}
                    </motion.div>
                  )}
              </div>
            )}

            {/* MULTIPLE CHOICE SLIDE */}
            {currentSlide?.type === "multiple_choice" && (
              <div className="glass-panel" style={{ padding: "3rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="badge-category">
                    {currentSlide.category}
                  </span>
                  {isAnsweringPhase && !room.isOfflineMode && (
                    <div
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        color: "var(--neon-cyan)",
                      }}
                    >
                      Vastannut: {answeredCount} / {totalPlayers}
                    </div>
                  )}
                  {isReviewPhase && (
                    <div
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        color: "var(--neon-gold)",
                      }}
                    >
                      {room.isAnswerRevealed
                        ? "✓ Vastaus paljastettu"
                        : "Paina 'Paljasta vastaus'"}
                    </div>
                  )}
                </div>

                <h2
                  style={{
                    fontSize: "2.25rem",
                    margin: "1.5rem 0 2rem 0",
                    lineHeight: 1.3,
                  }}
                >
                  <EmojiText text={currentSlide.question} />
                </h2>

                <QuizImage src={currentSlide.imageUrl} variant="stage" />

                <div
                  className={`option-grid${
                    (currentSlide.options?.length ?? 0) > 12 ? " dense" : ""
                  }`}
                >
                  {currentSlide.options?.map((opt, idx) => {
                    const isCorrect = idx === currentSlide.correctAnswer;
                    const showResult = isReviewPhase && room.isAnswerRevealed;
                    let cardClass = "option-card";
                    if (showResult) {
                      cardClass += isCorrect ? " correct" : " wrong";
                    }

                    return (
                      <div key={idx} className={cardClass}>
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "10px",
                            background: "rgba(255, 255, 255, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                          }}
                        >
                          {String.fromCharCode(65 + idx)}
                        </div>
                        <span><EmojiText text={opt} /></span>
                      </div>
                    );
                  })}
                </div>

                {isReviewPhase &&
                  room.isAnswerRevealed &&
                  currentSlide.explanation && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      style={{
                        marginTop: "2rem",
                        padding: "1.25rem 1.5rem",
                        borderRadius: "14px",
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid var(--neon-green)",
                        color: "#ffffff",
                      }}
                    >
                      <strong>Selitys:</strong>{" "}
                      <EmojiText text={currentSlide.explanation} />
                    </motion.div>
                  )}

                {/* Where the quote came from — only once the answer is out,
                    because the conversation gives it away. */}
                {isReviewPhase &&
                  room.isAnswerRevealed &&
                  currentSlide.source && (
                    <SourceContext source={currentSlide.source} />
                  )}
              </div>
            )}

            {/* CONNECT PAIRS SLIDE */}
            {currentSlide?.type === "connect_pairs" && (
              <div className="glass-panel" style={{ padding: "3rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="badge-category">
                    {currentSlide.category}
                  </span>
                  {isAnsweringPhase && !room.isOfflineMode && (
                    <div
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        color: "var(--neon-cyan)",
                      }}
                    >
                      Vastannut: {answeredCount} / {totalPlayers}
                    </div>
                  )}
                </div>

                <h2 style={{ fontSize: "2rem", margin: "1.5rem 0 2rem 0" }}>
                  <EmojiText text={currentSlide.question} />
                </h2>

                <QuizImage src={currentSlide.imageUrl} variant="stage" maxHeight={300} />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "2rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                    }}
                  >
                    <h3
                      style={{
                        color: "var(--neon-cyan)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Kohde
                    </h3>
                    {currentSlide.pairs?.map((p, idx) => (
                      <div
                        key={idx}
                        className="glass-panel"
                        style={{
                          padding: "1.25rem",
                          fontWeight: 700,
                          fontSize: "1.1rem",
                        }}
                      >
                        <EmojiText text={p.left} />
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                    }}
                  >
                    <h3
                      style={{
                        color: "var(--secondary-accent)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Oikea paritus
                    </h3>
                    {currentSlide.pairs?.map((p, idx) => (
                      <div
                        key={idx}
                        className={
                          isReviewPhase && room.isAnswerRevealed
                            ? "option-card correct"
                            : "glass-panel"
                        }
                        style={{
                          padding: "1.25rem",
                          fontWeight: 700,
                          fontSize: "1.1rem",
                        }}
                      >
                        {isReviewPhase && room.isAnswerRevealed
                          ? <EmojiText text={p.right} />
                          : room.isOfflineMode
                          ? "📝 Yhdistä parit paperilla"
                          : "??? (Vastaa puhelimella)"}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SLIDER NUMERIC ESTIMATION SLIDE */}
            {currentSlide?.type === "slider" && (
              <div className="glass-panel" style={{ padding: "3rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="badge-category">
                    {currentSlide.category}
                  </span>
                  {isAnsweringPhase && !room.isOfflineMode && (
                    <div
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        color: "var(--neon-cyan)",
                      }}
                    >
                      Vastannut: {answeredCount} / {totalPlayers}
                    </div>
                  )}
                </div>

                <h2 style={{ fontSize: "2.25rem", margin: "1.5rem 0 2rem 0" }}>
                  <EmojiText text={currentSlide.question} />
                </h2>

                <QuizImage src={currentSlide.imageUrl} variant="stage" maxHeight={300} />

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2rem",
                    marginTop: "1.5rem",
                  }}
                >
                  {isReviewPhase && room.isAnswerRevealed ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "2rem",
                        background: "rgba(16, 185, 129, 0.15)",
                        borderRadius: "20px",
                        border: "2px solid var(--neon-green)",
                        width: "100%",
                      }}
                    >
                      <div style={{ fontSize: "1.2rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                        Oikea tulos:
                      </div>
                      <div style={{ fontSize: "3.5rem", fontWeight: 900, color: "var(--neon-green)" }}>
                        {(currentSlide.correctValue ?? 0).toLocaleString("fi-FI")}{" "}
                        <span style={{ fontSize: "1.8rem" }}>{currentSlide.unit || ""}</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "2rem",
                        background: "rgba(6, 182, 212, 0.1)",
                        borderRadius: "20px",
                        border: "1px dashed var(--neon-cyan)",
                        width: "100%",
                      }}
                    >
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--neon-cyan)" }}>
                        {isAnsweringPhase
                          ? room.isOfflineMode
                            ? "📝 Arvioi luku ja kirjoita se paperille!"
                            : "Arvioi luku liukusäätimellä puhelimella!"
                          : "Odotetaan tulosten paljastusta..."}
                      </div>
                    </div>
                  )}

                  {isReviewPhase && (
                    <div style={{ width: "100%", marginTop: "1rem" }}>
                      <h4 style={{ fontSize: "1.2rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                        Pelaajien arvaukset:
                      </h4>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                        {playersList.map((p) => {
                          const ans = p.answers[currentSlide.id];
                          if (ans === undefined || ans === null) return null;
                          const numAns = Number(ans);
                          const diff = Math.abs(numAns - (currentSlide.correctValue ?? 0));

                          return (
                            <div
                              key={p.id}
                              className="glass-panel"
                              style={{
                                padding: "1rem",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                border: diff === 0 ? "2px solid var(--neon-green)" : "1px solid var(--border-glass)",
                              }}
                            >
                              <span style={{ fontWeight: 700 }}>{p.name}</span>
                              <span style={{ fontWeight: 800, color: "var(--neon-cyan)" }}>
                                {numAns.toLocaleString("fi-FI")} {currentSlide.unit || ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* OPEN ENDED SLIDE */}
            {currentSlide?.type === "open_ended" && (
              <div className="glass-panel" style={{ padding: "3rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="badge-category">
                    {currentSlide.category}
                  </span>
                  {isAnsweringPhase && !room.isOfflineMode && (
                    <div
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        color: "var(--neon-cyan)",
                      }}
                    >
                      Vastannut: {answeredCount} / {totalPlayers}
                    </div>
                  )}
                </div>

                <h2 style={{ fontSize: "2.25rem", margin: "1.5rem 0 2rem 0" }}>
                  <EmojiText text={currentSlide.question} />

                {/* The four pictures are the question; their names are the
                    answer and never reach a player's phone. */}
                {currentSlide.emojiQuiz && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: "2.5rem",
                      margin: "2rem 0 0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {currentSlide.emojiQuiz.map((name, i) => (
                      <div
                        key={name}
                        style={{ textAlign: "center", display: "grid", gap: "0.5rem" }}
                      >
                        <Emoji name={name} size="clamp(70px, 9vw, 120px)" />
                        <span
                          style={{
                            fontFamily: "ui-monospace, Menlo, monospace",
                            fontSize: "1.1rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {i + 1}.
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                </h2>

                <QuizImage src={currentSlide.imageUrl} variant="stage" />

                {isReviewPhase && room.isAnswerRevealed && (
                  <div style={{ marginTop: "1.5rem" }}>
                    <h3
                      style={{
                        color: "var(--neon-gold)",
                        marginBottom: "1rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <Sparkles /> Oikea vastaus / Vastaukset:
                    </h3>
                    <div
                      className="glass-panel"
                      style={{
                        padding: "1.5rem",
                        fontSize: "1.5rem",
                        fontWeight: 800,
                        color: "var(--neon-green)",
                        textAlign: "center",
                        border: "2px solid var(--neon-green)",
                      }}
                    >
                      {currentSlide.correctAnswerText ||
                        "Vastaukset tallennettu!"}
                    </div>

                    <div style={{ marginTop: "2rem" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "1rem",
                        }}
                      >
                        <h4
                          style={{
                            fontSize: "1.1rem",
                            color: "var(--text-muted)",
                            margin: 0,
                          }}
                        >
                          Pelaajien vastaukset & Pisteytys (Admin):
                        </h4>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, 1fr)",
                          gap: "1rem",
                        }}
                      >
                        {playersList.map((p) => {
                          const playerAns = p.answers[currentSlide.id];
                          if (!playerAns) return null;
                          const currentScore =
                            p.scoresPerSlide?.[currentSlide.id] ?? 0;
                          const maxPts = slideMaxPoints(currentSlide);

                          return (
                            <div
                              key={p.id}
                              className="glass-panel"
                              style={{
                                padding: "1.25rem",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.75rem",
                                border:
                                  currentScore > 0
                                    ? "2px solid var(--neon-green)"
                                    : "1px solid var(--border-glass)",
                                background:
                                  currentScore > 0
                                    ? "rgba(16, 185, 129, 0.15)"
                                    : "rgba(255, 255, 255, 0.05)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "1rem",
                                    color: "var(--neon-cyan)",
                                    fontWeight: 800,
                                  }}
                                >
                                  {p.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: "0.85rem",
                                    fontWeight: 800,
                                    padding: "0.2rem 0.6rem",
                                    borderRadius: "8px",
                                    background:
                                      currentScore > 0
                                        ? "rgba(16, 185, 129, 0.3)"
                                        : "rgba(255, 255, 255, 0.1)",
                                    color:
                                      currentScore > 0
                                        ? "var(--neon-green)"
                                        : "var(--text-muted)",
                                  }}
                                >
                                  {currentScore > 0
                                    ? `+${formatScore(currentScore)} p`
                                    : "0 p"}
                                </span>
                              </div>

                              <div
                                style={{
                                  fontSize: "1.2rem",
                                  fontWeight: 700,
                                  color: "#ffffff",
                                  lineHeight: 1.35,
                                }}
                              >
                                "{playerAns}"
                              </div>

                              {/* Admin scoring: whole points, 0..max. Open
                                  questions are judged here and nowhere else —
                                  nothing auto-scores them. */}
                              <div
                                style={{
                                  display: "flex",
                                  gap: "0.5rem",
                                  marginTop: "0.25rem",
                                }}
                              >
                                {scoreLadder(maxPts).map((pts) => {
                                  const chosen = currentScore === pts;
                                  const tone =
                                    pts === 0
                                      ? "var(--secondary-accent)"
                                      : pts === maxPts
                                      ? "var(--neon-green)"
                                      : "var(--neon-cyan)";
                                  return (
                                    <button
                                      key={pts}
                                      onClick={() =>
                                        handleScoreOpenEnded(p.id, pts)
                                      }
                                      aria-pressed={chosen}
                                      style={{
                                        flex: 1,
                                        padding: "0.5rem",
                                        borderRadius: "8px",
                                        background: chosen
                                          ? tone
                                          : "rgba(255, 255, 255, 0.05)",
                                        color: chosen ? "#0a0b10" : tone,
                                        border: `1px solid ${tone}`,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                        fontSize: "0.85rem",
                                      }}
                                    >
                                      {pts === 0
                                        ? "0 p ❌"
                                        : `${formatScore(pts)} p${
                                            pts === maxPts ? " ⭐" : ""
                                          }`}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* INTRO SLIDE — where the numbers come from, holes included */}
            {currentSlide?.type === "intro" && (
              <div
                className="glass-panel"
                style={{ padding: "2.5rem 3rem", width: "100%" }}
              >
                <h2 style={{ fontSize: "2.6rem", fontWeight: 900 }}>
                  {currentSlide.title}
                </h2>
                <p
                  style={{
                    fontSize: "1.2rem",
                    color: "var(--text-muted)",
                    marginTop: "0.6rem",
                    marginBottom: "2rem",
                  }}
                >
                  {currentSlide.subtitle}
                </p>

                <ul style={{ listStyle: "none", display: "grid", gap: "1.1rem" }}>
                  {(currentSlide.bullets ?? []).map((line, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.12 * i, duration: 0.35 }}
                      style={{
                        fontSize: "1.35rem",
                        lineHeight: 1.45,
                        paddingLeft: "1rem",
                        borderLeft: "3px solid var(--primary-accent)",
                      }}
                    >
                      {line}
                    </motion.li>
                  ))}
                </ul>

                {currentSlide.footnote && (
                  <p
                    style={{
                      marginTop: "2rem",
                      paddingTop: "1.25rem",
                      borderTop: "1px solid var(--border-glass)",
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    {currentSlide.footnote}
                  </p>
                )}
              </div>
            )}

            {/* STAT CHART SLIDE — the shape of ten years, between questions */}
            {currentSlide?.type === "stat_chart" && currentSlide.chartId && (
              <StatChartBoard chartId={currentSlide.chartId} />
            )}

            {/* QUOTE CARD — one message from the archive, read out loud */}
            {currentSlide?.type === "quote_card" && currentSlide.quoteId && (
              <QuoteCard quoteId={currentSlide.quoteId} />
            )}

            {/* BET MARKET SLIDE — the beat between two questions */}
            {currentSlide?.type === "bet_market" && (
              <BetMarketBoard room={room} />
            )}

            {/* SCOREBOARD SLIDE */}
            {currentSlide?.type === "scoreboard" && (
              <div
                className="glass-panel"
                style={{ padding: "3rem", textAlign: "center" }}
              >
                <Award
                  size={64}
                  style={{
                    color: "var(--neon-gold)",
                    margin: "0 auto 1rem auto",
                  }}
                />
                <h2 style={{ fontSize: "3rem", fontWeight: 900 }}>
                  {currentSlide.title}
                </h2>
                <p
                  style={{
                    fontSize: "1.25rem",
                    color: "var(--text-muted)",
                    marginBottom: "2rem",
                  }}
                >
                  {currentSlide.subtitle}
                </p>

                <div className="leaderboard-list">
                  {playersList.map((p, idx) => (
                    <div key={p.id} className="leaderboard-item">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "1rem",
                        }}
                      >
                        <span
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <span style={{ fontSize: "1.25rem" }}>{p.name}</span>
                      </div>
                      <span
                        style={{
                          fontSize: "1.35rem",
                          color: "var(--neon-gold)",
                        }}
                      >
                        {formatScore(p.score)} p
                      </span>
                    </div>
                  ))}
                  {playersList.length === 0 && (
                    <p style={{ color: "var(--text-muted)" }}>
                      Ei vielä pelaajia listalla.
                    </p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer Instructions */}
      <footer
        style={{
          borderTop: "1px solid var(--border-glass)",
          paddingTop: "1rem",
          display: "flex",
          justifyContent: "space-between",
          color: "var(--text-muted)",
          fontSize: "0.9rem",
        }}
      >
        <span>
          {isAnsweringPhase
            ? "📝 Vastausvaihe: vastaa kaikkiin kysymyksiin ja vetoihin! | Siirry dioissa nuolinäppäimillä."
            : "🎉 Tarkistusvaihe: oikea nuoli paljastaa vastauksen, seuraava painallus siirtää eteenpäin."}
        </span>
        <span>Slack Backlog Quiz</span>
      </footer>
    </div>
  );
}
