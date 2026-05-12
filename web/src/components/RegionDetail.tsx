import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";
import type { School } from "@/types";
import { severityOf, SEVERITY_COLOR, severityLabel, type Metric } from "@/lib/severity";
import type { SchoolStat } from "@/lib/stats";
import type { RegionPick } from "./SchoolDeckLayer";
import { cn } from "@/lib/utils";

// 학교별 처벌·보호 강도 라벨 (StatsDialog와 동일 경계)
export function computeSchoolStrengthLabels(s: School) {
  let perpTotal = 0, perpHeavy = 0, cases = 0, victimMeasures = 0;
  for (const y of Object.keys(s.violence)) {
    const v = s.violence[y];
    if (!v) continue;
    if (v.cases) cases += (v.cases.s1?.n ?? 0) + (v.cases.s2?.n ?? 0);
    if (v.perpMeasures) {
      for (let i = 0; i < 9; i++) perpTotal += v.perpMeasures[i] ?? 0;
      for (let i = 5; i < 9; i++) perpHeavy += v.perpMeasures[i] ?? 0;
    }
    if (v.victimMeasures) {
      for (let i = 0; i < 5; i++) victimMeasures += v.victimMeasures[i] ?? 0;
    }
  }
  let discipline = null;
  if (perpTotal >= 5) {
    const p = (perpHeavy / perpTotal) * 100;
    if (p < 5) discipline = { label: "약함", color: "#065f46", bg: "#d1fae5", pct: p };
    else if (p < 15) discipline = { label: "보통", color: "#854d0e", bg: "#fef9c3", pct: p };
    else if (p < 30) discipline = { label: "강함", color: "#9a3412", bg: "#ffedd5", pct: p };
    else discipline = { label: "매우 강함", color: "#7f1d1d", bg: "#fee2e2", pct: p };
  }
  let protection = null;
  if (cases >= 3) {
    const pc = victimMeasures / cases;
    if (pc < 0.5) protection = { label: "부재", color: "#7f1d1d", bg: "#fee2e2", perCase: pc };
    else if (pc < 1.0) protection = { label: "평균", color: "#854d0e", bg: "#fef9c3", perCase: pc };
    else if (pc < 1.5) protection = { label: "두터움", color: "#065f46", bg: "#d1fae5", perCase: pc };
    else protection = { label: "매우 두터움", color: "#14532d", bg: "#bbf7d0", perCase: pc };
  }
  return { discipline, protection };
}

interface Props {
  region: RegionPick;
  schools: School[];
  stats: Map<string, SchoolStat>;
  metric: Metric;
  selectedCode: string | null;
  onPickSchool: (s: School) => void;
  onClose: () => void;
}

