"use client";

import { useState, useCallback, useRef } from "react";
import type { PipelineEvent } from "@repo/core";

export type StreamStatus = "idle" | "streaming" | "complete" | "error";

export interface PipelineStreamResult {
  company: string;
  reportEn: string;
  reportZh?: string;
  qualityScore: number;
  riskScore: number;
  reportId?: string | null;
}

export interface UsePipelineStreamReturn {
  events: PipelineEvent[];
  status: StreamStatus;
  result: PipelineStreamResult | null;
  error: string | null;
  start: (company: string, mode: "quick" | "full") => void;
  reset: () => void;
}

export function usePipelineStream(): UsePipelineStreamReturn {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [result, setResult] = useState<PipelineStreamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setEvents([]);
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  const start = useCallback((company: string, mode: "quick" | "full") => {
    reset();
    setStatus("streaming");

    const abort = new AbortController();
    abortRef.current = abort;

    (async () => {
      try {
        const res = await fetch("/api/analyze/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company, mode }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          setError(`HTTP ${res.status}`);
          setStatus("error");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "message";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const json = line.slice(6);
              try {
                const parsed = JSON.parse(json);
                if (eventType === "done") {
                  setResult(parsed as PipelineStreamResult);
                  setStatus("complete");
                } else {
                  setEvents((prev) => [...prev, parsed as PipelineEvent]);
                }
              } catch {
                // Malformed JSON line, skip
              }
              eventType = "message";
            }
          }
        }

        // If we finished reading without a "done" event, mark complete
        setStatus((s) => (s === "streaming" ? "complete" : s));
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message);
          setStatus("error");
        }
      }
    })();
  }, [reset]);

  return { events, status, result, error, start, reset };
}
