import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";
import type { School } from "@/types";
import { severityOf, SEVERITY_COLOR, severityLabel, type Metric, type SeverityThresholds } from "@/lib/severity";
import type { SchoolStat } from "@/lib/stats";
import type { RegionPick } from "./SchoolDeckLayer";
import {
  CAREER_SORT_BY_MODE,
  SCHOOL_LIST_SORT_OPTIONS,
  careerForSort,
  careerListValue,
  compareCareerSort,
  type SchoolListSortMode,
} from "@/lib/careerSort";
import { cn } from "@/lib/utils";
import { trackFilter } from "@/lib/analytics";

// 학교별 선도조치/보호조치 활용 라벨 (StatsDialog와 동일 경계).
// perCase: 선도조치는 가해자당, 보호조치는 피해자당 평균 조치 건수.
// 표본 부족도 라벨로 표현 — 라벨 부재 = violence 데이터 미수신만.
export type StrengthLabel = { label: string; color: string; bg: string; perCase?: number; tone: "good" | "neutral" | "warn" | "bad" | "muted" };

const NEUTRAL_LABEL = (label: string): StrengthLabel => ({ label, color: "#475569", bg: "#e2e8f0", tone: "muted" });

export function computeSchoolStrengthLabels(s: School): { discipline: StrengthLabel | null; protection: StrengthLabel | null } {
  let perpMeasureSum = 0, cases = 0, victims = 0, perps = 0, victimMeasures = 0;
  let hasViolenceData = false;
  for (const y of Object.keys(s.violence)) {
    const v = s.violence[y];
    if (v == null) continue;
    hasViolenceData = true;
    if (v.cases) {
      cases += (v.cases.s1?.n ?? 0) + (v.cases.s2?.n ?? 0);
      victims += (v.cases.s1?.v ?? 0) + (v.cases.s2?.v ?? 0);
      perps += (v.cases.s1?.p ?? 0) + (v.cases.s2?.p ?? 0);
    }
    if (v.perpMeasures) {
      for (let i = 0; i < 9; i++) perpMeasureSum += v.perpMeasures[i] ?? 0;
    }
    if (v.victimMeasures) {
      for (let i = 0; i < 5; i++) victimMeasures += v.victimMeasures[i] ?? 0;
    }
  }
  if (!hasViolenceData) return { discipline: null, protection: null };

  // 처벌: 분모 = 가해 학생 수 (보호와 일관). 가해 1명당 평균 N개 처분 부여.
  let discipline: StrengthLabel;
  if (perps === 0) {
    discipline = NEUTRAL_LABEL("가해 없음");
  } else if (perps < 3) {
    discipline = NEUTRAL_LABEL(`표본 부족 (가해 ${perps}명)`);
  } else {
    const pc = perpMeasureSum / perps;
    if (pc < 0.5) discipline = { label: "부재", color: "#7f1d1d", bg: "#fee2e2", perCase: pc, tone: "bad" };
    else if (pc < 1.0) discipline = { label: "약함", color: "#854d0e", bg: "#fef9c3", perCase: pc, tone: "neutral" };
    else if (pc < 1.5) discipline = { label: "적극", color: "#065f46", bg: "#d1fae5", perCase: pc, tone: "good" };
    else discipline = { label: "매우 적극", color: "#14532d", bg: "#bbf7d0", perCase: pc, tone: "good" };
  }

  // 보호: 분모 = 피해 학생 수
  let protection: StrengthLabel;
  if (victims === 0) {
    protection = NEUTRAL_LABEL("피해 없음");
  } else if (victims < 3) {
    protection = NEUTRAL_LABEL(`표본 부족 (피해 ${victims}명)`);
  } else {
    const pc = victimMeasures / victims;
    if (pc < 0.5) protection = { label: "부재", color: "#7f1d1d", bg: "#fee2e2", perCase: pc, tone: "bad" };
    else if (pc < 1.0) protection = { label: "평균", color: "#854d0e", bg: "#fef9c3", perCase: pc, tone: "neutral" };
    else if (pc < 1.5) protection = { label: "두터움", color: "#065f46", bg: "#d1fae5", perCase: pc, tone: "good" };
    else protection = { label: "매우 두터움", color: "#14532d", bg: "#bbf7d0", perCase: pc, tone: "good" };
  }

  return { discipline, protection };
}

