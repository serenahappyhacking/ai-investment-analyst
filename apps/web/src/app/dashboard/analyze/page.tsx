"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AnalysisVisualization } from "@/components/analysis-visualization";
import { useLang } from "@/components/providers";

function AnalyzeContent() {
  const { t } = useLang();
  const searchParams = useSearchParams();
  const company = searchParams.get("company") ?? undefined;
  const mode = (searchParams.get("mode") as "quick" | "full") ?? "full";
  const demo = searchParams.get("demo") === "true" || !company;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("analyze.title")}</h2>
        <p className="mt-1 text-[var(--muted-foreground)]">
          {demo ? t("analyze.demoDescription") : `${t("analyze.liveDescription")}: ${company}`}
        </p>
      </div>
      <AnalysisVisualization company={company} mode={mode} demo={demo} />
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-[var(--muted-foreground)]">Loading...</div>}>
      <AnalyzeContent />
    </Suspense>
  );
}
