"use client";

import AnswerSavedNotice from "@/components/AnswerSavedNotice";
import BetMarketPicker from "@/components/BetMarketPicker";
import EmojiText from "@/components/EmojiText";
import { formatScore } from "@/lib/scoring";
import QuizImage from "@/components/QuizImage";
import { PREDEFINED_MEMBERS } from "@/lib/members";
import { RoomState, SlideData } from "@/lib/types";
import {
  CheckCircle2,
  Lock,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
  Trophy,
  User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export default function MobilePlayPage() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [customNameInput, setCustomNameInput] = useState("");
  const [savedPlayerName, setSavedPlayerName] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [pairSelections, setPairSelections] = useState<Record<string, string>>({});
  const [activeLeftPair, setActiveLeftPair] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Set when the server reports the nickname belongs to another device, so the
  // takeover has to be confirmed instead of silently inheriting their score.
  const [pendingTakeover, setPendingTakeover] = useState<string | null>(null);

  // Load existing playerId and name from localStorage if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedId = localStorage.getItem("backlog_player_id");
      const savedN = localStorage.getItem("backlog_player_name");
      if (savedId) setPlayerId(savedId);
      if (savedN) {
        setSavedPlayerName(savedN);
        setSelectedName(savedN);
      }
    }
  }, []);

  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch("/api/room");
      if (res.ok) {
        const data = await res.json();
        setRoom(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchRoom();
    const interval = setInterval(fetchRoom, 1000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  // Reset/load answer states ONLY when slide changes
  const currentSlideId = room?.slides[room?.currentSlideIndex ?? 0]?.id;
  const prevSlideIdRef = useRef<number | string | null>(null);

  useEffect(() => {
    const currentSlideId = room?.slides[room.currentSlideIndex]?.id;
    if (!currentSlideId || !playerId || !room) return;

    const isNewSlide = prevSlideIdRef.current !== currentSlideId;
    if (isNewSlide) {
      prevSlideIdRef.current = currentSlideId;
      setSelectedOption(null);
      setPairSelections({});
      setActiveLeftPair(null);
      setSubmitted(false);

      const player = room.players[playerId];
      const slide = room.slides[room.currentSlideIndex];
      if (player && slide && player.answers[slide.id] !== undefined) {
        const ans = player.answers[slide.id];
        if (
          slide.type === "multiple_choice" ||
          slide.type === "prediction_market"
        ) {
          const val =
            typeof ans === "object" && ans !== null && "outcome" in ans
              ? ans.outcome
              : ans;
          setSelectedOption(val);
        } else if (slide.type === "open_ended") {
          const val =
            typeof ans === "object" && ans !== null && "outcome" in ans
              ? ans.outcome
              : ans;
          setTextAnswer(val || "");
        } else if (slide.type === "connect_pairs") {
          const pairObj =
            typeof ans === "object" && ans !== null && !("outcome" in ans)
              ? ans
              : {};
          setPairSelections(pairObj);
        } else if (slide.type === "slider") {
          const minV = slide.min ?? 0;
          const maxV = slide.max ?? 100;
          const stepV = slide.step ?? 1;
          const stepsCount = Math.floor((maxV - minV) / stepV);
          const randomVal = minV + Math.floor(Math.random() * (stepsCount + 1)) * stepV;
          const numVal = ans !== undefined && ans !== null ? Number(ans) : randomVal;
          setSliderValue(isNaN(numVal) ? randomVal : numVal);
        }
        setSubmitted(true);
      } else {
        setTextAnswer("");
        if (slide && slide.type === "slider") {
          const minV = slide.min ?? 0;
          const maxV = slide.max ?? 100;
          const stepV = slide.step ?? 1;
          const stepsCount = Math.floor((maxV - minV) / stepV);
          const randomVal = minV + Math.floor(Math.random() * (stepsCount + 1)) * stepV;
          setSliderValue(randomVal);
        }
      }
    }
  }, [currentSlideId, playerId, room]);

  const attemptJoin = async (finalName: string, force: boolean) => {
    setJoinError(null);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: finalName,
          token: localStorage.getItem("backlog_player_token") || undefined,
          force,
        }),
      });

      if (res.status === 409) {
        setPendingTakeover(finalName);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setJoinError(err?.error || "Liittyminen epäonnistui. Yritä uudelleen.");
        return;
      }

      const data = await res.json();
      setPendingTakeover(null);
      setPlayerId(data.playerId);
      setSavedPlayerName(finalName);
      localStorage.setItem("backlog_player_id", data.playerId);
      localStorage.setItem("backlog_player_name", finalName);
      localStorage.setItem("backlog_player_token", data.token);
      setRoom(data.room);
    } catch (e) {
      console.error(e);
      setJoinError("Yhteysvirhe. Tarkista verkkoyhteys ja yritä uudelleen.");
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName =
      selectedName === "__custom__" ? customNameInput.trim() : selectedName;
    if (!finalName) return;
    await attemptJoin(finalName, false);
  };

  const submitCurrentAnswer = async (answerPayload: any) => {
    if (!playerId || !room) return;
    const currentSlide = room.slides[room.currentSlideIndex];
    if (!currentSlide) return;

    try {
      await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          slideId: currentSlide.id,
          answer: answerPayload,
        }),
      });
      setSubmitted(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectOption = (idx: number) => {
    if (room?.isQuestionLocked || room?.gamePhase === "review") return;
    setSelectedOption(idx);
    submitCurrentAnswer(idx);
  };

  const handleDirectPairMatch = (leftItem: string, rightItem: string) => {
    if (room?.isQuestionLocked || room?.gamePhase === "review") return;
    const next = { ...pairSelections, [leftItem]: rightItem };
    setPairSelections(next);
    submitCurrentAnswer(next);
  };

  const handleRemovePairMatch = (leftItem: string) => {
    if (room?.isQuestionLocked || room?.gamePhase === "review") return;
    const next = { ...pairSelections };
    delete next[leftItem];
    setPairSelections(next);
    submitCurrentAnswer(next);
  };

  const submitPairAnswers = () => {
    if (room?.isQuestionLocked || room?.gamePhase === "review") return;
    submitCurrentAnswer(pairSelections);
  };

  const submitSliderAnswer = (val: number) => {
    if (room?.isQuestionLocked || room?.gamePhase === "review") return;
    setSliderValue(val);
    submitCurrentAnswer(val);
  };

  const submitTextAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textAnswer.trim() || room?.isQuestionLocked || room?.gamePhase === "review") return;
    submitCurrentAnswer(textAnswer.trim());
  };

  if (!room) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h3>Ladataan pelitilaa...</h3>
      </div>
    );
  }

  const currentPlayer = playerId ? room.players[playerId] : null;

  // LOBBY JOIN FORM WITH RADIO BUTTON CARDS & RECONNECT
  if (!playerId || !currentPlayer) {
    const claimedMap: Record<string, string> = {};
    if (room?.players) {
      Object.values(room.players).forEach((p) => {
        claimedMap[p.name.toLowerCase()] = p.id;
      });
    }

    const effectiveName =
      selectedName === "__custom__" ? customNameInput.trim() : selectedName;

    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "1.5rem 1rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: "480px",
          margin: "0 auto",
        }}
      >
        <div
          className="glass-panel"
          style={{ padding: "1.75rem 1.25rem", textAlign: "center" }}
        >
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, var(--primary-accent), var(--secondary-accent))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem auto",
            }}
          >
            <User size={30} color="#ffffff" />
          </div>

          <h2 style={{ fontSize: "1.65rem", fontWeight: 900 }}>
            Valitse nimimerkkisi!
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.9rem",
              margin: "0.35rem 0 1.25rem 0",
            }}
          >
            Valitse oma nimesi listalta. Jokainen nimi voidaan varata vain kerran!
          </p>

          <form
            onSubmit={handleJoin}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {/* RADIO BUTTON CARDS */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                maxHeight: "360px",
                overflowY: "auto",
                paddingRight: "0.25rem",
                textAlign: "left",
              }}
            >
              {PREDEFINED_MEMBERS.map((mName) => {
                const claimedPlayerId = claimedMap[mName.toLowerCase()];
                const isClaimedByOther = Boolean(
                  claimedPlayerId && claimedPlayerId !== playerId
                );
                const isMySavedName = Boolean(
                  savedPlayerName &&
                    savedPlayerName.toLowerCase() === mName.toLowerCase()
                );
                const isSelected = selectedName === mName;
                const isDisabled = isClaimedByOther && !isMySavedName;

                let cardStyle: React.CSSProperties = {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.85rem 1rem",
                  borderRadius: "12px",
                  border: isSelected
                    ? "2px solid var(--neon-green)"
                    : "1px solid var(--border-glass)",
                  background: isSelected
                    ? "rgba(16, 185, 129, 0.2)"
                    : isDisabled
                    ? "rgba(255, 255, 255, 0.03)"
                    : "rgba(255, 255, 255, 0.07)",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  opacity: isDisabled ? 0.45 : 1,
                  transition: "all 0.2s ease",
                };

                return (
                  <label key={mName} style={cardStyle}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      <input
                        type="radio"
                        name="member_radio"
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => !isDisabled && setSelectedName(mName)}
                        style={{
                          accentColor: "var(--neon-green)",
                          width: "18px",
                          height: "18px",
                          cursor: isDisabled ? "not-allowed" : "pointer",
                        }}
                      />
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: "1rem",
                          color: isSelected ? "var(--neon-green)" : "#ffffff",
                        }}
                      >
                        {mName}
                      </span>
                    </div>

                    {/* STATUS BADGES */}
                    {isMySavedName && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "6px",
                          background: "rgba(16, 185, 129, 0.3)",
                          color: "var(--neon-green)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <RotateCcw size={12} /> Omasi / Yhdistä
                      </span>
                    )}
                    {isDisabled && !isMySavedName && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "6px",
                          background: "rgba(239, 68, 68, 0.25)",
                          color: "var(--secondary-accent)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <Lock size={12} /> Varattu
                      </span>
                    )}
                  </label>
                );
              })}

              {/* CUSTOM GUEST OPTION */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.85rem 1rem",
                  borderRadius: "12px",
                  border:
                    selectedName === "__custom__"
                      ? "2px solid var(--neon-cyan)"
                      : "1px solid var(--border-glass)",
                  background:
                    selectedName === "__custom__"
                      ? "rgba(6, 182, 212, 0.2)"
                      : "rgba(255, 255, 255, 0.07)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="member_radio"
                  checked={selectedName === "__custom__"}
                  onChange={() => setSelectedName("__custom__")}
                  style={{
                    accentColor: "var(--neon-cyan)",
                    width: "18px",
                    height: "18px",
                  }}
                />
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                  ✍️ Muu / Vieras nimimerkki
                </span>
              </label>
            </div>

            {selectedName === "__custom__" && (
              <input
                type="text"
                className="input-glass"
                placeholder="Kirjoita oma nimimerkkisi..."
                value={customNameInput}
                onChange={(e) => setCustomNameInput(e.target.value)}
                required
                autoFocus
              />
            )}

            {pendingTakeover && (
              <div
                style={{
                  padding: "1rem",
                  borderRadius: "12px",
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "1px solid var(--neon-gold)",
                  color: "var(--neon-gold)",
                  fontSize: "0.9rem",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                <strong>&quot;{pendingTakeover}&quot;</strong> on jo varattu
                toisella laitteella. Jos tämä olet sinä (esim. vaihdoit puhelinta
                tai tyhjensit selaimen), voit ottaa nimen takaisin — pisteesi
                säilyvät. Muussa tapauksessa valitse toinen nimi.
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => attemptJoin(pendingTakeover, true)}
                  style={{ marginTop: "0.75rem", width: "100%" }}
                >
                  Kyllä, tämä olen minä — jatka peliin
                </button>
              </div>
            )}

            {joinError && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid #ef4444",
                  color: "#fca5a5",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                }}
              >
                {joinError}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={!effectiveName}
              style={{
                marginTop: "0.5rem",
                opacity: !effectiveName ? 0.5 : 1,
              }}
            >
              <Sparkles size={18} />{" "}
              {savedPlayerName &&
              effectiveName &&
              savedPlayerName.toLowerCase() === effectiveName.toLowerCase()
                ? "Jatka peliin 🔄"
                : "Liity peliin 🚀"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const currentSlide: SlideData | undefined = room.slides[room.currentSlideIndex];

  // Editing the quiz mid-game can leave the index past the end of the deck.
  // Wait it out rather than crashing every phone in the room.
  if (!currentSlide) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <h3>Odota hetki, juontaja päivittää visaa...</h3>
      </div>
    );
  }

  const isLocked = room.isQuestionLocked;
  const isAnsweringPhase = room.gamePhase === "answering";
  const isReviewPhase = room.gamePhase === "review";
  const isRevealed = isReviewPhase && room.isAnswerRevealed;

  const savedPlayerAnswer = currentPlayer.answers[currentSlide.id];

  // Before the reveal the server sends a shuffled option list instead of the
  // real pairings, so the correct mapping never reaches the phone.
  const pairChoices =
    currentSlide.pairOptions ??
    currentSlide.pairs?.map((p) => p.right).filter(Boolean) ??
    [];

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "1.25rem",
        maxWidth: "480px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Top Header info on mobile */}
      <div
        className="glass-panel"
        style={{
          padding: "1rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Pelaaja
          </div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 800,
              color: "var(--neon-cyan)",
            }}
          >
            {currentPlayer.name}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Pisteet
          </div>
          <div
            style={{
              fontSize: "1.2rem",
              fontWeight: 900,
              color: "var(--neon-gold)",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            <Trophy size={16} /> {formatScore(currentPlayer.score)} p
          </div>
        </div>
      </div>

      {/* Main Mobile Content Area */}
      <main style={{ flex: 1, padding: "1.5rem 0" }}>
        {/* LOBBY WAITING SCREEN */}
        {currentSlide.type === "lobby" && (
          <div
            className="glass-panel"
            style={{ padding: "2rem", textAlign: "center" }}
          >
            <CheckCircle2
              size={48}
              style={{ color: "var(--neon-green)", margin: "0 auto 1rem auto" }}
            />
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800 }}>
              Olet liittynyt peliin!
            </h3>
            <p
              style={{
                color: "var(--text-muted)",
                marginTop: "0.5rem",
                fontSize: "0.95rem",
              }}
            >
              Odota, että juontaja aloittaa ensimmäisen kysymyksen valkokankaalta.
            </p>
          </div>
        )}

        {/* LOCKED BANNER IF NOT SUBMITTED IN ANSWERING PHASE */}
        {isAnsweringPhase && isLocked && !submitted && savedPlayerAnswer === undefined && currentSlide.type !== "lobby" && currentSlide.type !== "scoreboard" && (
          <div
            className="glass-panel"
            style={{
              padding: "1.5rem",
              textAlign: "center",
              borderColor: "#ef4444",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#fca5a5",
              marginBottom: "1rem",
            }}
          >
            <Lock size={32} style={{ margin: "0 auto 0.5rem auto" }} />
            <h4 style={{ fontSize: "1.2rem", fontWeight: 800 }}>
              Kysymys on suljettu!
            </h4>
            <p style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
              Aika loppui tältä kysymykseltä. Et ehtinyt lähettää vastausta.
            </p>
          </div>
        )}

        {/* REVIEW PHASE BANNER */}
        {isReviewPhase && !isRevealed && currentSlide.type !== "scoreboard" && (
          <div
            className="glass-panel"
            style={{
              padding: "1rem",
              textAlign: "center",
              background: "rgba(245, 158, 11, 0.15)",
              borderColor: "var(--neon-gold)",
              color: "var(--neon-gold)",
              marginBottom: "1rem",
              fontWeight: 700,
            }}
          >
            🎉 Tarkistusvaihe: Odota oikean vastauksen paljastusta...
          </div>
        )}

        {/* PREDICTION MARKET MOBILE BETTING CONTROLLER */}
        {currentSlide.type === "prediction_market" && (
          <div>
            <div style={{ marginBottom: "1rem", textAlign: "center" }}>
              <span
                className="badge-category"
                style={{
                  borderColor: "var(--neon-green)",
                  color: "var(--neon-green)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <TrendingUp size={14} /> MÖRTTI-MARKET
              </span>
              <h3
                style={{
                  fontSize: "1.2rem",
                  marginTop: "0.75rem",
                  lineHeight: 1.4,
                  fontWeight: 800,
                }}
              >
                <EmojiText text={currentSlide.question} />
              </h3>
              <QuizImage src={currentSlide.imageUrl} variant="mobile" />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                marginTop: "1.5rem",
              }}
            >
              {[0, 1].map((idx) => {
                const effectiveSelected = selectedOption !== null ? selectedOption : (typeof savedPlayerAnswer === "object" ? savedPlayerAnswer.outcome : savedPlayerAnswer);
                const isSelected = effectiveSelected === idx;
                const isCorrect = idx === currentSlide.resolvedOutcome;
                const isDisabled = isLocked || isReviewPhase;
                const label = idx === 0 ? "KYLLÄ (YES)" : "EI (NO)";
                const color = idx === 0 ? "var(--neon-green)" : "var(--secondary-accent)";

                let cardStyle: React.CSSProperties = {
                  padding: "1.75rem 1rem",
                  borderRadius: "16px",
                  background: isSelected ? (idx === 0 ? "rgba(16, 185, 129, 0.3)" : "rgba(236, 72, 153, 0.3)") : "rgba(255, 255, 255, 0.05)",
                  border: isSelected ? `2px solid ${color}` : "1px solid var(--border-glass)",
                  color: "#ffffff",
                  fontSize: "1.2rem",
                  fontWeight: 900,
                  cursor: isDisabled ? "default" : "pointer",
                  textAlign: "center",
                  opacity: isDisabled && !isSelected && !isCorrect ? 0.5 : 1,
                };

                if (isRevealed) {
                  if (isCorrect) {
                    cardStyle.border = "2px solid var(--neon-green)";
                    cardStyle.background = "rgba(16, 185, 129, 0.35)";
                  }
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectOption(idx)}
                    disabled={isDisabled}
                    style={cardStyle}
                  >
                    <div style={{ fontSize: "1.35rem", marginBottom: "0.25rem", color }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>
                      Panos 200 pt
                    </div>
                  </button>
                );
              })}
            </div>

            {isRevealed && currentSlide.explanation && (
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "1rem 1.25rem",
                  borderRadius: "14px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid var(--neon-green)",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  lineHeight: 1.4,
                }}
              >
                <strong>Markkinan ratkaisu:</strong> {currentSlide.explanation}
              </div>
            )}

            {(submitted || savedPlayerAnswer !== undefined) && !isRevealed && (
              <AnswerSavedNotice marginTop="1.25rem">
                ✓ Veto asetettu markkinalle! Voit muuttaa valintaasi ennen lukitusta.
              </AnswerSavedNotice>
            )}
          </div>
        )}

        {/* MULTIPLE CHOICE MOBILE CONTROLLER */}
        {currentSlide.type === "bet_market" && playerId && (
          <BetMarketPicker
            room={room}
            playerId={playerId}
            onPlaced={setRoom}
          />
        )}

        {currentSlide.type === "multiple_choice" && (
          <div>
            <div style={{ marginBottom: "1rem", textAlign: "center" }}>
              <span className="badge-category">{currentSlide.category}</span>
              <h3
                style={{
                  fontSize: "1.15rem",
                  marginTop: "0.75rem",
                  lineHeight: 1.4,
                }}
              >
                <EmojiText text={currentSlide.question} />
              </h3>
              <QuizImage src={currentSlide.imageUrl} variant="mobile" />
            </div>

            {/* One column reads best on a phone, but a question offering every
                channel or every member would then be a very long scroll. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  (currentSlide.options?.length ?? 0) > 12 ? "1fr 1fr" : "1fr",
                gap: (currentSlide.options?.length ?? 0) > 12 ? "0.5rem" : "0.85rem",
              }}
            >
              {currentSlide.options?.map((opt, idx) => {
                const effectiveSelected = selectedOption !== null ? selectedOption : savedPlayerAnswer;
                const isSelected = effectiveSelected === idx;
                const isCorrect = idx === currentSlide.correctAnswer;
                const isDisabled = isLocked || isReviewPhase;

                let cardClass = "option-card";
                if (isRevealed) {
                  cardClass += isCorrect ? " correct" : isSelected ? " wrong" : "";
                } else if (isSelected) {
                  cardClass += " selected";
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectOption(idx)}
                    disabled={isDisabled}
                    className={cardClass}
                    style={{
                      padding: "1rem 1.25rem",
                      fontSize: "1rem",
                      justifyContent: "flex-start",
                      textAlign: "left",
                      opacity: isDisabled && !isSelected && !isCorrect ? 0.5 : 1,
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: isRevealed && isCorrect
                          ? "var(--neon-green)"
                          : isSelected
                          ? "var(--neon-cyan)"
                          : "rgba(255, 255, 255, 0.1)",
                        color: isSelected || (isRevealed && isCorrect) ? "#000000" : "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <span><EmojiText text={opt} /></span>
                  </button>
                );
              })}
            </div>

            {isRevealed && currentSlide.explanation && (
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "1rem 1.25rem",
                  borderRadius: "14px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid var(--neon-green)",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  lineHeight: 1.4,
                }}
              >
                <strong>Selitys:</strong> {currentSlide.explanation}
              </div>
            )}

            {(submitted || savedPlayerAnswer !== undefined) && !isRevealed && (
              <AnswerSavedNotice>
                ✓ Vastaus tallennettu! Voit muuttaa valintaasi ennen lukitusta.
              </AnswerSavedNotice>
            )}
          </div>
        )}

        {/* CONNECT PAIRS MOBILE CONTROLLER */}
        {currentSlide.type === "connect_pairs" && (
          <div>
            <div style={{ marginBottom: "1rem", textAlign: "center" }}>
              <span className="badge-category">{currentSlide.category}</span>
              <h3 style={{ fontSize: "1.1rem", marginTop: "0.5rem" }}>
                <EmojiText text={currentSlide.question} />
              </h3>
              <QuizImage src={currentSlide.imageUrl} variant="mobile" maxHeight={200} />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              {isAnsweringPhase && (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                    fontWeight: 700,
                  }}
                >
                  1. Valitse vasen &rarr; 2. Valitse oikea pariksi
                </div>
              )}

              {currentSlide.pairs?.map((p, idx) => {
                const effectivePairs =
                  Object.keys(pairSelections).length > 0
                    ? pairSelections
                    : typeof savedPlayerAnswer === "object" &&
                      savedPlayerAnswer !== null &&
                      !("outcome" in savedPlayerAnswer)
                    ? savedPlayerAnswer
                    : {};
                const matchedRight = effectivePairs[p.left];
                const isPairCorrect = isRevealed && matchedRight === p.right;
                const isItemDisabled = isLocked || isReviewPhase;

                return (
                  <div
                    key={idx}
                    className="glass-panel"
                    style={{
                      padding: "1rem",
                      borderColor: isRevealed
                        ? isPairCorrect
                          ? "var(--neon-green)"
                          : "#ef4444"
                        : matchedRight
                        ? "var(--neon-cyan)"
                        : "var(--border-glass)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "1.05rem",
                        color: "var(--neon-cyan)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <EmojiText text={p.left} />
                    </div>

                    {isRevealed ? (
                      <div>
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: isPairCorrect ? "var(--neon-green)" : "#fca5a5",
                          }}
                        >
                          Valintasi:{" "}
                          {matchedRight ? (
                            <EmojiText text={matchedRight} />
                          ) : (
                            "(Ei vastattu)"
                          )}
                        </div>
                        <div
                          style={{
                            marginTop: "0.25rem",
                            fontSize: "0.95rem",
                            fontWeight: 800,
                            color: "var(--neon-green)",
                          }}
                        >
                          Oikea pari: <EmojiText text={p.right} />
                        </div>
                      </div>
                    ) : matchedRight ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: "rgba(6, 182, 212, 0.15)",
                          padding: "0.6rem 0.85rem",
                          borderRadius: "10px",
                          border: "1px solid var(--neon-cyan)",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            color: "#ffffff",
                            fontSize: "0.95rem",
                          }}
                        >
                          = <EmojiText text={matchedRight} />
                        </span>
                        {!isItemDisabled && (
                          <button
                            onClick={() => handleRemovePairMatch(p.left)}
                            className="btn-secondary"
                            style={{
                              padding: "0.25rem 0.5rem",
                              fontSize: "0.75rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <RotateCcw size={12} /> Muuta
                          </button>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-muted)",
                            marginBottom: "0.4rem",
                          }}
                        >
                          Valitse pari:
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.4rem",
                          }}
                        >
                          {pairChoices.map((choice, pIdx) => {
                            const isOptionChosenElsewhere =
                              Object.values(effectivePairs).includes(choice);
                            return (
                              <button
                                key={pIdx}
                                onClick={() => handleDirectPairMatch(p.left, choice)}
                                disabled={isItemDisabled}
                                className="btn-secondary"
                                style={{
                                  padding: "0.4rem 0.75rem",
                                  fontSize: "0.85rem",
                                  opacity: isOptionChosenElsewhere ? 0.4 : 1,
                                }}
                              >
                                <EmojiText text={choice} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {!submitted && !isLocked && isAnsweringPhase && (
                <button
                  onClick={submitPairAnswers}
                  className="btn-primary"
                  style={{ marginTop: "1rem" }}
                >
                  Tallenna paritukset
                </button>
              )}
              {(submitted || savedPlayerAnswer !== undefined) && !isRevealed && (
                <AnswerSavedNotice marginTop="0">
                  ✓ Paritukset tallennettu! Oikeat vastaukset paljastetaan lopussa.
                </AnswerSavedNotice>
              )}
            </div>
          </div>
        )}

        {/* OPEN ENDED MOBILE CONTROLLER */}
        {currentSlide.type === "open_ended" && (
          <div>
            <div style={{ marginBottom: "1rem", textAlign: "center" }}>
              <span className="badge-category">{currentSlide.category}</span>
              <h3
                style={{
                  fontSize: "1.15rem",
                  marginTop: "0.75rem",
                  lineHeight: 1.4,
                }}
              >
                <EmojiText text={currentSlide.question} />
              </h3>
              <QuizImage src={currentSlide.imageUrl} variant="mobile" />
            </div>

            <form
              onSubmit={submitTextAnswer}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <textarea
                className="input-glass"
                rows={4}
                placeholder="Kirjoita vastauksesi tähän..."
                value={textAnswer || savedPlayerAnswer || ""}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={submitted || isLocked || isReviewPhase}
                required
              />
              {!submitted && !isLocked && isAnsweringPhase && (
                <button type="submit" className="btn-primary">
                  <Send size={18} /> Lähetä vastaus
                </button>
              )}
            </form>

            {isRevealed && (
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "1rem 1.25rem",
                  borderRadius: "14px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid var(--neon-green)",
                  color: "var(--neon-green)",
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: "1.1rem",
                }}
              >
                Oikea vastaus: {currentSlide.correctAnswerText || "Vastaukset paljastettu!"}
              </div>
            )}

            {(submitted || savedPlayerAnswer !== undefined) && !isRevealed && (
              <AnswerSavedNotice>
                ✓ Vastaus tallennettu! Oikeat vastaukset paljastetaan lopussa.
              </AnswerSavedNotice>
            )}
          </div>
        )}

        {/* SLIDER NUMERIC ESTIMATION MOBILE CONTROLLER */}
        {currentSlide.type === "slider" && (
          <div>
            <div style={{ marginBottom: "1rem", textAlign: "center" }}>
              <span className="badge-category">{currentSlide.category}</span>
              <h3
                style={{
                  fontSize: "1.15rem",
                  marginTop: "0.75rem",
                  lineHeight: 1.4,
                }}
              >
                <EmojiText text={currentSlide.question} />
              </h3>
              <QuizImage src={currentSlide.imageUrl} variant="mobile" />
            </div>

            <div
              className="glass-panel"
              style={{
                padding: "1.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1.25rem",
              }}
            >
              <div
                style={{
                  fontSize: "2.25rem",
                  fontWeight: 900,
                  color: "var(--neon-cyan)",
                  textAlign: "center",
                }}
              >
                {(sliderValue ?? currentSlide.min ?? 0).toLocaleString("fi-FI")}{" "}
                <span style={{ fontSize: "1.1rem", color: "var(--text-muted)", fontWeight: 600 }}>
                  {currentSlide.unit || ""}
                </span>
              </div>

              <input
                type="range"
                min={currentSlide.min ?? 0}
                max={currentSlide.max ?? 100}
                step={currentSlide.step ?? 1}
                value={sliderValue ?? currentSlide.min ?? 0}
                onChange={(e) => setSliderValue(Number(e.target.value))}
                disabled={submitted || isLocked || isReviewPhase}
                style={{
                  width: "100%",
                  accentColor: "var(--neon-cyan)",
                  height: "12px",
                  cursor: "pointer",
                }}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                <span>{(currentSlide.min ?? 0).toLocaleString("fi-FI")}</span>
                <span>{(currentSlide.max ?? 100).toLocaleString("fi-FI")}</span>
              </div>

              {!submitted && !isLocked && isAnsweringPhase && (
                <button
                  onClick={() => submitSliderAnswer(sliderValue)}
                  className="btn-primary"
                  style={{ width: "100%", marginTop: "0.5rem" }}
                >
                  <Send size={18} /> Lukitse arvaus: {(sliderValue ?? 0).toLocaleString("fi-FI")} {currentSlide.unit || ""}
                </button>
              )}
            </div>

            {isRevealed && (
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "1rem 1.25rem",
                  borderRadius: "14px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid var(--neon-green)",
                  color: "var(--neon-green)",
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: "1.1rem",
                }}
              >
                Oikea luku: {(currentSlide.correctValue ?? 0).toLocaleString("fi-FI")}{" "}
                {currentSlide.unit || ""}
              </div>
            )}

            {(submitted || savedPlayerAnswer !== undefined) && !isRevealed && (
              <AnswerSavedNotice>
                ✓ Arvaus tallennettu! Oikea luku paljastetaan lopussa.
              </AnswerSavedNotice>
            )}
          </div>
        )}

        {/* SCOREBOARD MOBILE CONTROLLER */}
        {currentSlide.type === "scoreboard" && (
          <div
            className="glass-panel"
            style={{ padding: "2rem", textAlign: "center" }}
          >
            <Trophy
              size={56}
              style={{
                color: "var(--neon-gold)",
                margin: "0 auto 1rem auto",
              }}
            />
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Peli päättyi!</h3>
            <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
              Katso lopullinen voittajalista ja palkintogaala valkokankaalta!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
