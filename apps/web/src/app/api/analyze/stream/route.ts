import type { PipelineEvent } from "@repo/core";
import { createClient, isSupabaseConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKER_MAP: Record<string, string> = {
  nvidia: "NVDA", apple: "AAPL", google: "GOOGL", alphabet: "GOOGL",
  microsoft: "MSFT", amazon: "AMZN", meta: "META", tesla: "TSLA",
  amd: "AMD", intel: "INTC", micron: "MU", alibaba: "BABA",
  tencent: "0700.HK", byd: "1211.HK", xiaomi: "1810.HK",
};

function guessTickerFromCompany(company: string): string | null {
  const lower = company.toLowerCase().trim();
  if (TICKER_MAP[lower]) return TICKER_MAP[lower];
  for (const [key, ticker] of Object.entries(TICKER_MAP)) {
    if (lower.includes(key)) return ticker;
  }
  if (/^[A-Z]{1,5}$/.test(company.trim())) return company.trim();
  return null;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { company, mode = "full" } = body;

  if (!company || typeof company !== "string") {
    return new Response(JSON.stringify({ error: "Company name is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const { runAnalysis } = await import("@repo/core");
        const result = await runAnalysis({
          company,
          mode,
          stream: true,
          onEvent: send,
        });

        // Persist report to Supabase (skip in demo mode)
        let reportId: string | null = null;
        if (isSupabaseConfigured) {
          try {
            const supabase = await createClient();
            const ticker = guessTickerFromCompany(company);
            const summaryMatch = result.reportEn.match(/## 1\. Executive Summary\n\n([\s\S]*?)(?=\n## )/);
            const executiveSummary = summaryMatch?.[1]?.trim().slice(0, 500) ?? null;

            const { data } = await supabase
              .from("reports")
              .insert({
                company_name: company,
                ticker: ticker ?? company.toUpperCase(),
                status: "completed",
                report_en: result.reportEn,
                report_zh: result.reportZh ?? null,
                executive_summary: executiveSummary,
                quality_score: result.qualityScore,
                risk_score: result.riskScore,
                progress_log: result.logs,
                completed_at: new Date().toISOString(),
              })
              .select("id")
              .single();

            reportId = data?.id ?? null;
          } catch {
            // DB write failure is non-fatal for streaming
          }
        }

        // Send final result as a separate event type
        controller.enqueue(
          encoder.encode(`event: done\ndata: ${JSON.stringify({
            company: result.company,
            reportEn: result.reportEn,
            reportZh: result.reportZh,
            qualityScore: result.qualityScore,
            riskScore: result.riskScore,
            reportId,
          })}\n\n`)
        );
      } catch (e) {
        const errorEvent: PipelineEvent = {
          type: "error",
          node: "pipeline",
          message: e instanceof Error ? e.message : String(e),
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