export function RegionDetail({ region, schools, stats, metric, selectedCode, onPickSchool, onClose }: Props) {
  const inRegion = useMemo(() => {
    return schools.filter((s) => {
      if (region.type === "city") return s.city === region.key;
      if (region.type === "district") return `${s.city}|${s.district}` === region.key;
      return s.dongCode === region.key;
    });
  }, [schools, region]);

  const summary = useMemo(() => {
    let total = 0, rateSum = 0, rateCnt = 0, hasData = false;
    let perpTotal = 0, perpHeavy = 0;
    let cases = 0, victimMeasures = 0;
    let victims = 0, perps = 0;
    for (const s of inRegion) {
      const st = stats.get(s.code);
      if (st) {
        total += st.total;
        if (st.ratePer100 != null) {
          rateSum += st.ratePer100;
          rateCnt++;
        }
        if (st.hasData) hasData = true;
      }
      // 처벌·보호·가해/피해 누계
      for (const y of Object.keys(s.violence)) {
        const v = s.violence[y];
        if (!v) continue;
        if (v.cases) {
          cases += (v.cases.s1?.n ?? 0) + (v.cases.s2?.n ?? 0);
          victims += (v.cases.s1?.v ?? 0) + (v.cases.s2?.v ?? 0);
          perps += (v.cases.s1?.p ?? 0) + (v.cases.s2?.p ?? 0);
        }
        if (v.perpMeasures) {
          for (let i = 0; i < 9; i++) perpTotal += v.perpMeasures[i] ?? 0;
          for (let i = 5; i < 9; i++) perpHeavy += v.perpMeasures[i] ?? 0;
        }
        if (v.victimMeasures) {
          for (let i = 0; i < 5; i++) victimMeasures += v.victimMeasures[i] ?? 0;
        }
      }
    }
    const avgRate = rateCnt > 0 ? rateSum / rateCnt : null;
    const heavyPct = perpTotal > 0 ? (perpHeavy / perpTotal) * 100 : null;
    const protectionPerCase = cases > 0 ? victimMeasures / cases : null;
    return { total, avgRate, hasData, heavyPct, protectionPerCase, cases, victims, perps };
  }, [inRegion, stats]);

  // 처벌 강도 라벨 (DisciplineStrengthCard와 동일 경계)
  const discStrength = useMemo(() => {
    if (summary.heavyPct == null) return null;
    const p = summary.heavyPct;
    if (p < 5) return { label: "약함", color: "#065f46", bg: "#d1fae5" };
    if (p < 15) return { label: "보통", color: "#854d0e", bg: "#fef9c3" };
    if (p < 30) return { label: "강함", color: "#9a3412", bg: "#ffedd5" };
    return { label: "매우 강함", color: "#7f1d1d", bg: "#fee2e2" };
  }, [summary.heavyPct]);

  // 보호 강도 라벨 (ProtectionStrengthCard와 동일 경계)
  const protStrength = useMemo(() => {
    if (summary.protectionPerCase == null || summary.cases < 5) return null;
    const p = summary.protectionPerCase;
    if (p < 0.5) return { label: "부재", color: "#7f1d1d", bg: "#fee2e2" };
    if (p < 1.0) return { label: "평균", color: "#854d0e", bg: "#fef9c3" };
    if (p < 1.5) return { label: "두터움", color: "#065f46", bg: "#d1fae5" };
    return { label: "매우 두터움", color: "#14532d", bg: "#bbf7d0" };
  }, [summary.protectionPerCase, summary.cases]);

  const avgTotalPerSchool = inRegion.length > 0 ? summary.total / inRegion.length : 0;
  const sev = severityOf(metric, summary.avgRate, avgTotalPerSchool, summary.hasData);
  const labels = severityLabel(metric);
  const color = SEVERITY_COLOR[sev];

  const sorted = useMemo(() => {
    return [...inRegion].sort((a, b) => {
      const sa = stats.get(a.code);
      const sb = stats.get(b.code);
      if (metric === "rate") {
        return (sb?.ratePer100 ?? -1) - (sa?.ratePer100 ?? -1);
      }
      return (sb?.total ?? 0) - (sa?.total ?? 0);
    });
  }, [inRegion, stats, metric]);

  const TYPE_LABEL = { city: "시", district: "구", dong: "동" }[region.type];

  return (
    <Card className="w-full gap-3 py-0 pb-4">
      <CardHeader className="sticky top-0 z-20 bg-card rounded-t-xl flex-row items-start justify-between gap-2 px-4 pt-4 pb-3 border-b">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-base min-w-0">
            <span
              className="size-3 rounded-full border border-white shadow-sm shrink-0"
              style={{ background: color }}
            />
            <span className="truncate">{region.label}</span>
            <Badge variant="outline" className="shrink-0">{TYPE_LABEL}</Badge>
          </CardTitle>
          <span className="text-muted-foreground text-xs truncate">
            학교 {inRegion.length}개 · {labels[sev]}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mt-1 -mr-1">
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded bg-muted/50 p-2">
            <div className="text-[10px] text-muted-foreground">학교 수</div>
            <div className="text-sm font-semibold tabular-nums">{inRegion.length}</div>
          </div>
          <div className="rounded bg-muted/50 p-2">
            <div className="text-[10px] text-muted-foreground">4년 합계 사건</div>
            <div className="text-sm font-semibold tabular-nums">{summary.total.toLocaleString()}건</div>
          </div>
          <div className="rounded bg-muted/50 p-2 col-span-2">
            <div className="text-[10px] text-muted-foreground">평균 비율 (학생100명·년)</div>
            <div className="text-sm font-semibold tabular-nums">
              {summary.avgRate != null ? summary.avgRate.toFixed(2) : "—"}
            </div>
          </div>
          {(summary.victims > 0 || summary.perps > 0) && (
            <>
              <div className="rounded bg-muted/50 p-2">
                <div className="text-[10px] text-muted-foreground">피해 학생</div>
                <div className="text-sm font-semibold tabular-nums">{summary.victims.toLocaleString()}명</div>
              </div>
              <div className="rounded bg-muted/50 p-2">
                <div className="text-[10px] text-muted-foreground">가해 학생</div>
                <div className="text-sm font-semibold tabular-nums">{summary.perps.toLocaleString()}명</div>
              </div>
            </>
          )}
          {discStrength && (
            <div className="rounded bg-muted/50 p-2 flex flex-col gap-0.5">
              <div className="text-[10px] text-muted-foreground">처벌 강도 (6~9호 비율)</div>
              <div className="flex items-center gap-1.5">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none"
                  style={{ background: discStrength.bg, color: discStrength.color }}
                >
                  {discStrength.label}
                </span>
                <span className="tabular-nums text-[11px]">{summary.heavyPct!.toFixed(1)}%</span>
              </div>
            </div>
          )}
          {protStrength && (
            <div className="rounded bg-muted/50 p-2 flex flex-col gap-0.5">
              <div className="text-[10px] text-muted-foreground">보호 강도 (사안당)</div>
              <div className="flex items-center gap-1.5">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none"
                  style={{ background: protStrength.bg, color: protStrength.color }}
                >
                  {protStrength.label}
                </span>
                <span className="tabular-nums text-[11px]">{summary.protectionPerCase!.toFixed(2)}건</span>
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="text-muted-foreground text-xs">
          학교 ({sorted.length.toLocaleString()}개) — {metric === "rate" ? "비율" : "건수"} ↓
        </div>
        <ul className="flex flex-col gap-1 max-h-[40dvh] md:max-h-[50dvh] overflow-y-auto">
          {sorted.map((s) => {
            const st = stats.get(s.code);
            const ssev = severityOf(metric, st?.ratePer100 ?? null, st?.total ?? 0, st?.hasData ?? false);
            const isSel = selectedCode === s.code;
            const labels = computeSchoolStrengthLabels(s);
            return (
              <li key={s.code}>
                <button
                  type="button"
                  onClick={() => onPickSchool(s)}
                  className={cn(
                    "w-full text-left rounded-md border px-2 py-1.5 hover:bg-accent transition-colors",
                    isSel && "bg-accent border-foreground/30",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full border border-white shadow-sm shrink-0"
                      style={{ background: SEVERITY_COLOR[ssev] }}
                    />
                    <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {st?.hasData ? (
                        metric === "rate" && st.ratePer100 != null
                          ? `${st.ratePer100.toFixed(2)}/100명·년`
                          : `${st.total}건`
                      ) : "—"}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground pl-4 truncate flex items-center gap-1.5 flex-wrap">
                    <span>{s.kind}{s.studentTotal ? ` · ${s.studentTotal.toLocaleString()}명` : ""}</span>
                    {labels.discipline && (
                      <span
                        className="px-1 py-px rounded text-[9px] font-semibold leading-none"
                        style={{ background: labels.discipline.bg, color: labels.discipline.color }}
                        title={`강한 처벌(6~9호) 비율 ${labels.discipline.pct.toFixed(0)}%`}
                      >
                        처벌 {labels.discipline.label}
                      </span>
                    )}
                    {labels.protection && (
                      <span
                        className="px-1 py-px rounded text-[9px] font-semibold leading-none"
                        style={{ background: labels.protection.bg, color: labels.protection.color }}
                        title={`사안당 보호조치 ${labels.protection.perCase.toFixed(2)}건`}
                      >
                        보호 {labels.protection.label}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
          {sorted.length === 0 && (
            <li className="text-center text-xs text-muted-foreground py-4">학교 없음</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
