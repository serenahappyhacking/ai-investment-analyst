"use client";

import { useEffect, useRef, useState } from "react";
import type { PipelineEvent } from "@repo/core";
import { useLang } from "./providers";

type FilterMode = "all" | "scores" | "errors";

interface ExecutionLogProps {
  events: PipelineEvent[];
}

function scoreColor(score: number): string {
  if (score >= 7) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (score >= 5) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

export function ExecutionLog({ events }: ExecutionLogProps) {
  const { t } = useLang();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const filtered = events.filter((e) => {
    if (filter === "scores") return e.type === "prm_score" || e.type === "reflexion" || e.type === "cost_update";
    if (filter === "errors") return e.type === "error";
    return true;
  });

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex gap-1.5 border-b border-[var(--border)] px-3 py-2">
        {(["all", "scores", "errors"] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === mode
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            }`}
          >
            {t(`analyze.filter.${mode}`)}
          </button>
        ))}
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="execution-log-scroll flex-1 overflow-y-auto p-3"
      >
        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-[var(--muted-foreground)]">
            {t("analyze.waitingForEvents")}
          </p>
        )}

        <div className="space-y-1">
          {filtered.map((event, i) => (
            <EventEntry
              key={i}
              event={event}
              isExpanded={expanded.has(i)}
              onToggle={() => toggleExpand(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventEntry({ event, isExpanded, onToggle }: { event: PipelineEvent; isExpanded: boolean; onToggle: () => void }) {
  switch (event.type) {
    case "node_start":
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{formatTime(event.timestamp)}</span>
          <span className="text-xs text-blue-600 dark:text-blue-400">
            Starting <span className="font-semibold">{event.node}</span>...
          </span>
        </div>
      );

    case "node_end":
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{formatTime(event.timestamp)}</span>
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            <span className="font-semibold">{event.node}</span> completed
            <span className="ml-1 text-[var(--muted-foreground)]">({(event.durationMs / 1000).toFixed(1)}s)</span>
          </span>
        </div>
      );

    case "log":
      return (
        <div className="flex items-start gap-2 py-0.5 pl-4">
          <span className="mt-1.5 h-1 w-1 rounded-full bg-[var(--border)]" />
          <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{formatTime(event.timestamp)}</span>
          <span className="text-xs text-[var(--foreground)] opacity-80">{event.message}</span>
        </div>
      );

    case "phase_change":
      return (
        <div className="my-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="rounded-full bg-[var(--accent)] px-3 py-0.5 text-[10px] font-semibold text-[var(--accent-foreground)]">
            {event.phase}
          </span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>
      );

    case "prm_score":
      return (
        <div className="my-1">
          <button
            onClick={onToggle}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-[var(--muted)]"
          >
            <span className="text-xs">📊</span>
            <span className="text-xs font-medium">{event.node}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${scoreColor(event.score)}`}>
              {event.score.toFixed(1)}/10
            </span>
            <svg
              className={`ml-auto h-3 w-3 text-[var(--muted-foreground)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {isExpanded && Object.keys(event.dimensions).length > 0 && (
            <div className="ml-6 mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg bg-[var(--muted)] p-2">
              {Object.entries(event.dimensions).map(([dim, score]) => (
                <div key={dim} className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--muted-foreground)]">{dim}</span>
                  <span className={`font-medium ${score >= 7 ? "text-emerald-600 dark:text-emerald-400" : score >= 5 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );

    case "reflexion":
      return (
        <div className="my-1.5 rounded-lg border border-purple-200 bg-purple-50 p-2.5 dark:border-purple-800 dark:bg-purple-900/20">
          <div className="flex items-center gap-2">
            <span className="text-xs">🪞</span>
            <span className="text-xs font-semibold text-purple-700 dark:text-purple-400">
              Reflexion (attempt {event.attempt})
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${scoreColor(event.score)}`}>
              {event.score.toFixed(1)}/10
            </span>
            {event.shouldRetry && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                retrying
              </span>
            )}
          </div>
          {event.actionItems.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 pl-5">
              {event.actionItems.map((item, j) => (
                <li key={j} className="text-[10px] text-purple-600 dark:text-purple-300">• {item}</li>
              ))}
            </ul>
          )}
        </div>
      );

    case "skill_invocation":
      return (
        <div className="flex items-center gap-2 py-0.5 pl-4">
          <span className="text-xs">🔧</span>
          <span className="text-xs">
            <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">{event.skill}</span>
            <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
              {event.provider}
            </span>
          </span>
        </div>
      );

    case "cost_update":
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="text-xs">💰</span>
          <span className="text-xs text-[var(--muted-foreground)]">
            Cost: <span className="font-mono font-medium text-[var(--foreground)]">${event.totalCost.toFixed(2)}</span>
            <span className="mx-1">·</span>
            {(event.totalTokens / 1000).toFixed(0)}K tokens
          </span>
        </div>
      );

    case "error":
      return (
        <div className="my-1 flex items-start gap-2 rounded-lg bg-red-50 p-2 dark:bg-red-900/20">
          <span className="mt-0.5 h-2 w-2 rounded-full bg-red-500" />
          <div>
            <span className="text-xs font-semibold text-red-700 dark:text-red-400">{event.node}</span>
            <p className="text-xs text-red-600 dark:text-red-300">{event.message}</p>
          </div>
        </div>
      );

    case "pipeline_complete":
      return (
        <div className="my-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="flex items-center gap-2">
            <span className="text-sm">✅</span>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Pipeline Complete</span>
          </div>
          <div className="mt-1.5 flex gap-4 text-xs text-emerald-600 dark:text-emerald-300">
            <span>Quality: <span className="font-bold">{event.qualityScore.toFixed(1)}/10</span></span>
            <span>Risk: <span className="font-bold">{event.riskScore.toFixed(1)}/10</span></span>
            <span>Duration: <span className="font-bold">{(event.durationMs / 1000).toFixed(0)}s</span></span>
          </div>
        </div>
      );

    default:
      return null;
  }
}
