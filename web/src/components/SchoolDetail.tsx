import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X } from "lucide-react";
import type { DataSet, School, SchoolDetails, SchoolPreventionEdu } from "@/types";
import { severityOf, SEVERITY_COLOR, severityLabel, type Metric } from "@/lib/severity";
import { schoolPercentile, verdictFromPercentile, type SchoolStat } from "@/lib/stats";
import { computeSchoolStrengthLabels } from "@/components/RegionDetail";
import { cn } from "@/lib/utils";
import { trackSection } from "@/lib/analytics";

interface Props {
  school: School;
  stat: SchoolStat;
  data: DataSet;
  metric: Metric;
  selectedTypes: Set<number>;
  onClose: () => void;
}

const KIND_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  초등: "default",
  중학: "secondary",
  고등: "outline",
};

// 학교폭력예방법 16조 (피해학생 보호조치) — 5개 + 마지막 인덱스(5)는 합계
const VICTIM_MEASURE_LABELS = [
  "심리상담·조언",
  "일시보호",
  "치료·치료요양",
  "학급교체",
  "그 밖의 필요한 조치",
];

// 학교 공시 데이터의 산술적 모순 탐지. 보정 없이 사용자에 안내만.
function detectDataInconsistencies(school: School, years: readonly string[]): string[] {
  const issues: string[] = [];
  for (const y of years) {
    const v = school.violence[y];
    if (!v?.cases) continue;
    const totalCases = (v.cases.s1?.n ?? 0) + (v.cases.s2?.n ?? 0);
    const typeSum = v.types.reduce((a, b) => a + b, 0);
    const victims = (v.cases.s1?.v ?? 0) + (v.cases.s2?.v ?? 0);
    const perps = (v.cases.s1?.p ?? 0) + (v.cases.s2?.p ?? 0);
    const perpMeasureSum = v.perpMeasures
      ? v.perpMeasures.slice(0, 9).reduce((a, b) => a + b, 0)
      : 0;
    const victimMeasureSum = v.victimMeasures
      ? v.victimMeasures.slice(0, 5).reduce((a, b) => a + b, 0)
      : 0;
    const otherTablesHaveData = typeSum > 0 || perpMeasureSum > 0 || victimMeasureSum > 0 || victims > 0 || perps > 0;

    // 가장 흔한 모순: 심의 결과 표 0건이나 다른 표에 데이터 있음
    if (totalCases === 0 && otherTablesHaveData) {
      const parts = [];
      if (typeSum > 0) parts.push(`유형별 ${typeSum}건`);
      if (perpMeasureSum > 0) parts.push(`선도조치 ${perpMeasureSum}건`);
      if (victimMeasureSum > 0) parts.push(`보호조치 ${victimMeasureSum}건`);
      if (perps > 0 && parts.length === 0) parts.push(`가해 ${perps}명`);
      issues.push(`${y}년 공시: 심의 결과 표는 0건이나 다른 표에 데이터 있음 (${parts.join(", ")}) — 학교가 심의 결과 표를 미입력한 것으로 보임. 실제 심의는 발생한 듯.`);
    }
    // 반대 모순: 심의는 있으나 유형 분류 모두 0
    if (totalCases > 0 && typeSum === 0) {
      issues.push(`${y}년 공시: 심의 ${totalCases}건이 있으나 폭력 유형 분류는 모두 0 (학교가 유형별 표 미입력)`);
    }
    // 가해/피해 학생 수가 모두 0인데 심의 있음
    if (totalCases > 0 && victims === 0 && perps === 0) {
      issues.push(`${y}년 공시: 심의 ${totalCases}건이 있으나 가해/피해 학생 수가 모두 0`);
    }
    // 주의: "가해 있고 선도 0건" / "피해 있고 보호 0건"은 심의위가 "조치 없음" 결정한
    // 정상 케이스(예방법 17조 단서)이므로 불일치로 보지 않음. 강도 라벨에서 "부재"로 표시.
  }
  return issues;
}

// 학교폭력예방법 17조 (가해학생 선도·교육조치) — 9개 + 마지막 인덱스(9)는 합계
const PERP_MEASURE_LABELS = [
  "1호 서면사과",
  "2호 접촉·협박·보복금지",
  "3호 학교봉사",
  "4호 사회봉사",
  "5호 특별교육·심리치료",
  "6호 출석정지",
  "7호 학급교체",
  "8호 전학",
  "9호 퇴학",
];

