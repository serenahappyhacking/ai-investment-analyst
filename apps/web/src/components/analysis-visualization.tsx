"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { PipelineEvent } from "@repo/core";
import { PipelineDAG } from "./pipeline-dag";
import { ExecutionLog } from "./execution-log";
import { PipelineProgress } from "./pipeline-progress";
import { NodeDetailPopover } from "./node-detail-popover";
import { usePipelineStream, type UsePipelineStreamReturn } from "@/hooks/usePipelineStream";
import { useDemoPlayback, type DemoType } from "@/hooks/useDemoPlayback";
import { useLang } from "./providers";

interface AnalysisVisualizationProps {
  company?: string;
  mode?: "quick" | "full";
  demo?: boolean;
}

export function AnalysisVisualization({ company, mode = "full", demo = false }: AnalysisVisualizationProps) {
  const { t } = useLang();
  const [speed, setSpeed] = useState(1);
  const [demoType, setDemoType] = useState<DemoType>("hk");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const liveStream = usePipelineStream();
  const demoStream = useDemoPlayback(speed, demoType);
  const stream: UsePipelineStreamReturn = demo ? demoStream : liveStream;

  const handleStart = useCallback(() => {
    setStartTime(Date.now());
    stream.start(company ?? (demoType === "hk" ? "Tencent" : "NVIDIA"), mode);
  }, [company, mode, demoType, stream]);

  // Auto-start on mount if company is provided or demo mode
  useEffect(() => {
    if ((company || demo) && stream.status === "idle") {
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed time timer
  useEffect(() => {
    if (stream.status !== "streaming" || !startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [stream.status, startTime]);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <PipelineProgress events={stream.events} startTime={startTime ?? undefined} />

      {/* Main content: DAG + Log */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* DAG panel (3/5 width on lg) */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("analyze.pipeline")}</h3>
              {demo && (
                <div className="flex items-center gap-3">
                  {/* Demo type selector */}
                  <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-0.5">
                    {(["hk", "us"] as DemoType[]).map((dt) => (
                      <button
                        key={dt}
                        onClick={() => { setDemoType(dt); stream.reset(); setStartTime(null); setSelectedNode(null); }}
                        className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                          demoType === dt
                            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        }`}
                      >
                        {dt === "hk" ? t("analyze.demoHK") : t("analyze.demoUS")}
                      </button>
                    ))}
                  </div>
                  {/* Speed control */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[var(--muted-foreground)]">{t("analyze.speed")}:</span>
                    {[1, 2, 4].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSpeed(s)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                          speed === s
                            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <PipelineDAG
              events={stream.events}
              onNodeClick={setSelectedNode}
              selectedNode={selectedNode}
            />

            {/* Node detail popover */}
            {selectedNode && (
              <div className="mt-3">
                <NodeDetailPopover
                  nodeId={selectedNode}
                  events={stream.events}
                  onClose={() => setSelectedNode(null)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Log panel (2/5 width on lg) */}
        <div className="lg:col-span-2">
          <div className="h-[500px] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-sm font-semibold">{t("analyze.executionLog")}</h3>
            </div>
            <div className="h-[calc(100%-44px)]">
              <ExecutionLog events={stream.events} />
            </div>
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-[var(--shadow)]">
        <div className="flex items-center gap-3">
          {stream.status === "idle" && (
            <button
              onClick={handleStart}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow)] transition-all hover:opacity-90"
            >
              {t("analyze.startAnalysis")}
            </button>
          )}
          {stream.status === "complete" && stream.result && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-[var(--success)]">{t("analyze.analysisComplete")}</span>
              {stream.result.reportId && (
                <Link
                  href={`/dashboard/reports/${stream.result.reportId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
                >
                  {t("common.viewReport")}
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </Link>
              )}
            </div>
          )}
          {stream.error && (
            <span className="text-sm text-[var(--destructive)]">{stream.error}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {demo && (
            <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-[10px] font-semibold text-[var(--accent-foreground)]">
              {t("common.demo")}
            </span>
          )}
          {stream.status !== "idle" && (
            <button
              onClick={() => { stream.reset(); setStartTime(null); setSelectedNode(null); setElapsed(0); }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              {t("analyze.reset")}
            </button>
          )}
        </div>
      </div>

      {/* Cost & Token summary card (shown after pipeline completes) */}
      <CostSummary events={stream.events} />
    </div>
  );
}

// ── Cost Summary Card ─────────────────────────────────────
function CostSummary({ events }: { events: PipelineEvent[] }) {
  const { t } = useLang();

  const data = useMemo(() => {
    let cost: number | undefined;
    let tokens: number | undefined;
    let byAgent: Record<string, number> = {};
    let durationMs: number | undefined;
    let qualityScore: number | undefined;
    let riskScore: number | undefined;

    for (const e of events) {
      if (e.type === "cost_update") {
        cost = e.totalCost;
        tokens = e.totalTokens;
        byAgent = e.byAgent;
      }
      if (e.type === "pipeline_complete") {
        durationMs = e.durationMs;
        qualityScore = e.qualityScore;
        riskScore = e.riskScore;
      }
    }

    return { cost, tokens, byAgent, durationMs, qualityScore, riskScore };
  }, [events]);

  // Only show after pipeline completes with cost data
  if (data.durationMs == null) return null;

  const topAgents = Object.entries(data.byAgent)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]">
      <h3 className="mb-4 text-sm font-semibold">{t("analyze.costSummary")}</h3>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.cost != null && (
          <div className="rounded-lg bg-[var(--muted)] p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              {t("analyze.totalCost")}
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              ${data.cost.toFixed(2)}
            </p>
          </div>
        )}
        {data.tokens != null && (
          <div className="rounded-lg bg-[var(--muted)] p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              {t("analyze.totalTokens")}
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              {data.tokens >= 1_000_000
                ? `${(data.tokens / 1_000_000).toFixed(1)}M`
                : `${(data.tokens / 1_000).toFixed(0)}K`}
            </p>
          </div>
        )}
        {data.durationMs != null && (
          <div className="rounded-lg bg-[var(--muted)] p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              {t("analyze.duration")}
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              {(data.durationMs / 1000).toFixed(0)}s
            </p>
          </div>
        )}
        {data.qualityScore != null && (
          <div className="rounded-lg bg-[var(--muted)] p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              {t("analyze.quality")} / {t("reports.risk")}
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              {data.qualityScore.toFixed(1)} / {data.riskScore?.toFixed(1)}
            </p>
          </div>
        )}
      </div>

      {/* Per-agent cost breakdown */}
      {topAgents.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            {t("analyze.costByAgent")}
          </p>
          <div className="space-y-1.5">
            {topAgents.map(([agent, agentCost]) => {
              const pct = data.cost ? (agentCost / data.cost) * 100 : 0;
              return (
                <div key={agent} className="flex items-center gap-2">
                  <span className="w-28 truncate text-xs text-[var(--muted-foreground)]">{agent}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg, var(--gradient-from), var(--gradient-to))",
                      }}
                    />
                  </div>
                  <span className="w-14 text-right font-mono text-xs text-[var(--muted-foreground)]">
                    ${agentCost.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
