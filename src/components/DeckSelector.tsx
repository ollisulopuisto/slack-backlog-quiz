"use client";

import { DeckMeta } from "@/lib/decks";
import { hostFetch } from "@/lib/hostClient";
import { Check, ChevronDown, Copy, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Picks which deck is on the projector, and manages the rest.
 *
 * Switching is not destructive — each deck keeps its own game — so this needs
 * no confirmation, unlike the reset button next to it on the deck view. Only
 * deleting asks, and only a deck that isn't live can be deleted at all.
 */
export default function DeckSelector({
  onSwitched,
}: {
  onSwitched?: () => void;
}) {
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  async function call(body: object | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await hostFetch("/api/decks", {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Toiminto epäonnistui");
        return null;
      }
      setDecks(data.decks ?? []);
      setActiveId(data.activeDeckId ?? null);
      return data;
    } catch {
      setError("Yhteysvirhe");
      return null;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    call(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const active = decks.find((d) => d.id === activeId);

  async function activate(id: string) {
    if (id === activeId) return setOpen(false);
    await call({ action: "activate", deckId: id });
    setOpen(false);
    onSwitched?.();
  }

  async function create() {
    const name = window.prompt("Uuden pakan nimi:", "Uusi pakka");
    if (!name) return;
    await call({ action: "create", name });
  }

  async function duplicate() {
    if (!active) return;
    await call({ action: "duplicate", deckId: active.id });
  }

  async function rename() {
    if (!active) return;
    const name = window.prompt("Pakan uusi nimi:", active.name);
    if (!name || name === active.name) return;
    await call({ action: "rename", deckId: active.id, name });
  }

  async function remove(deck: DeckMeta) {
    if (
      !window.confirm(
        `Poistetaanko pakka ”${deck.name}” (${deck.questionCount} kysymystä)?\n\n` +
          "Sen kysymykset ja siihen tallennettu pelitilanne katoavat. " +
          "Tätä ei voi perua."
      )
    ) {
      return;
    }
    await call({ action: "delete", deckId: deck.id });
  }

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-secondary btn-compact"
        disabled={busy}
        aria-expanded={open}
        title="Vaihda pakkaa tai hallitse pakkoja"
      >
        <Layers size={16} />
        {active ? active.name : "Pakka"}
        <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
          {active ? `· ${active.questionCount} kysymystä` : ""}
        </span>
        <ChevronDown size={14} />
      </button>

      {error && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 0.4rem)",
            left: 0,
            zIndex: 40,
            background: "rgba(239, 68, 68, 0.95)",
            color: "#fff",
            padding: "0.5rem 0.8rem",
            borderRadius: "8px",
            fontSize: "0.85rem",
            maxWidth: "22rem",
          }}
        >
          {error}
        </div>
      )}

      {open && (
        <div
          className="glass-panel"
          style={{
            position: "absolute",
            top: "calc(100% + 0.5rem)",
            left: 0,
            zIndex: 30,
            minWidth: "22rem",
            padding: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.15rem",
          }}
        >
          {decks.map((d) => (
            <div
              key={d.id}
              style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
            >
              <button
                onClick={() => activate(d.id)}
                className="btn-secondary btn-compact"
                style={{
                  flex: 1,
                  justifyContent: "flex-start",
                  border: "none",
                  background:
                    d.id === activeId ? "rgba(6, 182, 212, 0.2)" : "transparent",
                  color: d.id === activeId ? "var(--neon-cyan)" : undefined,
                }}
              >
                {d.id === activeId ? <Check size={14} /> : <span style={{ width: 14 }} />}
                <span style={{ flex: 1, textAlign: "left" }}>{d.name}</span>
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                  {d.questionCount}
                </span>
              </button>
              {d.id !== activeId && decks.length > 1 && (
                <button
                  onClick={() => remove(d)}
                  className="btn-secondary btn-compact"
                  style={{ border: "none", color: "#fca5a5", padding: "0.3rem" }}
                  title={`Poista pakka ${d.name}`}
                  aria-label={`Poista pakka ${d.name}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          <div
            style={{
              borderTop: "1px solid var(--border-glass)",
              marginTop: "0.35rem",
              paddingTop: "0.35rem",
              display: "flex",
              gap: "0.25rem",
              flexWrap: "wrap",
            }}
          >
            <button onClick={create} className="btn-secondary btn-compact">
              <Plus size={14} /> Uusi
            </button>
            <button onClick={duplicate} className="btn-secondary btn-compact">
              <Copy size={14} /> Kopioi tämä
            </button>
            <button onClick={rename} className="btn-secondary btn-compact">
              <Pencil size={14} /> Nimeä
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
