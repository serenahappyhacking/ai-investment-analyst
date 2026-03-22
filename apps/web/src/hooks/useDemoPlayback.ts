"use client";

import { useState, useCallback, useRef } from "react";
import type { PipelineEvent } from "@repo/core";
import { DEMO_TRACE, DEMO_TRACE_HK, type DemoTraceItem } from "@/lib/demo-trace";
import type { StreamStatus, PipelineStreamResult, UsePipelineStreamReturn } from "./usePipelineStream";

export type DemoType = "us" | "hk";

const DEMO_RESULTS: Record<DemoType, PipelineStreamResult> = {
  us: {
    company: "NVIDIA",
    reportEn: "# NVIDIA Investment Analysis\n\nDemo report content...",
    qualityScore: 8.2,
    riskScore: 6.5,
  },
  hk: {
    company: "Tencent",
    reportEn: "# Tencent (0700.HK) Investment Analysis\n\nDemo report with HK regulatory depth...",
    qualityScore: 8.3,
    riskScore: 5.8,
  },
};

export function useDemoPlayback(speed: number = 1, demoType: DemoType = "hk"): UsePipelineStreamReturn {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [result, setResult] = useState<PipelineStreamResult | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
    setEvents([]);
    setStatus("idle");
    setResult(null);
  }, []);

  const start = useCallback((_company?: string, _mode?: "quick" | "full") => {
    reset();
    setStatus("streaming");

    const trace: DemoTraceItem[] = demoType === "hk" ? DEMO_TRACE_HK : DEMO_TRACE;
    const timers: ReturnType<typeof setTimeout>[] = [];

    trace.forEach((item, i) => {
      const delay = item.delayMs / speed;
      const timer = setTimeout(() => {
        setEvents((prev) => [...prev, item.event]);

        if (i === trace.length - 1) {
          setStatus("complete");
          setResult(DEMO_RESULTS[demoType]);
        }
      }, delay);
      timers.push(timer);
    });

    timersRef.current = timers;
  }, [speed, demoType, reset]);

  return { events, status, result, error: null, start, reset };
}
