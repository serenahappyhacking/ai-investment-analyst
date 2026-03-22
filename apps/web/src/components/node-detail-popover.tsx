"use client";

import { useMemo } from "react";
import type { PipelineEvent } from "@repo/core";
import { PIPELINE_NODES } from "@/lib/pipeline-graph";
import { useLang } from "./providers";

interface NodeDetailPopoverProps {
  nodeId: string;
  events: PipelineEvent[];
  onClose: () => void;
}

export function NodeDetailPopover({ nodeId, events, onClose }: NodeDetailPopoverProps) {
  const { locale, t } = useLang();
  const isZh = locale === "zh";
  const node = PIPELINE_NODES.find((n) => n.id === nodeId);

  const nodeData = useMemo(() => {
    const logs: string[] = [];
    let durationMs: number | undefined;
    let prmScore: number | undefined;
    let prmDimensions: Record<string, number> = {};
    let prmRecommendation = "";
    let reflexionScore: number | undefined;
    let reflexionItems: string[] = [];

    for (const e of events) {
      if (e.type === "log" && e.node === nodeId) {
        logs.push(e.message);
      }
      if (e.type === "node_end" && e.node === nodeId) {
        durationMs = e.durationMs;
      }
      if (e.type === "prm_score" && e.node === nodeId) {
        prmScore = e.score;
        prmDimensions = e.dimensions;
        prmRecommendation = e.recommendation;
      }
      if (e.type === "reflexion" && nodeId === "reflexion") {
        reflexionScore = e.score;
        reflexionItems = e.actionItems;
      }
    }

    return { logs, durationMs, prmScore, prmDimensions, prmRecommendation, reflexionScore, reflexionItems };
  }, [events, nodeId]);

  if (!node) return null;

  const scoreColor = (s: number) =>
    s >= 7 ? "text-emerald-600 dark:text-emerald-400" :
    s >= 5 ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400";

  return (
    <div className="relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-lg)]">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-3 top-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Header */}
      <h3 className="text-sm font-bold">{isZh ? node.labelZh : node.label}</h3>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{node.description}</p>

      {/* Duration */}
      {nodeData.durationMs != null && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          {t("analyze.duration")}: {(nodeData.durationMs / 1000).toFixed(1)}s
        </p>
      )}

      {/* PRM Score */}
      {nodeData.prmScore != null && (
        <div className="mt-3 rounded-lg bg-[var(--muted)] p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{t("analyze.prmScore")}</span>
            <span className={`text-sm font-bold ${scoreColor(nodeData.prmScore)}`}>
              {nodeData.prmScore.toFixed(1)}/10
            </span>
          </div>
          {Object.keys(nodeData.prmDimensions).length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(nodeData.prmDimensions).map(([dim, score]) => (
                <div key={dim} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted-foreground)]">{dim}</span>
                  <span className={`font-medium ${scoreColor(score)}`}>{score}/10</span>
                </div>
              ))}
            </div>
          )}
          {nodeData.prmRecommendation && (
            <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
              → {nodeData.prmRecommendation}
            </p>
          )}
        </div>
      )}

      {/* Reflexion */}
      {nodeData.reflexionScore != null && (
        <div className="mt-3 rounded-lg bg-[var(--muted)] p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{t("analyze.qualityScore")}</span>
            <span className={`text-sm font-bold ${scoreColor(nodeData.reflexionScore)}`}>
              {nodeData.reflexionScore.toFixed(1)}/10
            </span>
          </div>
          {nodeData.reflexionItems.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {nodeData.reflexionItems.map((item, i) => (
                <li key={i} className="text-xs text-[var(--muted-foreground)]">• {item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Logs */}
      {nodeData.logs.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold">{t("analyze.logs")}</p>
          <div className="max-h-32 overflow-y-auto rounded-lg bg-[var(--muted)] p-2 font-mono text-[10px] leading-relaxed text-[var(--muted-foreground)]">
            {nodeData.logs.map((log, i) => (
              <p key={i}>{log}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
