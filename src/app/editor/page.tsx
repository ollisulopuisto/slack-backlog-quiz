"use client";

import { captureHostKeyFromUrl, hostFetch } from "@/lib/hostClient";
import { QuestionType, SlideData } from "@/lib/types";
import { auditDeck, FINDING_LABELS } from "@/lib/deckAudit";
import { mergeIntoDeck } from "@/lib/slideIds";
import DeckSelector from "@/components/DeckSelector";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Database,
  Edit3,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface BankQuestion extends SlideData {
  selected?: boolean;
}

/**
 * Slides the deck builder generates: market beats, stat charts, the data
 * intro. They carry no question, no answer and no points, and editing them
 * does nothing because withInterstitials() rebuilds them on every load. The
 * editor used to render them as blank multiple-choice questions worth 100
 * points, which invited the host to "fix" a slide that was never broken.
 */
const GENERATED_TYPES = new Set([
  "bet_market",
  "stat_chart",
  "quote_card",
  "intro",
]);

/** Mirrors DEFAULT_POINTS in src/lib/scoring.ts: 1 point = one right answer. */
const DEFAULT_POINTS: Record<string, number> = {
  multiple_choice: 1,
  connect_pairs: 1,
  slider: 1,
  open_ended: 3,
  prediction_market: 2,
};

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Monivalinta",
  connect_pairs: "Parita parit",
  open_ended: "Avoin kysymys",
  slider: "Lukuarvio",
  prediction_market: "Ennustusmarkkina",
  wifi: "Wifi-koodi",
  lobby: "Aula",
  scoreboard: "Tuloslista",
  intro: "Aineiston esittely",
  bet_market: "Vetomarkkina",
  stat_chart: "Tilastokuvaaja",
  quote_card: "Sitaattinosto",
};

function slideLabel(slide: SlideData): string {
  if (slide.title || slide.question) return slide.title || slide.question!;
  if (slide.type === "stat_chart") return "Tilastokuvaaja (generoitu)";
  if (slide.type === "quote_card") return "Sitaattinosto (generoitu)";
  if (slide.type === "bet_market") return "Vetomarkkina (generoitu)";
  return "Nimetön dia";
}