interface Props {
  region: RegionPick;
  schools: School[];
  stats: Map<string, SchoolStat>;
  metric: Metric;
  severityThresholds: SeverityThresholds;
  statsYear: string;
  selectedCode: string | null;
  onPickSchool: (s: School) => void;
  onClose: () => void;
}

export function RegionDetail({ region, schools, stats, metric, severityThresholds, statsYear, selectedCode, onPickSchool, onClose }: Props) {
  const [sortMode, setSortMode] = useState<SchoolListSortMode>("violence");
  const currentCareerSort = sortMode === "violence" ? null : CAREER_SORT_BY_MODE[sortMode];

  const inRegion = useMemo(() => {
    return schools.filter((s) => {
      if (region.type === "city") return s.city === region.key;
      if (region.type === "district") return `${s.city}|${s.district}` === region.key;
      return s.dongCode === region.key;
    });
  }, [schools, region]);

  const summary = useMemo(() => {
    let total = 0, rateSum = 0, rateCnt = 0, hasData = false;
    let perpMeasureSum = 0;
    let cases = 0, victimMeasures = 0, victims = 0, perps = 0;
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
          for (let i = 0; i < 9; i++) perpMeasureSum += v.perpMeasures[i] ?? 0;
        }
        if (v.victimMeasures) {
          for (let i = 0; i < 5; i++) victimMeasures += v.victimMeasures[i] ?? 0;
        }
      }
    }
    const avgRate = rateCnt > 0 ? rateSum / rateCnt : null;
    const disciplinePerPerp = perps > 0 ? perpMeasureSum / perps : null;
    const protectionPerVictim = victims > 0 ? victimMeasures / victims : null;
    return { total, avgRate, hasData, disciplinePerPerp, protectionPerVictim, cases, victims, perps };
  }, [inRegion, stats]);

  // 선도조치 라벨 (분모 = 가해 학생 수, 보호와 동일하게 활용도↑=good)
  const discStrength = useMemo(() => {
    if (summary.disciplinePerPerp == null || summary.perps < 5) return null;
    const p = summary.disciplinePerPerp;
    if (p < 0.5) return { label: "부재", color: "#7f1d1d", bg: "#fee2e2" };
    if (p < 1.0) return { label: "약함", color: "#854d0e", bg: "#fef9c3" };
    if (p < 1.5) return { label: "적극", color: "#065f46", bg: "#d1fae5" };
    return { label: "매우 적극", color: "#14532d", bg: "#bbf7d0" };
  }, [summary.disciplinePerPerp, summary.perps]);

  // 보호조치 라벨 (ProtectionStrengthCard와 동일 경계, 분모=피해 학생)
  const protStrength = useMemo(() => {
    if (summary.protectionPerVictim == null || summary.victims < 5) return null;
    const p = summary.protectionPerVictim;
    if (p < 0.5) return { label: "부재", color: "#7f1d1d", bg: "#fee2e2" };
    if (p < 1.0) return { label: "평균", color: "#854d0e", bg: "#fef9c3" };
    if (p < 1.5) return { label: "두터움", color: "#065f46", bg: "#d1fae5" };
    return { label: "매우 두터움", color: "#14532d", bg: "#bbf7d0" };
  }, [summary.protectionPerVictim, summary.victims]);

  const avgTotalPerSchool = inRegion.length > 0 ? summary.total / inRegion.length : 0;
  const sev = severityOf(metric, summary.avgRate, avgTotalPerSchool, summary.hasData, severityThresholds);
  const labels = severityLabel(metric, severityThresholds);
  const color = SEVERITY_COLOR[sev];

  const sorted = useMemo(() => {
    return [...inRegion].sort((a, b) => {
      const sa = stats.get(a.code);
      const sb = stats.get(b.code);
      if (sortMode !== "violence") return compareCareerSort(a, b, sortMode, statsYear);
      if (metric === "rate") {
        return (sb?.ratePer100 ?? -1) - (sa?.ratePer100 ?? -1);
      }
      return (sb?.total ?? 0) - (sa?.total ?? 0);
    });
  }, [inRegion, stats, metric, sortMode, statsYear]);

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
              <div className="text-[10px] text-muted-foreground">선도조치 (가해자당)</div>
              <div className="flex items-center gap-1.5">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none"
                  style={{ background: discStrength.bg, color: discStrength.color }}
                >
                  {discStrength.label}
                </span>
                <span className="tabular-nums text-[11px]">{summary.disciplinePerPerp!.toFixed(2)}건</span>
              </div>
            </div>
          )}
          {protStrength && (
            <div className="rounded bg-muted/50 p-2 flex flex-col gap-0.5">
              <div className="text-[10px] text-muted-foreground">보호조치 (피해자당)</div>
              <div className="flex items-center gap-1.5">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none"
                  style={{ background: protStrength.bg, color: protStrength.color }}
                >
                  {protStrength.label}
                </span>
                <span className="tabular-nums text-[11px]">{summary.protectionPerVictim!.toFixed(2)}건</span>
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <div className="text-muted-foreground text-xs min-w-0 truncate">
            학교 ({sorted.length.toLocaleString()}개)
            {sortMode === "violence"
              ? ` — ${metric === "rate" ? "비율" : "건수"} ↓`
              : ` — 진로 ${currentCareerSort?.asc ? "↑" : "↓"}`}
          </div>
          <select
            value={sortMode}
            onChange={(e) => {
              const next = e.target.value as SchoolListSortMode;
              setSortMode(next);
              trackFilter("region_list_sort", next);
            }}
            className="h-7 max-w-[150px] rounded-md border bg-background px-1.5 text-[11px] shrink-0"
            title="지역 학교 정렬"
          >
            {SCHOOL_LIST_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <ul className="flex flex-col gap-1 max-h-[40dvh] md:max-h-[50dvh] overflow-y-auto">
          {sorted.map((s) => {
            const st = stats.get(s.code);
            const ssev = severityOf(metric, st?.ratePer100 ?? null, st?.total ?? 0, st?.hasData ?? false, severityThresholds);
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
                      {sortMode !== "violence" ? careerListValue(s, sortMode, statsYear) : st?.hasData ? (
                        metric === "rate" && st.ratePer100 != null
                          ? `${st.ratePer100.toFixed(2)}/100명·년`
                          : `${st.total}건`
                      ) : "—"}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground pl-4 truncate flex items-center gap-1.5 flex-wrap">
                    <span>{s.kind}{s.studentTotal ? ` · ${s.studentTotal.toLocaleString()}명` : ""}</span>
                    {sortMode !== "violence" && careerForSort(s, statsYear)?.actualYear && (
                      <span>{careerForSort(s, statsYear)?.actualYear} 진로</span>
                    )}
                    {labels.discipline && (
                      <span
                        className="px-1 py-px rounded text-[9px] font-semibold leading-none"
                        style={{ background: labels.discipline.bg, color: labels.discipline.color }}
                        title={labels.discipline.perCase != null ? `가해 학생당 선도조치 ${labels.discipline.perCase.toFixed(2)}건` : undefined}
                      >
                        선도조치 {labels.discipline.label}
                      </span>
                    )}
                    {labels.protection && (
                      <span
                        className="px-1 py-px rounded text-[9px] font-semibold leading-none"
                        style={{ background: labels.protection.bg, color: labels.protection.color }}
                        title={labels.protection.perCase != null ? `피해 학생당 보호조치 ${labels.protection.perCase.toFixed(2)}건` : undefined}
                      >
                        보호조치 {labels.protection.label}
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
