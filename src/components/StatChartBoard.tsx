"use client";

import statCharts from "@/lib/stat_charts.json";
import { motion } from "framer-motion";
import { BarChart3, Trophy } from "lucide-react";

/**
 * The deck's stat screens: the shape of ten years, between the questions.
 *
 * Every chart is a single series, so there is no legend — the title names it.
 * Bars sit in their natural order (hour 0→23, year 2016→2026) rather than
 * sorted by size, because the shape is the point. Only the peak is labelled:
 * this is read from the back of a room, and a number on every bar is noise.
 *
 * The mark colour is the deck's own purple with the peak in its pink, a pair
 * that passes the contrast and colour-vision checks against this surface.
 * There is no hover layer, deliberately — nobody in the audience has a mouse,
 * so the peak carries a direct label instead.
 */

type Point = { label: string; value: number };
type Chart = {
  id: string;
  type?: string;
  title: string;
  subtitle?: string;
  axisLabel?: string;
  note?: string;
  labelEvery?: number;
  series?: {
    points: Point[];
    peakIndex: number;
    peakLabel: string;
    max: number;
    total: number;
  };
  records?: { value: string; unit: string; detail: string }[];
};

const BAR = "#8b5cf6";
const PEAK = "#ec4899";

export function getStatCharts(): Chart[] {
  return (statCharts as { charts: Chart[] }).charts;
}

export default function StatChartBoard({ chartId }: { chartId: string }) {
  const chart = getStatCharts().find((c) => c.id === chartId);
  if (!chart) return null;

  return (
    <div className="glass-panel" style={{ padding: "2.5rem 3rem", width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "0.3rem",
        }}
      >
        {chart.records ? (
          <Trophy size={30} style={{ color: PEAK }} />
        ) : (
          <BarChart3 size={30} style={{ color: "var(--neon-cyan)" }} />
        )}
        <h2 style={{ fontSize: "2.1rem", fontWeight: 900 }}>{chart.title}</h2>
      </div>
      {chart.subtitle && (
        <p style={{ color: "var(--text-muted)", fontSize: "1.05rem" }}>
          {chart.subtitle}
        </p>
      )}

      {chart.records ? (
        <RecordRow records={chart.records} />
      ) : (
        <Bars chart={chart} />
      )}

      {chart.note && (
        <p
          style={{
            marginTop: "1.6rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-glass)",
            color: "var(--text-muted)",
            fontSize: "0.95rem",
          }}
        >
          {chart.note}
        </p>
      )}
    </div>
  );
}

function Bars({ chart }: { chart: Chart }) {
  const series = chart.series!;
  const every = chart.labelEvery ?? 1;

  return (
    <div style={{ marginTop: "2rem" }}>
      <div
        role="img"
        aria-label={`${chart.title}. Huippu ${
          series.points[series.peakIndex].label
        }: ${series.peakLabel}.`}
        style={{
          display: "flex",
          // Must stretch, not flex-end: with flex-end each column collapses to
          // its content height, and the bars' percentage heights then have
          // nothing to resolve against, so every bar renders flat.
          alignItems: "stretch",
          gap: "2px",
          height: "clamp(180px, 34vh, 300px)",
          // The baseline the bars stand on; without it they float.
          borderBottom: "2px solid var(--border-glass)",
        }}
      >
        {series.points.map((p, i) => {
          const isPeak = i === series.peakIndex;
          return (
            <div
              key={p.label + i}
              style={{
                flex: 1,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                position: "relative",
              }}
            >
              {isPeak && (
                <span
                  style={{
                    position: "absolute",
                    bottom: `calc(${(p.value / series.max) * 100}% + 0.4rem)`,
                    left: "50%",
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    fontSize: "0.95rem",
                    fontWeight: 800,
                    color: PEAK,
                  }}
                >
                  {series.peakLabel}
                </span>
              )}
              {/* Deliberately not animated. Both a height animation and a
                  scaleY one left every bar at zero inside the deck's
                  AnimatePresence, and a grow-in flourish is worth nothing on a
                  projector — the chart is on screen for as long as the host
                  talks over it. */}
              <div
                style={{
                  height: `${Math.max(
                    (p.value / series.max) * 100,
                    p.value > 0 ? 0.6 : 0
                  )}%`,
                  background: isPeak ? PEAK : BAR,
                  borderRadius: "4px 4px 0 0",
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "2px", marginTop: "0.5rem" }}>
        {series.points.map((p, i) => (
          <div
            key={p.label + i}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: "0.8rem",
              color:
                i === series.peakIndex ? PEAK : "var(--text-muted)",
              fontWeight: i === series.peakIndex ? 800 : 500,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {i % every === 0 || i === series.peakIndex ? p.label : ""}
          </div>
        ))}
      </div>

      {chart.axisLabel && (
        <p
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            marginTop: "0.35rem",
            letterSpacing: "0.05em",
          }}
        >
          {chart.axisLabel}
        </p>
      )}
    </div>
  );
}

function RecordRow({ records }: { records: NonNullable<Chart["records"]> }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${records.length}, 1fr)`,
        gap: "1.5rem",
        marginTop: "2rem",
      }}
    >
      {records.map((r, i) => (
        <motion.div
          key={r.unit}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 * i, duration: 0.4 }}
          style={{
            padding: "1.4rem 1.2rem",
            borderRadius: "14px",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid var(--border-glass)",
          }}
        >
          <div
            style={{
              fontSize: "2.8rem",
              fontWeight: 900,
              lineHeight: 1,
              color: PEAK,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {r.value}
          </div>
          <div style={{ fontWeight: 700, marginTop: "0.4rem" }}>{r.unit}</div>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "0.9rem",
              marginTop: "0.2rem",
            }}
          >
            {r.detail}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