export function SchoolDetail({ school, stat, data, metric, selectedTypes, onClose }: Props) {
  const sev = severityOf(metric, stat.ratePer100, stat.total, stat.hasData);
  const color = SEVERITY_COLOR[sev];
  const labels = severityLabel(metric);

  const yearsArr = data.years;
  const yearTotals = yearsArr.map((y) => {
    const v = school.violence[y];
    if (!v) return null;
    let s = 0;
    for (const i of selectedTypes) s += v.types[i] ?? 0;
    return s;
  });
  const yearSelfResolved = yearsArr.map((y) => school.selfResolved?.[y]?.total ?? null);
  const maxYearTotal = Math.max(
    1,
    ...yearsArr.map((_, i) => (yearTotals[i] ?? 0) + (yearSelfResolved[i] ?? 0)),
  );
  const allTypesOn = selectedTypes.size === 8;

  const defaultYear = (() => {
    for (let i = yearsArr.length - 1; i >= 0; i--) {
      if (school.violence[yearsArr[i]]) return yearsArr[i];
    }
    return yearsArr[yearsArr.length - 1];
  })();
  const [selectedYear, setSelectedYear] = useState<string>(defaultYear);
  const selectedYearV = school.violence[selectedYear];
  const selectedYearSr = school.selfResolved?.[selectedYear];
  const selectedYearPe = school.preventionEdu?.[selectedYear];
  const maxTypeTotal = Math.max(1, ...(selectedYearV?.types ?? [0]));

  // 같은 학교종류 백분위 기반 verdict 칩
  const isAllZero = stat.hasData && stat.years === data.years.length && stat.total === 0 && (school.selfResolvedTotal ?? 0) === 0;
  const verdict = useMemo(() => {
    if (isAllZero) {
      return { label: "4년 연속 사건 0건", icon: "🟢", bg: "#dcfce7", fg: "#14532d" };
    }
    const peers = data.schools.filter((s) => s.kind === school.kind);
    const p = schoolPercentile(school, peers, school.kind);
    return p ? verdictFromPercentile(p.percentile, school.kind) : null;
  }, [data.schools, school, isAllZero]);

  return (
    <Card className="w-full gap-3 py-0 pb-4">
      <CardHeader className="sticky top-0 z-20 bg-card rounded-t-xl flex-row items-start justify-between gap-2 px-4 pt-4 pb-3 border-b">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-base min-w-0">
            <span
              className="size-3 rounded-full border border-white shadow-sm shrink-0"
              style={{ background: color }}
            />
            <span className="truncate">{school.name}</span>
            <Badge variant={KIND_VARIANT[school.kind]} className="shrink-0">
              {school.kind}
            </Badge>
            {school.foundation && (
              <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                {school.foundation}
              </Badge>
            )}
          </CardTitle>
          <span className="text-muted-foreground text-xs truncate">
            {school.city} {school.district}
            {school.addr ? ` · ${school.addr}` : ""}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mt-1 -mr-1">
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4">
        {/* 요약 */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="학생수" value={school.studentTotal?.toLocaleString() ?? "—"} />
          <Stat label="학급수" value={school.classTotal?.toString() ?? "—"} />
          <Stat label="교원" value={school.teachers?.toString() ?? "—"} />
        </div>

        {/* Verdict 칩 — 같은 학교종류 백분위 기준 */}
        {verdict && (
          <div
            className="rounded-md px-2 py-1.5 text-xs font-semibold flex items-center gap-2"
            style={{ background: verdict.bg, color: verdict.fg }}
          >
            <span className="text-base leading-none">{verdict.icon}</span>
            <div className="flex flex-col leading-tight">
              <span>{verdict.label}</span>
              <span className="text-[9px] font-normal opacity-75">전국 같은 학교종류 · 학생 100명·년 비율 기준</span>
            </div>
          </div>
        )}

        {/* 데이터 모순 경고 — 학교가 부분 입력한 케이스 */}
        {(() => {
          const issues = detectDataInconsistencies(school, data.years);
          if (issues.length === 0) return null;
          return (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-2 text-[11px] text-amber-900 dark:text-amber-200">
              <div className="font-semibold mb-0.5">⚠ 공시 데이터 불일치 안내</div>
              <ul className="list-disc list-inside space-y-0.5">
                {issues.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
              <div className="mt-1 text-[10px] opacity-75">학교가 학교알리미에 항목별로 부분 입력한 경우입니다. 보정 없이 원본 그대로 표시하므로 해석에 주의.</div>
            </div>
          );
        })()}

        {/* 처벌·보호 강도 (4년 누계 기준, 연도 선택과 무관) */}
        {(() => {
          const labels = computeSchoolStrengthLabels(school);
          if (!labels.discipline && !labels.protection) return null;
          return (
            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
              {labels.discipline && (
                <span
                  className="px-1.5 py-0.5 rounded font-semibold leading-none"
                  style={{ background: labels.discipline.bg, color: labels.discipline.color }}
                  title={labels.discipline.pct != null ? `강한 처벌(6~9호) 비율 ${labels.discipline.pct.toFixed(1)}%` : undefined}
                >
                  처벌 강도: {labels.discipline.label}{labels.discipline.pct != null && ` (${labels.discipline.pct.toFixed(0)}%)`}
                </span>
              )}
              {labels.protection && (
                <span
                  className="px-1.5 py-0.5 rounded font-semibold leading-none"
                  style={{ background: labels.protection.bg, color: labels.protection.color }}
                  title={labels.protection.perCase != null ? `피해 학생당 보호조치 ${labels.protection.perCase.toFixed(2)}건 (전국 평균 ~0.56)` : undefined}
                >
                  보호 강도: {labels.protection.label}{labels.protection.perCase != null && ` (${labels.protection.perCase.toFixed(2)}건/피해자)`}
                </span>
              )}
            </div>
          );
        })()}

        {/* 학폭 요약 */}
        <div
          className="rounded-md border p-2 text-xs"
          style={{ borderColor: color }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-medium">{labels[sev]}</span>
            <span className="text-[10px] text-muted-foreground">
              {metric === "rate" ? "비율 기준" : "건수 기준"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded bg-muted/50 p-1.5">
              <div className="text-[10px] text-muted-foreground">
                {allTypesOn ? "전체 4년 (심의+자체)" : "심의 4년 · 선택"}
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {stat.hasData ? `${stat.total}건` : "—"}
              </div>
            </div>
            <div className="rounded bg-muted/50 p-1.5">
              <div className="text-[10px] text-muted-foreground">그중 자체해결 4년</div>
              <div className="text-sm font-semibold tabular-nums">
                {school.selfResolvedTotal != null ? `${school.selfResolvedTotal}건` : "—"}
              </div>
            </div>
            <div className="rounded bg-muted/50 p-1.5">
              <div className="text-[10px] text-muted-foreground">학생100명/년</div>
              <div className="text-sm font-semibold tabular-nums">
                {stat.ratePer100 != null ? stat.ratePer100.toFixed(2) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* 년도별 막대 (심의 + 자체해결 stacked) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-muted-foreground text-xs">
              공시년도별 {!allTypesOn && <span>· 선택 유형</span>}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm" style={{ background: color }} />심의
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm" style={{ background: color, opacity: 0.35 }} />자체
              </span>
            </div>
          </div>
          <div className="flex items-end gap-1.5 h-24 px-0.5">
            {yearsArr.map((y, idx) => {
              const t = yearTotals[idx];
              const sr = yearSelfResolved[idx];
              const sum = (t ?? 0) + (sr ?? 0);
              const heightTotal = (sum / maxYearTotal) * 64;
              const hViolence = t != null ? Math.max(t > 0 ? 2 : 0, (t / maxYearTotal) * 64) : 0;
              const hSelf = sr != null ? Math.max(sr > 0 ? 2 : 0, (sr / maxYearTotal) * 64) : 0;
              const isActive = y === selectedYear;
              const hasData = !!school.violence[y] || !!school.selfResolved?.[y];
              return (
                <button
                  type="button"
                  key={y}
                  onClick={() => hasData && setSelectedYear(y)}
                  disabled={!hasData}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 transition-all rounded-sm p-0.5",
                    hasData ? "cursor-pointer hover:bg-accent/50" : "cursor-not-allowed",
                    isActive && hasData && "bg-accent ring-1 ring-foreground/20",
                  )}
                >
                  <div className="text-[10px] tabular-nums leading-none h-3">
                    {t != null || sr != null
                      ? (sr ? `${t ?? 0}+${sr}` : `${t ?? 0}`)
                      : "—"}
                  </div>
                  <div className="w-full flex flex-col-reverse" style={{ height: Math.max(0, heightTotal) }}>
                    {hViolence > 0 && (
                      <div
                        className="w-full transition-all"
                        style={{
                          height: hViolence,
                          background: color,
                          opacity: isActive ? 1 : 0.7,
                          borderTopLeftRadius: hSelf > 0 ? 0 : 2,
                          borderTopRightRadius: hSelf > 0 ? 0 : 2,
                        }}
                      />
                    )}
                    {hSelf > 0 && (
                      <div
                        className="w-full transition-all rounded-t-sm"
                        style={{ height: hSelf, background: color, opacity: 0.35 }}
                      />
                    )}
                    {hViolence === 0 && hSelf === 0 && hasData && (
                      <div className="w-full h-0.5" style={{ background: color, opacity: 0.4 }} />
                    )}
                  </div>
                  <div className={cn("text-[10px]", isActive ? "text-foreground font-semibold" : "text-muted-foreground")}>
                    {y}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 유형별 (선택된 년도) */}
        {selectedYearV && (
          <div>
            <div className="text-muted-foreground mb-1.5 text-xs">
              {selectedYear}공시 유형별
            </div>
            <div className="flex flex-col gap-1">
              {data.typeLabels.map((label, i) => {
                const cnt = selectedYearV.types[i] ?? 0;
                const w = (cnt / maxTypeTotal) * 100;
                const isSelType = selectedTypes.has(i);
                return (
                  <div
                    key={label}
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      !isSelType && "opacity-40",
                    )}
                  >
                    <div className="w-14 text-muted-foreground">{label}</div>
                    <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                      <div
                        className="h-full rounded-sm"
                        style={{ width: `${w}%`, background: color, opacity: cnt > 0 ? 0.85 : 0.1 }}
                      />
                    </div>
                    <div className="w-6 text-right tabular-nums">{cnt}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 자체해결 (선택된 년도) */}
        {selectedYearSr && (
          <div className="rounded-md border bg-muted/20 p-2 text-xs">
            <div className="text-muted-foreground mb-1.5">
              {selectedYear}공시 자체해결 <span className="text-[10px]">(심의위 회부 없이 학교 자체)</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <Stat label="1학기" value={`${selectedYearSr.s1}건`} />
              <Stat label="2학기" value={`${selectedYearSr.s2}건`} />
              <Stat label="합계" value={`${selectedYearSr.total}건`} />
            </div>
          </div>
        )}

        {/* 가해/피해 학생 (심의 기준, 선택된 년도) */}
        {selectedYearV?.cases && (() => {
          const c = selectedYearV.cases;
          const v = (c.s1?.v ?? 0) + (c.s2?.v ?? 0);
          const p = (c.s1?.p ?? 0) + (c.s2?.p ?? 0);
          if (v === 0 && p === 0) return null;
          return (
            <div className="rounded-md border bg-muted/20 p-2 text-xs">
              <div className="text-muted-foreground mb-1.5">
                {selectedYear}공시 가해·피해 학생 수 <span className="text-[10px]">(심의 4년 합산 기준이 아닌 해당년)</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Stat label="피해 학생" value={`${v}명`} />
                <Stat label="가해 학생" value={`${p}명`} />
              </div>
              {p > v && (
                <div className="mt-1 text-[10px] text-muted-foreground">가해 &gt; 피해 → 집단 가해(다대일) 사안 가능성</div>
              )}
              {v > p && (
                <div className="mt-1 text-[10px] text-muted-foreground">피해 &gt; 가해 → 집단 피해(일대다) 사안 가능성</div>
              )}
            </div>
          );
        })()}

        {/* 피해학생 보호조치 (선택 연도) */}
        {selectedYearV?.victimMeasures && selectedYearV.victimMeasures.some((n) => n > 0) && (
          <div className="rounded-md border bg-muted/20 p-2 text-xs">
            <div className="text-muted-foreground mb-1.5">
              {selectedYear}공시 피해학생 보호조치 <span className="text-[10px]">(학교폭력예방법 16조, 중복 가능)</span>
            </div>
            <div className="flex flex-col gap-1">
              {VICTIM_MEASURE_LABELS.map((label, i) => {
                const cnt = selectedYearV.victimMeasures?.[i] ?? 0;
                if (cnt === 0) return null;
                return (
                  <div key={label} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="tabular-nums">{cnt}건</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 가해학생 선도조치 (선택 연도) */}
        {selectedYearV?.perpMeasures && selectedYearV.perpMeasures.some((n) => n > 0) && (
          <div className="rounded-md border bg-muted/20 p-2 text-xs">
            <div className="text-muted-foreground mb-1.5">
              {selectedYear}공시 가해학생 선도·교육조치 <span className="text-[10px]">(학교폭력예방법 17조, 중복 가능)</span>
            </div>
            <div className="flex flex-col gap-1">
              {PERP_MEASURE_LABELS.map((label, i) => {
                const cnt = selectedYearV.perpMeasures?.[i] ?? 0;
                if (cnt === 0) return null;
                const severity = i; // 0=가벼움 → 9=무거움
                const isHeavy = severity >= 5;
                return (
                  <div key={label} className="flex items-center justify-between text-[11px]">
                    <span className={cn("text-muted-foreground", isHeavy && "text-red-700 dark:text-red-400 font-medium")}>{label}</span>
                    <span className={cn("tabular-nums", isHeavy && "text-red-700 dark:text-red-400 font-semibold")}>{cnt}건</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 예방교육 (선택된 년도) */}
        {selectedYearPe && (
          <div className="rounded-md border p-2 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-muted-foreground">{selectedYear}공시 예방교육·연수</span>
              {school.schoolinfoUuid && (
                <a
                  href={`https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=${school.schoolinfoUuid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                >
                  학교알리미 원본 ↗
                </a>
              )}
            </div>
            <PreventionSummary pe={selectedYearPe} />
          </div>
        )}

        {/* 공시 정보 */}
        {school.details && (
          <>
            <Separator />
            <DetailsSections details={school.details} color={color} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PreventionSummary({ pe }: { pe: SchoolPreventionEdu }) {
  const items: { label: string; value: string }[] = [];
  if (pe.teacherSessions != null) {
    const parts = [`${pe.teacherSessions}회`];
    if (pe.teacherParticipants != null) parts.push(`${pe.teacherParticipants.toLocaleString()}명 참여`);
    if (pe.teacherRate != null) parts.push(`참여율 ${pe.teacherRate}%`);
    items.push({ label: "교원 정규수업", value: parts.join(" · ") });
  }
  if (pe.parentSessions != null) {
    items.push({ label: "학부모 교육", value: `${pe.parentSessions}회 실시` });
  }
  if (pe.staffTeachers != null || pe.staffStudents != null) {
    const parts: string[] = [];
    if (pe.staffTeachers) parts.push(`지도교사 누적 ${pe.staffTeachers.toLocaleString()}명`);
    if (pe.staffStudents) parts.push(`참여학생 누적 ${pe.staffStudents.toLocaleString()}명`);
    items.push({ label: "교원·학부모 연수", value: parts.join(" · ") || "—" });
  }
  if (pe.progTeachers != null || pe.progStudents != null) {
    const parts: string[] = [];
    if (pe.progTeachers) parts.push(`지도교사 누적 ${pe.progTeachers.toLocaleString()}명`);
    if (pe.progStudents) parts.push(`참여학생 누적 ${pe.progStudents.toLocaleString()}명`);
    items.push({ label: "예방프로그램", value: parts.join(" · ") || "—" });
  }
  if (items.length === 0) return <div className="text-[10px] text-muted-foreground">표시할 데이터 없음</div>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-[10px] shrink-0">{it.label}</span>
          <span className="text-[11px] tabular-nums text-right">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="text-muted-foreground text-[10px]">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ─── 공시 정보 ────────────────────────────────────────
const fmtNum = (n: number | null | undefined): string => (n == null ? "—" : n.toLocaleString());
const fmtAmt = (n: number | null | undefined): string =>
  n == null ? "—" : `${(n / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })}만원`;

function DetailsSections({ details, color }: { details: SchoolDetails; color: string }) {
  const openRef = useRef<Set<string> | null>(null);
  type Section = { key: string; title: string; body: React.ReactNode };
  const sections: Section[] = [];

  if (details.studentTrend?.length) {
    const max = Math.max(1, ...details.studentTrend.map((t) => t.total));
    sections.push({
      key: "trend",
      title: "학생수 추이",
      body: (
        <div className="flex items-end gap-1.5 h-24 px-0.5">
          {details.studentTrend.map((t) => {
            const h = Math.max(2, (t.total / max) * 60);
            return (
              <div key={t.year} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] tabular-nums leading-none h-3">{t.total.toLocaleString()}</div>
                <div className="w-full rounded-sm" style={{ height: h, background: color, opacity: 0.7 }} />
                <div className="text-[10px] text-muted-foreground leading-none">{t.year}</div>
              </div>
            );
          })}
        </div>
      ),
    });
  }

  if (details.grades?.length) {
    sections.push({
      key: "grades",
      title: "학년별 학급/학생",
      body: (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 px-2">학년</TableHead>
              <TableHead className="h-7 px-2 text-right">학급</TableHead>
              <TableHead className="h-7 px-2 text-right">학생</TableHead>
              <TableHead className="h-7 px-2 text-right">학급당</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {details.grades.map((g) => (
              <TableRow key={g.label}>
                <TableCell className="py-1 px-2">{g.label}</TableCell>
                <TableCell className="py-1 px-2 text-right tabular-nums">{fmtNum(g.classes)}</TableCell>
                <TableCell className="py-1 px-2 text-right tabular-nums">{fmtNum(g.students)}</TableCell>
                <TableCell className="py-1 px-2 text-right tabular-nums">{fmtNum(g.perClass)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ),
    });
  }


  if (details.teaching) {
    const t = details.teaching;
    sections.push({
      key: "teaching",
      title: "수업·교사",
      body: <KV pairs={trim([
        ["총 교사", suffix(t.teachers, "명")],
        ["주당 총수업", suffix(t.weeklyHours, "시간")],
        ["교사 1인당 주당", suffix(t.daysPerWeek, "시간")],
      ])} />,
    });
  }

  if (details.facility) {
    const f = details.facility;
    sections.push({
      key: "facility",
      title: "시설",
      body: <KV pairs={trim([
        ["일반교실", suffix(f.regularClassrooms, "실")],
        ["특별교실", suffix(f.specialClassrooms, "실")],
        ["교과교실", suffix(f.subjectClassrooms, "실")],
        ["남자 화장실", suffix(f.maleToilets, "개")],
        ["여자 화장실", suffix(f.femaleToilets, "개")],
        ["샤워실", suffix(f.showers, "실")],
        ["체육관", suffix(f.gym, "실")],
        ["강당", suffix(f.auditorium, "실")],
        ["수영장", f.pool ?? "—"],
        ["진로상담실", suffix(f.careerRoom, "실")],
        ["기숙사 수용", suffix(f.boardingCapacity, "명")],
      ])} />,
    });
  }

  if (details.land) {
    const l = details.land;
    sections.push({
      key: "land",
      title: "학교 환경",
      body: <KV pairs={trim([
        ["전체 부지", l.totalArea ? `${l.totalArea.toLocaleString()} m²` : "—"],
        ["교사 대지", l.schoolGround ? `${l.schoolGround.toLocaleString()} m²` : "—"],
        ["체육장", l.sportsGround ? `${l.sportsGround.toLocaleString()} m²` : "—"],
        ["부속 토지", l.extraLand ? `${l.extraLand.toLocaleString()} m²` : "—"],
        ["학생 1인당 체육장", l.sportsPerStudent != null ? `${l.sportsPerStudent} m²` : "—"],
      ])} />,
    });
  }

  if (details.openness) {
    const o = details.openness;
    const yn = (b: boolean | undefined) => b ? "개방" : "—";
    sections.push({
      key: "openness",
      title: "시설 개방 (지역사회 이용)",
      body: <KV pairs={trim([
        ["체육장", yn(o.sports)],
        ["체육관", yn(o.gym)],
        ["강당", yn(o.auditorium)],
        ["일반교실", yn(o.classroom)],
        ["특별교실", yn(o.specialClassroom)],
        ["시청각실", yn(o.avRoom)],
      ])} />,
    });
  }

  if (details.disability) {
    const dis = details.disability;
    sections.push({
      key: "disability",
      title: `장애인 편의시설 (${dis.installedCount}/${dis.totalChecks})`,
      body: (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {dis.items.map((it) => (
            <div key={it.label} className="contents">
              <div className="text-muted-foreground">{it.label}</div>
              <div className="text-right">{it.installed ? "✓" : "—"}</div>
            </div>
          ))}
        </div>
      ),
    });
  }

  if (details.meal) {
    const m = details.meal;
    sections.push({
      key: "meal",
      title: "급식",
      body: <KV pairs={trim([
        ["급식 학생수", suffix(m.students, "명")],
        ["영양(교)사", suffix(m.nutritionists, "명")],
        ["조리사", suffix(m.cooks, "명")],
        ["조리원", suffix(m.cookAssistants, "명")],
        ["운영방식", m.operationMethod ?? "—"],
      ])} />,
    });
  }

  if (details.health) {
    const h = details.health;
    sections.push({
      key: "health",
      title: "보건실 이용",
      body: <KV pairs={trim([
        ["연간 이용건수", suffix(h.annualVisits, "건")],
        ["1인당 연 이용", suffix(h.perStudentVisits, "건")],
      ])} />,
    });
  }

  if (details.safetyEducation) {
    const cats = Object.entries(details.safetyEducation);
    const maxTotal = Math.max(1, ...cats.map(([, v]) => v.total ?? 0));
    sections.push({
      key: "safety",
      title: "안전교육",
      body: (
        <div className="flex flex-col gap-1">
          {cats.map(([cat, v]) => {
            const w = ((v.total ?? 0) / maxTotal) * 100;
            return (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <div className="w-20 text-muted-foreground truncate">{cat}</div>
                <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                  <div className="h-full" style={{ width: `${w}%`, background: color, opacity: 0.7 }} />
                </div>
                <div className="w-12 text-right tabular-nums">{fmtNum(v.total)}h</div>
              </div>
            );
          })}
        </div>
      ),
    });
  }

  if (details.activities) {
    const a = details.activities;
    sections.push({
      key: "activities",
      title: "동아리 활동",
      body: <KV pairs={trim([
        ["창의적체험 동아리 학생수", suffix(a.creativeStudents, "명")],
        ["창체 지도교사", suffix(a.creativeTeachers, "명")],
        ["외부강사", suffix(a.creativeExternalLecturers, "명")],
        ["창체 예산", fmtAmt(a.creativeBudget)],
        ["학생자율 동아리 수", suffix(a.clubs, "개")],
        ["자율동아리 예산", fmtAmt(a.clubBudget)],
      ])} />,
    });
  }

  if (details.afterSchool) {
    const a = details.afterSchool;
    sections.push({
      key: "after",
      title: "방과후·돌봄",
      body: <KV pairs={trim([
        ["방과후 프로그램", suffix(a.programs, "개")],
        ["방과후 학생", suffix(a.students, "명")],
        ["수익자 부담금", fmtAmt(a.burdenAmount)],
        ["돌봄 교실", suffix(a.careRooms, "실")],
        ["돌봄 학생", suffix(a.careStudents, "명")],
      ])} />,
    });
  }

  if (details.scholarship) {
    const s = details.scholarship;
    sections.push({
      key: "scholarship",
      title: "장학금·학비지원",
      body: <KV pairs={trim([
        ["장학금 (인원/금액)", `${fmtNum(s.schoCount)} / ${fmtAmt(s.schoAmount)}`],
        ["학비지원 (인원/금액)", `${fmtNum(s.aidCount)} / ${fmtAmt(s.aidAmount)}`],
        ["합계 (인원/금액)", `${fmtNum(s.totalCount)} / ${fmtAmt(s.totalAmount)}`],
      ])} />,
    });
  }

  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-muted-foreground text-xs">공시 정보</div>
      <Accordion
        type="multiple"
        defaultValue={sections.map((s) => s.key)}
        onValueChange={(open) => {
          // 새로 열린 섹션만 트래킹 (이전 set과의 diff)
          const prev = openRef.current ?? new Set(sections.map((s) => s.key));
          const now = new Set(open);
          for (const k of now) if (!prev.has(k)) trackSection(k);
          openRef.current = now;
        }}
        className="w-full"
      >
        {sections.map((s) => (
          <AccordionItem key={s.key} value={s.key} className="last:border-b">
            <AccordionTrigger className="py-2 text-xs font-medium hover:no-underline">
              {s.title}
            </AccordionTrigger>
            <AccordionContent className="pb-3">{s.body}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function suffix(n: number | null | undefined, unit: string): string {
  return n == null ? "—" : `${fmtNum(n)}${unit}`;
}
function trim(pairs: [string, string][]): [string, string][] {
  return pairs.filter(([, v]) => v !== "—");
}

function KV({ pairs }: { pairs: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {pairs.map(([k, v]) => (
        <div key={k} className="contents">
          <div className="text-muted-foreground">{k}</div>
          <div className="text-right tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}