export default function QuizEditorPage() {
  const [activeTab, setActiveTab] = useState<"slides" | "bank">("slides");
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Load active slides and question bank
  useEffect(() => {
    captureHostKeyFromUrl();
    hostFetch("/api/questions")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSlides(data);
      })
      .catch(console.error);

    hostFetch("/api/bank")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setBank(data);
      })
      .catch(console.error);
  }, []);

  const activeSlide = slides[activeSlideIndex] || null;

  const handleUpdateActiveSlide = (updated: Partial<SlideData>) => {
    setSlides((prev) => {
      const copy = [...prev];
      if (copy[activeSlideIndex]) {
        copy[activeSlideIndex] = {
          ...copy[activeSlideIndex],
          ...updated,
        };
      }
      return copy;
    });
    setIsSaved(false);
  };

  const handleAddSlide = () => {
    const newSlide: SlideData = {
      id: Date.now(),
      type: "multiple_choice",
      category: "Uusi kysymys",
      question: "Kirjoita kysymys tähän...",
      options: ["Vaihtoehto A", "Vaihtoehto B", "Vaihtoehto C", "Vaihtoehto D"],
      correctAnswer: 0,
      explanation: "Selitys oikealle vastaukselle.",
      points: 1,
    };
    setSlides((prev) => [...prev, newSlide]);
    setActiveSlideIndex(slides.length);
    setIsSaved(false);
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) return;
    setSlides((prev) => prev.filter((_, i) => i !== index));
    if (activeSlideIndex >= slides.length - 1) {
      setActiveSlideIndex(Math.max(0, slides.length - 2));
    }
    setIsSaved(false);
  };

  const handleMoveSlide = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    setSlides((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
    setActiveSlideIndex(targetIndex);
    setIsSaved(false);
  };

  const handleToggleBankQuestion = (bankId: number | string) => {
    setBank((prev) =>
      prev.map((q) => (q.id === bankId ? { ...q, selected: !q.selected } : q))
    );
  };

  const questionSlides = (list: SlideData[]) =>
    list.filter(
      (s) =>
        s.type !== "wifi" &&
        s.type !== "lobby" &&
        s.type !== "intro" &&
        s.type !== "scoreboard"
    );

  /**
   * Puts the selected bank questions into the deck.
   *
   * `replace` rebuilds from scratch; the default appends, which is what the
   * host almost always wants. Rebuilding used to be the only behaviour, so one
   * click on the wrong button threw the whole deck away.
   */
  const handleAddFromBank = async (replace = false) => {
    const picked = bank.filter((q) => q.selected);
    if (picked.length === 0) return;
    if (
      replace &&
      !window.confirm(
        `Korvataanko koko pakka? Nykyiset ${questionSlides(slides).length} kysymystä poistetaan ja tilalle tulee ${picked.length}.`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      // The deck's own opening and closing slides survive either way.
      const opening = slides.filter(
        (s) => s.type === "wifi" || s.type === "lobby" || s.type === "intro"
      );
      const closing = slides.filter((s) => s.type === "scoreboard");
      const kept = replace ? [] : questionSlides(slides);

      // Ids are never renumbered: they key every stored answer and per-slide
      // score, so renumbering by position re-points a running game's answers
      // at the wrong questions. Adding a question mid-quiz is safe because of
      // this.
      const newDeckSlides: SlideData[] = [
        ...(opening.length
          ? opening
          : [
              {
                id: "lobby",
                type: "lobby" as const,
                title: "Slack Backlog Quiz",
                subtitle: "Liity peliin puhelimella syöttämällä nimimerkkisi!",
              },
            ]),
        ...mergeIntoDeck(kept, picked),
        ...(closing.length
          ? closing
          : [
              {
                id: "scoreboard",
                type: "scoreboard" as const,
                title: "Palkintogaala",
              },
            ]),
      ];

      await hostFetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDeckSlides),
      });

      // Picking a question moves it into the deck, so clear the selection.
      const cleared = bank.map((q) => ({ ...q, selected: false }));
      setBank(cleared);
      await hostFetch("/api/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleared),
      });

      setSlides(newDeckSlides);
      setActiveSlideIndex(0);
      setActiveTab("slides");
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSlides = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Slide ids must survive edits: they key every stored player answer and
      // per-slide score. Renumbering by position would silently re-point the
      // answers of a game in progress at the wrong questions.
      const usedIds = new Set<number | string>();
      const savedSlides = slides.map((s) => {
        const hasUsableId =
          s.id !== undefined && s.id !== null && !usedIds.has(s.id);
        const id = hasUsableId ? s.id : Date.now() + Math.floor(Math.random() * 1000);
        usedIds.add(id);
        return { ...s, id };
      });

      const res = await hostFetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savedSlides),
      });

      if (res.ok) {
        setSlides(savedSlides);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
      } else {
        const err = await res.json().catch(() => null);
        setSaveError(err?.error || "Diojen tallennus epäonnistui!");
      }
    } catch (e) {
      console.error(e);
      setSaveError("Diojen tallennus epäonnistui!");
    } finally {
      setSaving(false);
    }
  };

  const selectedBankCount = bank.filter((q) => q.selected).length;

  // Recomputed on every edit: a deck is usually broken by the question you
  // just added, so the warning should appear the moment you add it.
  const findings = auditDeck(slides);
  const flaggedIds = new Set(findings.flatMap((f) => f.slideIds.map(String)));

  const filteredBank = bank.filter((q) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      q.question?.toLowerCase().includes(term) ||
      q.category?.toLowerCase().includes(term) ||
      q.explanation?.toLowerCase().includes(term)
    );
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem 2rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border-glass)",
          paddingBottom: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              background:
                "linear-gradient(90deg, var(--neon-cyan), var(--primary-glow))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Visaeditori ja kysymyspankki ✏️
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Poimi pankista parhaat tai muokkaa esityksen dioja.
            Pisteasteikko: 1 p = yksi oikea vastaus.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {isSaved && (
            <span
              style={{
                color: "var(--neon-green)",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              <CheckCircle2 size={18} /> Tallennus onnistui!
            </span>
          )}
          {saveError && (
            <span
              style={{
                color: "var(--secondary-accent)",
                fontWeight: 700,
                maxWidth: "320px",
              }}
            >
              ⚠️ {saveError}
            </span>
          )}
          <DeckSelector
            onSwitched={() => {
              // The deck changed under us: reload so the slide list is the new
              // deck's, not the previous one's.
              window.location.reload();
            }}
          />
          <Link href="/deck" className="btn-secondary">
            Avaa valkokangas (/deck)
          </Link>
          {activeTab === "slides" ? (
            <button
              onClick={handleSaveSlides}
              disabled={saving}
              className="btn-primary"
            >
              <Save size={18} /> {saving ? "Tallennetaan..." : "Tallenna diat"}
            </button>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => handleAddFromBank(false)}
                disabled={saving || selectedBankCount === 0}
                className="btn-primary"
                style={{
                  background:
                    "linear-gradient(135deg, var(--neon-green), #059669)",
                  opacity: selectedBankCount === 0 ? 0.5 : 1,
                }}
                title="Lisää valitut kysymykset nykyisen pakan loppuun"
              >
                <Plus size={18} />{" "}
                {saving
                  ? "Lisätään..."
                  : `Lisää pakkaan (${selectedBankCount})`}
              </button>
              <button
                onClick={() => handleAddFromBank(true)}
                disabled={saving || selectedBankCount === 0}
                className="btn-secondary"
                style={{ opacity: selectedBankCount === 0 ? 0.5 : 1 }}
                title="Korvaa pakan kaikki kysymykset valituilla — kysyy varmistuksen"
              >
                <Sparkles size={16} /> Korvaa koko pakka
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setActiveTab("slides")}
          className={activeTab === "slides" ? "btn-primary" : "btn-secondary"}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <Edit3 size={18} /> Esityksen diat ({slides.length})
        </button>
        <button
          onClick={() => setActiveTab("bank")}
          className={activeTab === "bank" ? "btn-primary" : "btn-secondary"}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <Database size={18} /> Kysymyspankki ({selectedBankCount} / {bank.length} valittu)
        </button>
      </div>

      {/* TAB 1: SLIDES EDITOR */}
      {activeTab === "slides" && findings.length > 0 && (
        <div
          className="glass-panel"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1.25rem",
            borderColor: "var(--neon-gold)",
            background: "rgba(245, 158, 11, 0.1)",
          }}
        >
          <div
            style={{
              fontWeight: 800,
              color: "var(--neon-gold)",
              marginBottom: "0.6rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <AlertTriangle size={18} /> {findings.length} huomiota pakassa
          </div>
          <ul style={{ listStyle: "none", display: "grid", gap: "0.45rem" }}>
            {findings.map((f, i) => (
              <li
                key={i}
                style={{
                  fontSize: "0.92rem",
                  color: "var(--text-main)",
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <strong
                  style={{
                    color:
                      f.kind === "spoiler" ? "#fca5a5" : "var(--neon-gold)",
                  }}
                >
                  {FINDING_LABELS[f.kind]}:
                </strong>
                <span style={{ color: "var(--text-muted)" }}>{f.detail}</span>
                {f.slideIds.map((id) => {
                  const at = slides.findIndex((s) => String(s.id) === String(id));
                  if (at < 0) return null;
                  return (
                    <button
                      key={String(id)}
                      onClick={() => setActiveSlideIndex(at)}
                      className="btn-secondary btn-compact"
                      style={{ fontSize: "0.78rem", padding: "0.1rem 0.5rem" }}
                    >
                      dia {at + 1}
                    </button>
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === "slides" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "320px 1fr",
            gap: "1.5rem",
            flex: 1,
          }}
        >
          {/* Sidebar Slide List */}
          <div
            className="glass-panel"
            style={{
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              maxHeight: "calc(100vh - 200px)",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <h3 style={{ fontSize: "1.1rem" }}>Diat ({slides.length})</h3>
              <button
                onClick={handleAddSlide}
                className="btn-secondary"
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
              >
                <Plus size={14} /> Kysymys
              </button>
            </div>

            {slides.map((s, idx) => {
              const isActive = idx === activeSlideIndex;
              return (
                <div
                  key={s.id || idx}
                  onClick={() => setActiveSlideIndex(idx)}
                  className="glass-panel"
                  style={{
                    padding: "0.75rem 1rem",
                    cursor: "pointer",
                    borderColor: isActive
                      ? "var(--neon-cyan)"
                      : "var(--border-glass)",
                    background: isActive
                      ? "rgba(6, 182, 212, 0.15)"
                      : "rgba(255, 255, 255, 0.03)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--neon-gold)",
                        fontWeight: 700,
                      }}
                    >
                      #{idx + 1} {TYPE_LABELS[s.type] ?? s.type}
                      {GENERATED_TYPES.has(s.type) && " · generoitu"}
                      {flaggedIds.has(String(s.id)) && (
                        <span style={{ color: "#fca5a5" }}> · ⚠</span>
                      )}
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {slideLabel(s)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.2rem",
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveSlide(idx, "up");
                      }}
                      disabled={idx === 0}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveSlide(idx, "down");
                      }}
                      disabled={idx === slides.length - 1}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* A generated slide has nothing to edit: the deck builder recreates
              it from stat_charts.json and the question count on every load, so
              any change here would be silently discarded. Say so instead of
              offering a form. */}
          {activeSlide && GENERATED_TYPES.has(activeSlide.type) && (
            <div
              className="glass-panel"
              style={{
                padding: "2rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <h2 style={{ fontSize: "1.5rem", fontWeight: 800 }}>
                {TYPE_LABELS[activeSlide.type] ?? activeSlide.type}
              </h2>
              <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
                Tämä dia ei ole kysymys eikä siitä saa pisteitä. Se syntyy
                automaattisesti kysymysten väliin, eikä sitä voi muokata täältä
                — pakka rakentaa sen uudelleen joka latauksella.
              </p>
              <ul
                style={{
                  listStyle: "none",
                  display: "grid",
                  gap: "0.6rem",
                  color: "var(--text-muted)",
                  fontSize: "0.95rem",
                }}
              >
                {activeSlide.type === "bet_market" && (
                  <li>
                    Vetomarkkina näytetään neljästi: ennen ensimmäistä
                    kysymystä, kahdesti matkan varrella ja viimeisen jälkeen.
                  </li>
                )}
                {activeSlide.type === "stat_chart" && (
                  <li>
                    Kuvaaja <code>{activeSlide.chartId}</code>. Sisältö tulee
                    tiedostosta <code>stat_charts.json</code>, jonka{" "}
                    <code>build_stat_charts.py</code> rakentaa arkistosta.
                  </li>
                )}
                {activeSlide.type === "quote_card" && (
                  <li>
                    Sitaatti <code>{activeSlide.quoteId}</code>. Sisältö tulee
                    tiedostosta <code>quote_cards.json</code>, jonka{" "}
                    <code>build_quote_cards.py</code> poimii backlogista.
                  </li>
                )}
                {activeSlide.type === "intro" && (
                  <li>
                    Aineiston esittely. Teksti on tiedostossa{" "}
                    <code>quiz_data.json</code>.
                  </li>
                )}
                <li>
                  Määrä ja sijainti seuraavat kysymysten lukumäärää, joten ne
                  asettuvat itse kun lisäät tai poistat kysymyksiä.
                </li>
              </ul>
            </div>
          )}

          {/* Editor Form Panel */}
          {activeSlide && !GENERATED_TYPES.has(activeSlide.type) && (
            <div
              className="glass-panel"
              style={{
                padding: "2rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                maxHeight: "calc(100vh - 200px)",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h2 style={{ fontSize: "1.5rem", fontWeight: 800 }}>
                  Muokataan diaa #{activeSlideIndex + 1}
                </h2>
                <button
                  onClick={() => handleDeleteSlide(activeSlideIndex)}
                  className="btn-secondary"
                  style={{
                    color: "#fca5a5",
                    borderColor: "#ef4444",
                    padding: "0.4rem 0.85rem",
                    fontSize: "0.85rem",
                  }}
                >
                  <Trash2 size={16} /> Poista dia
                </button>
              </div>

              {/* Slide Type & Category Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "1rem",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Dian tyyppi
                  </label>
                  <select
                    className="input-glass"
                    value={activeSlide.type}
                    onChange={(e) =>
                      handleUpdateActiveSlide({
                        type: e.target.value as QuestionType,
                      })
                    }
                  >
                    <option value="multiple_choice">Monivalinta</option>
                    <option value="connect_pairs">Parita parit</option>
                    <option value="open_ended">Avoin kysymys</option>
                    <option value="slider">Lukuarvio</option>
                    <option value="lobby">Aula (Lobby)</option>
                    <option value="scoreboard">Tuloslista</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Kategoria / Tag
                  </label>
                  <input
                    type="text"
                    className="input-glass"
                    value={activeSlide.category || ""}
                    onChange={(e) =>
                      handleUpdateActiveSlide({ category: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Pisteet
                  </label>
                  <input
                    type="number"
                    className="input-glass"
                    value={activeSlide.points ?? DEFAULT_POINTS[activeSlide.type] ?? 1}
                    onChange={(e) =>
                      handleUpdateActiveSlide({
                        points: parseInt(e.target.value) || 100,
                      })
                    }
                  />
                </div>
              </div>

              {/* Question Text / Title */}
              <div>
                <label
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "0.4rem",
                  }}
                >
                  Kysymys / otsikko
                </label>
                <textarea
                  className="input-glass"
                  rows={2}
                  value={activeSlide.question || activeSlide.title || ""}
                  onChange={(e) =>
                    handleUpdateActiveSlide({
                      question: e.target.value,
                      title: e.target.value,
                    })
                  }
                />
              </div>

              {/* Kuva. Judging whether an image question is any good means
                  looking at the picture, so it is shown rather than left as a
                  path in a text field. */}
              <div>
                <label
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "0.4rem",
                  }}
                >
                  Kuva (valinnainen)
                </label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="/quiz_images/q001.jpg"
                  value={activeSlide.imageUrl || ""}
                  onChange={(e) =>
                    handleUpdateActiveSlide({
                      imageUrl: e.target.value || undefined,
                    })
                  }
                />
                {activeSlide.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeSlide.imageUrl}
                    alt=""
                    style={{
                      marginTop: "0.6rem",
                      width: "100%",
                      maxHeight: "300px",
                      objectFit: "contain",
                      borderRadius: "12px",
                      background: "rgba(0, 0, 0, 0.35)",
                      border: "1px solid var(--border-glass)",
                    }}
                  />
                )}
              </div>

              {/* MULTIPLE CHOICE OPTIONS */}
              {activeSlide.type === "multiple_choice" && (
                <div>
                  <label
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "0.6rem",
                    }}
                  >
                    Vastausvaihtoehdot (Valitse oikea vastaus valintanapilla):
                  </label>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {activeSlide.options?.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                        }}
                      >
                        <input
                          type="radio"
                          name="correctAnswer"
                          checked={activeSlide.correctAnswer === oIdx}
                          onChange={() =>
                            handleUpdateActiveSlide({ correctAnswer: oIdx })
                          }
                          style={{ width: "20px", height: "20px" }}
                        />
                        <span style={{ fontWeight: 800, width: "24px" }}>
                          {String.fromCharCode(65 + oIdx)}:
                        </span>
                        <input
                          type="text"
                          className="input-glass"
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...(activeSlide.options || [])];
                            newOpts[oIdx] = e.target.value;
                            handleUpdateActiveSlide({ options: newOpts });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CONNECT PAIRS BUILDER */}
              {activeSlide.type === "connect_pairs" && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.6rem",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                      }}
                    >
                      Yhdistettävät parit:
                    </label>
                    <button
                      onClick={() => {
                        const pairs = [...(activeSlide.pairs || [])];
                        pairs.push({ left: "Uusi kohde", right: "Uusi pari" });
                        handleUpdateActiveSlide({ pairs });
                      }}
                      className="btn-secondary"
                      style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                    >
                      + Lisää pari
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {activeSlide.pairs?.map((p, pIdx) => (
                      <div
                        key={pIdx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 40px",
                          gap: "0.75rem",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          className="input-glass"
                          placeholder="Vasen"
                          value={p.left}
                          onChange={(e) => {
                            const pairs = [...(activeSlide.pairs || [])];
                            pairs[pIdx].left = e.target.value;
                            handleUpdateActiveSlide({ pairs });
                          }}
                        />
                        <input
                          type="text"
                          className="input-glass"
                          placeholder="Oikea"
                          value={p.right}
                          onChange={(e) => {
                            const pairs = [...(activeSlide.pairs || [])];
                            pairs[pIdx].right = e.target.value;
                            handleUpdateActiveSlide({ pairs });
                          }}
                        />
                        <button
                          onClick={() => {
                            const pairs = activeSlide.pairs?.filter(
                              (_, i) => i !== pIdx
                            );
                            handleUpdateActiveSlide({ pairs });
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* OPEN ENDED & EXPLANATION */}
              {activeSlide.type === "open_ended" && (
                <div>
                  <label
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      display: "block",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Virallinen / oikea vastausteksti
                  </label>
                  <input
                    type="text"
                    className="input-glass"
                    value={activeSlide.correctAnswerText || ""}
                    onChange={(e) =>
                      handleUpdateActiveSlide({
                        correctAnswerText: e.target.value,
                      })
                    }
                  />
                </div>
              )}

              {/* EXPLANATION FIELD */}
              <div>
                <label
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "0.4rem",
                  }}
                >
                  Taustatarina / selitysteksti
                </label>
                <textarea
                  className="input-glass"
                  rows={3}
                  value={activeSlide.explanation || ""}
                  onChange={(e) =>
                    handleUpdateActiveSlide({ explanation: e.target.value })
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: QUESTION BANK POOL (100 QUESTIONS) */}
      {activeTab === "bank" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
            flex: 1,
          }}
        >
          {/* Bank Controls & Search */}
          <div
            className="glass-panel"
            style={{
              padding: "1.25rem 1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1.5rem",
            }}
          >
            <div
              style={{
                position: "relative",
                flex: 1,
                maxWidth: "480px",
              }}
            >
              <Search
                size={18}
                style={{
                  position: "absolute",
                  left: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                type="text"
                className="input-glass"
                style={{ paddingLeft: "2.75rem" }}
                placeholder="Etsi kysymyspankista (esim. sitaatti, käyttäjä, emoji)..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>

            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "var(--neon-gold)",
              }}
            >
              Valittu: <strong>{selectedBankCount}</strong> / {bank.length} kysymystä
            </div>
          </div>

          {/* Bank Grid List */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "1.25rem",
              maxHeight: "calc(100vh - 270px)",
              overflowY: "auto",
              paddingRight: "0.5rem",
            }}
          >
            {filteredBank.map((q) => {
              const isSelected = q.selected || false;

              return (
                <div
                  key={q.id}
                  onClick={() => handleToggleBankQuestion(q.id)}
                  className="glass-panel"
                  style={{
                    padding: "1.25rem",
                    cursor: "pointer",
                    borderColor: isSelected
                      ? "var(--neon-gold)"
                      : "var(--border-glass)",
                    background: isSelected
                      ? "rgba(245, 158, 11, 0.15)"
                      : "rgba(255, 255, 255, 0.03)",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "1rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleBankQuestion(q.id)}
                        style={{ width: "22px", height: "22px", cursor: "pointer" }}
                      />
                      <span className="badge-category">{q.category}</span>
                    </div>

                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        fontWeight: 700,
                      }}
                    >
                      {TYPE_LABELS[q.type] ?? q.type} · {q.points ?? 1} p
                    </span>
                  </div>

                  <h3
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      lineHeight: 1.35,
                      marginBottom: "0.75rem",
                    }}
                  >
                    {q.question}
                  </h3>

                  {q.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={q.imageUrl}
                      alt=""
                      loading="lazy"
                      style={{
                        width: "100%",
                        maxHeight: "220px",
                        objectFit: "contain",
                        borderRadius: "10px",
                        background: "rgba(0, 0, 0, 0.35)",
                        marginBottom: "0.75rem",
                      }}
                    />
                  )}

                  {q.options && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          q.options.length > 12 ? "1fr 1fr 1fr" : "1fr 1fr",
                        gap: "0.5rem",
                        fontSize: q.options.length > 12 ? "0.78rem" : "0.85rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          style={{
                            fontWeight:
                              oIdx === q.correctAnswer ? 700 : 400,
                            color:
                              oIdx === q.correctAnswer
                                ? "var(--neon-green)"
                                : "inherit",
                          }}
                        >
                          {String.fromCharCode(65 + oIdx)}: {opt}
                        </div>
                      ))}
                    </div>
                  )}

                  {q.explanation && (
                    <div
                      style={{
                        marginTop: "0.75rem",
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      💡 {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
