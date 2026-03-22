"use client";

import { useMemo } from "react";
import type { PipelineEvent } from "@repo/core";
import { NODE_ORDER, TOTAL_NODES } from "@/lib/pipeline-graph";
import { useLang } from "./providers";

interface PipelineProgressProps {
  events: PipelineEvent[];
  startTime?: number;
}

export function PipelineProgress({ events, startTime }: PipelineProgressProps) {
  const { t } = useLang();

  const { completedCount, currentNode, qualityScore, isComplete, elapsed, totalCost, totalTokens } = useMemo(() => {
    const completed = new Set<string>();
    let current: string | null = null;
    let quality: number | undefined;
    let done = false;
    let cost: number | undefined;
    let tokens: number | undefined;

    for (const e of events) {
      if (e.type === "node_start") current = e.node;
      if (e.type === "node_end") completed.add(e.node);
      if (e.type === "reflexion") quality = e.score;
      if (e.type === "cost_update") { cost = e.totalCost; tokens = e.totalTokens; }
      if (e.type === "pipeline_complete") {
        done = true;
        quality = e.qualityScore;
      }
    }

    return {
      completedCount: completed.size,
      currentNode: done ? null : current,
      qualityScore: quality,
      isComplete: done,
      elapsed: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
      totalCost: cost,
      totalTokens: tokens,
    };
  }, [events, startTime]);

  const progress = isComplete ? 100 : Math.round((completedCount / TOTAL_NODES) * 100);
  const nodeLabel = currentNode ? NODE_ORDER.indexOf(currentNode) + 1 : completedCount;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isComplete && currentNode && (
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin text-[var(--primary)]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium">
                {t("analyze.running")}: <span className="text-[var(--primary)]">{currentNode}</span>
              </span>
            </div>
          )}
          {isComplete && (
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-[var(--success)]">{t("analyze.complete")}</span>
            </div>
          )}
          <span className="text-xs text-[var(--muted-foreground)]">
            {nodeLabel}/{TOTAL_NODES} {t("analyze.nodes")}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {qualityScore != null && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              qualityScore >= 7
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : qualityScore >= 5
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}>
              {t("analyze.quality")}: {qualityScore.toFixed(1)}
            </span>
          )}
          {totalCost != null && (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              ${totalCost.toFixed(2)} · {totalTokens ? `${(totalTokens / 1000).toFixed(0)}K` : "—"}
            </span>
          )}
          {elapsed > 0 && (
            <span className="font-mono text-xs text-[var(--muted-foreground)]">
              {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: isComplete
              ? "var(--success)"
              : "linear-gradient(90deg, var(--gradient-from), var(--gradient-to))",
          }}
        />
      </div>
    </div>
  );
}
