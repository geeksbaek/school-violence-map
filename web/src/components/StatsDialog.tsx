import { useCallback, useMemo, useState, createContext, useContext } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { DataSet, School } from "@/types";
import {
  computeAggregates, schoolPercentile, sizeBucket, verdictFromPercentile,
  trendBucket, studentPerTeacherBucket,
  type SegmentStat, type SizeBucket, type TrendBucket, type RatioBucket,
} from "@/lib/stats";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: DataSet;
  selected: School | null;
  statsYear?: string; // "all" or a specific year
  onPick?: (s: School) => void; // 통계 카드의 학교 링크 클릭 → 이동
}

const KIND_ORDER = ["초등", "중학", "고등"] as const;
const SIZE_ORDER: SizeBucket[] = ["<200", "200–500", "500–1000", "1000+"];
const FOUND_ORDER = ["공립", "사립", "국립"] as const;
const SUDOGWON = new Set(["서울특별시", "인천광역시", "경기도"]);

type Scope = "전국" | "수도권";

export function StatsDialog({ open, onOpenChange, data, selected, statsYear = "all", onPick }: Props) {
  const [scope, setScope] = useState<Scope>("전국");
  const [pendingPick, setPendingPick] = useState<School | null>(null);

  const requestPick = useCallback((s: School) => {
    if (s.code === selected?.code) return;
    // SchoolLink가 단일 연도로 잘린 인스턴스를 전달할 수 있으므로 원본에서 다시 찾음
    const original = data.schools.find((x) => x.code === s.code) ?? s;
    setPendingPick(original);
  }, [selected, data]);
  const confirmPick = () => {
    if (pendingPick && onPick) {
      onPick(pendingPick);
      onOpenChange(false);
    }
    setPendingPick(null);
  };
  const cancelPick = () => setPendingPick(null);

  // 1단계: scope(전국/수도권) 필터
  const scopedSchools = useMemo(() => {
    if (scope === "전국") return data.schools;
    return data.schools.filter((s) => SUDOGWON.has(s.sido || s.city));
  }, [data, scope]);

  // 2단계: statsYear 필터 — 단일 연도 선택 시 해당 연도만 남기고 violenceTotal/Rate 재계산
  const yearFilteredSchools: School[] = useMemo(() => {
    if (statsYear === "all") return scopedSchools;
    return scopedSchools.map((s) => {
      const v = s.violence?.[statsYear] ?? null;
      const sr = s.selfResolved?.[statsYear] ?? null;
      const violence = v ? { [statsYear]: v } : {};
      const selfResolved = sr ? { [statsYear]: sr } : {};
      const vTot = v?.total ?? 0;
      const sTot = sr?.total ?? 0;
      const total = vTot + sTot;
      const hasYearData = !!(v || sr);
      const rate = hasYearData && s.studentTotal && s.studentTotal > 0
        ? Math.round((total / s.studentTotal) * 100 * 1000) / 1000
        : null;
      return {
        ...s,
        violence,
        selfResolved,
        violenceTotal: vTot,
        selfResolvedTotal: sTot,
        violenceRatePer100: rate,
        violenceYears: hasYearData ? 1 : 0,
      };
    });
  }, [scopedSchools, statsYear]);

  const yearsForAgg = useMemo(
    () => (statsYear === "all" ? data.years : [statsYear]),
    [statsYear, data.years],
  );

  const yearScopedData = useMemo(
    () => ({ ...data, schools: yearFilteredSchools, years: yearsForAgg }),
    [data, yearFilteredSchools, yearsForAgg],
  );

  const agg = useMemo(
    () => computeAggregates(yearFilteredSchools, yearsForAgg),
    [yearFilteredSchools, yearsForAgg],
  );

  // selected 학교도 statsYear 기준으로 재계산된 인스턴스 사용
  const yearScopedSelected = useMemo(() => {
    if (!selected) return null;
    return yearFilteredSchools.find((s) => s.code === selected.code) ?? null;
  }, [selected, yearFilteredSchools]);

  // 선택된 학교의 백분위 (scope + statsYear 내 비교)
  const percentiles = useMemo(() => {
    if (!yearScopedSelected) return null;
    const all = yearFilteredSchools;
    const mySido = yearScopedSelected.sido || yearScopedSelected.city;
    const sameKind = all.filter((s) => s.kind === yearScopedSelected.kind);
    const sameSido = all.filter((s) => (s.sido || s.city) === mySido);
    const sameSgg = all.filter((s) => s.city === yearScopedSelected.city && s.district === yearScopedSelected.district);
    return {
      national: schoolPercentile(yearScopedSelected, all, scope),
      kind: schoolPercentile(yearScopedSelected, sameKind, `${scope} ${yearScopedSelected.kind}`),
      sido: schoolPercentile(yearScopedSelected, sameSido, mySido),
      sgg: schoolPercentile(yearScopedSelected, sameSgg, [yearScopedSelected.city, yearScopedSelected.district].filter(Boolean).join(" ")),
    };
  }, [yearScopedSelected, yearFilteredSchools, scope]);

  const isSelectedInScope = !selected || scope === "전국" || SUDOGWON.has(selected.sido || selected.city);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle>{scope} 학교폭력 통계</DialogTitle>
            <div className="inline-flex rounded-md border bg-muted p-0.5 text-xs shrink-0">
              {(["전국", "수도권"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={cn(
                    "px-3 py-1 rounded transition-colors",
                    scope === s ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <DialogDescription>
            {statsYear === "all"
              ? `학교알리미 공시 4개년(${data.years[0]}~${data.years[data.years.length - 1]}) 기준`
              : `학교알리미 ${statsYear} 공시 단일년 기준`}
            {" · "}{scope} {agg.all.count.toLocaleString()}개 학교
            {scope === "수도권" && " (서울·인천·경기)"}
          </DialogDescription>
        </DialogHeader>

        {!isSelectedInScope && selected && (
          <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-2 py-1.5">
            ⚠ 선택한 학교({selected.name})는 수도권 밖입니다. 백분위·강조는 수도권 학교만 비교 대상으로 계산됩니다.
          </div>
        )}

        <PickContext.Provider value={onPick ? requestPick : null}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 1. 우리 학교 위치 */}
          <SchoolPositionCard selected={selected} percentiles={percentiles} all={agg.all} />
          {/* 2. 시·도별 평균 ranking */}
          <SidoRankingCard agg={agg} selected={selected} scope={scope} />
          {/* 3. 초→중→고 변화 */}
          <KindTransitionCard agg={agg} typeLabels={data.typeLabels} />
          {/* 4. 학교 규모별 평균 */}
          <SizeBucketCard agg={agg} selected={selected} />
          {/* 5. 공립 vs 사립 vs 국립 */}
          <FoundationCard agg={agg} selected={selected} scope={scope} />
          {/* 6. 학교의 사건 처리 방식 */}
          <SelfRatioCard agg={agg} selected={selected} />
          {/* 7. 여학교 vs 공학 */}
          <GenderCard agg={agg} typeLabels={data.typeLabels} selected={selected} />
          {/* 8. 평화 동네 TOP 10 */}
          <PeacefulSggCard agg={agg} selected={selected} scope={scope} />
          {/* 8-1. 거친 동네 TOP 10 */}
          <RoughSggCard agg={agg} selected={selected} scope={scope} />
          {/* 9. 학생수 변화 vs 학폭 */}
          <TrendCard agg={agg} selected={selected} scope={scope} />
          {/* 10. 교사 1인당 학생수 vs 학폭 */}
          <TeacherRatioCard agg={agg} selected={selected} scope={scope} />
          {/* 11. 학폭과 강하게 연관된 데이터 */}
          <CorrelationCard data={yearScopedData} scope={scope} />
          {/* 12. 유형별 심각한 동네 TOP 3 */}
          <TypeSeverityCard data={yearScopedData} scope={scope} />
          {/* 13. 우리 아이가 학폭 당사자가 될 확률 */}
          <SafetyOddsCard data={yearScopedData} selected={yearScopedSelected} scope={scope} />
          {/* 14. 학교의 선도조치 활용 */}
          <DisciplineStrengthCard data={yearScopedData} selected={yearScopedSelected} />
          {/* 15. 학교의 보호조치 활용 */}
          <ProtectionStrengthCard data={yearScopedData} selected={yearScopedSelected} />
          {/* 16. 동네 학교 안전 순위 */}
          {yearScopedSelected && <NeighborhoodRankCard data={yearScopedData} selected={yearScopedSelected} />}
          {/* 17. 선도조치 활용 TOP */}
          <TopDisciplineSchoolsCard data={yearScopedData} selected={selected} />
          {/* 18. 보호조치 활용 TOP */}
          <TopProtectionSchoolsCard data={yearScopedData} selected={selected} />
          {/* 19. 특별교육 이수율 */}
          <SpecialEdCard data={yearScopedData} selected={yearScopedSelected} />
        </div>
        </PickContext.Provider>

        <div className="text-[10px] text-muted-foreground pt-1 border-t">
          ⚠ 공시 누락·은폐로 0건 학교 해석에 주의. 비율은 학생 100명 기준 연 평균. 학생수 미보유 학교는 비율 계산에서 제외.
        </div>
      </DialogContent>

      {/* 학교 이동 confirm 다이얼로그 */}
      <Dialog open={!!pendingPick} onOpenChange={(o) => { if (!o) cancelPick(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>학교 이동</DialogTitle>
            <DialogDescription>
              <b>{pendingPick?.name}</b>으로 이동하시겠습니까?
              <br />
              <span className="text-[11px]">통계 창을 닫고 해당 학교 패널을 엽니다.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={cancelPick}
              className="px-3 py-1.5 text-xs rounded border bg-background hover:bg-accent"
            >
              취소
            </button>
            <button
              onClick={confirmPick}
              className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 font-semibold"
            >
              이동
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// ─── Card 1: 우리 학교 위치 ─────────────────────────
function SchoolPositionCard({
  selected, percentiles, all,
}: { selected: School | null; percentiles: any; all: SegmentStat }) {
  const kindP = percentiles?.kind;
  const verdict = kindP ? verdictFromPercentile(kindP.percentile, selected?.kind) : null;
  return (
    <Card title="우리 학교의 위치" subtitle={selected ? selected.name : "학교를 선택하면 표시됩니다"}>
      {!selected || !percentiles ? (
        <Empty msg={selected ? "학생수 또는 학폭 데이터 부족" : "지도/리스트에서 학교 선택"} />
      ) : (
        <div className="flex flex-col gap-2">
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
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">우리 학교 비율</span>
            <span className="font-semibold tabular-nums">{(selected.violenceRatePer100 ?? 0).toFixed(2)}/100명·년</span>
          </div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">전국 평균</span>
            <span className="tabular-nums">{all.avgRate.toFixed(2)}</span>
          </div>
          <div className="border-t my-1" />
          <div className="flex flex-col gap-1.5">
            {(["national", "kind", "sido", "sgg"] as const).map((k) => {
              const p = percentiles[k];
              if (!p) return null;
              return (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-20 shrink-0 truncate">{p.scope}</span>
                  <div className="flex-1 bg-muted h-2 rounded-sm overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${p.percentile}%`,
                        background: percentileColor(p.percentile),
                      }}
                    />
                  </div>
                  <span className="tabular-nums w-32 text-right text-[10px]">
                    상위 {Math.max(1, 100 - p.percentile)}% · {p.rank}/{p.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Card 2: 시·도별 ──────────────────────────────
function SidoRankingCard({ agg, selected, scope }: { agg: ReturnType<typeof computeAggregates>; selected: School | null; scope: Scope }) {
  const items = useMemo(() => {
    return Object.entries(agg.bySido)
      .map(([k, v]) => ({ name: k, ...v }))
      .filter((x) => x.withData >= 5 && x.name !== "교육부")
      .sort((a, b) => b.avgRate - a.avgRate);
  }, [agg]);
  const max = Math.max(0.001, ...items.map((x) => x.avgRate));
  const mySido = selected?.sido || selected?.city;

  return (
    <Card title="시·도별 평균 비율" subtitle={scope === "전국" ? "학생 100명·년 기준 (17개 광역)" : "학생 100명·년 기준 (서울·인천·경기)"}>
      <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1">
        {items.map((it, i) => {
          const isMine = mySido === it.name;
          return (
            <div key={it.name} className={cn("flex items-center gap-2 text-xs", isMine && "font-semibold")}>
              <span className="w-4 text-right text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="w-24 truncate">{it.name}</span>
              <div className="flex-1 bg-muted h-2 rounded-sm overflow-hidden">
                <div
                  className="h-full"
                  style={{ width: `${(it.avgRate / max) * 100}%`, background: isMine ? "#ef4444" : "#94a3b8" }}
                />
              </div>
              <span className="tabular-nums w-12 text-right">{it.avgRate.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      {items.length >= 2 && (
        <Insight>
          최고 <b>{items[0].name}</b> ({items[0].avgRate.toFixed(2)}) ↔ 최저 <b>{items[items.length - 1].name}</b> ({items[items.length - 1].avgRate.toFixed(2)})
          {" — 약 "}<b>{(items[0].avgRate / Math.max(0.01, items[items.length - 1].avgRate)).toFixed(1)}배 차이</b>.
          {scope === "전국" ? " 농어촌·소규모 학교 비율이 높은 지역이 상위." : " 수도권 안에서도 시·도별 격차 존재."}
        </Insight>
      )}
    </Card>
  );
}

// ─── Card 3: 초→중→고 변화 ──────────────────────────
function KindTransitionCard({ agg, typeLabels }: { agg: ReturnType<typeof computeAggregates>; typeLabels: string[] }) {
  const e = agg.byKind["초등"]?.avgRate ?? 0;
  const m = agg.byKind["중학"]?.avgRate ?? 0;
  const h = agg.byKind["고등"]?.avgRate ?? 0;
  const cyberE = agg.byKind["초등"]?.typeShare[6] ?? 0;
  const cyberH = agg.byKind["고등"]?.typeShare[6] ?? 0;
  return (
    <Card title="초 → 중 → 고 진학 시 변화" subtitle="학교종류별 평균 비율 + 폭력 유형 비중">
      <div className="flex flex-col gap-3">
        {/* 평균 비율 */}
        <div className="grid grid-cols-3 gap-2">
          {KIND_ORDER.map((k) => {
            const v = agg.byKind[k];
            return (
              <div key={k} className="rounded bg-muted/50 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">{k}</div>
                <div className="text-sm font-semibold tabular-nums">{v?.avgRate.toFixed(2) ?? "—"}</div>
              </div>
            );
          })}
        </div>
        {/* 유형 비중 stacked bar (막대 길이 = 평균 비율, 내부 색 비율 = 유형 비중) */}
        <div className="flex flex-col gap-1">
          <div className="text-[10px] text-muted-foreground">학교종류별 폭력 유형 비중 (막대 길이 = 평균 비율)</div>
          {(() => {
            const maxRate = Math.max(0.001, ...KIND_ORDER.map((k) => agg.byKind[k]?.avgRate ?? 0));
            return KIND_ORDER.map((k) => {
              const v = agg.byKind[k];
              if (!v) return null;
              const widthPct = (v.avgRate / maxRate) * 100;
              return (
                <div key={k} className="flex items-center gap-2 text-[10px]">
                  <span className="w-8 text-muted-foreground">{k}</span>
                  <div className="flex-1 h-3 bg-muted/40 rounded-sm relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 flex" style={{ width: `${widthPct}%` }}>
                      {v.typeShare.map((s, i) => (
                        <div key={i} title={`${typeLabels[i]} ${(s * 100).toFixed(0)}%`} style={{ width: `${s * 100}%`, background: TYPE_COLORS[i] }} />
                      ))}
                    </div>
                  </div>
                  <span className="tabular-nums w-10 text-right">{v.avgRate.toFixed(2)}</span>
                </div>
              );
            });
          })()}
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
            {typeLabels.map((label, i) => (
              <span key={label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="size-2 rounded-sm" style={{ background: TYPE_COLORS[i] }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <Insight>
          초→중 진입 시 약 <b>{(m / Math.max(0.01, e)).toFixed(1)}배 급증</b>, 중→고는 {h < m ? <b>{((1 - h / m) * 100).toFixed(0)}% 감소</b> : "유지"}.
          중학교 시기가 학폭 발생 정점. 학년이 올라갈수록 사이버폭력 비중도 증가({(cyberE * 100).toFixed(0)}%→{(cyberH * 100).toFixed(0)}%).
        </Insight>
      </div>
    </Card>
  );
}

// ─── Card 4: 학교 규모별 ────────────────────────────
function SizeBucketCard({ agg, selected }: { agg: ReturnType<typeof computeAggregates>; selected: School | null }) {
  const myBucket = selected ? sizeBucket(selected.studentTotal) : null;
  const max = Math.max(0.001, ...SIZE_ORDER.map((b) => agg.bySize[b]?.avgRate ?? 0));
  return (
    <Card title="학교 규모별 평균 비율" subtitle="학생수 구간 비교">
      <div className="flex flex-col gap-1.5">
        {SIZE_ORDER.map((b) => {
          const v = agg.bySize[b];
          if (!v) return null;
          const isMine = myBucket === b;
          return (
            <div key={b} className={cn("flex items-center gap-2 text-xs", isMine && "font-semibold")}>
              <span className="w-20 text-muted-foreground">{b}명</span>
              <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${(v.avgRate / max) * 100}%`, background: isMine ? "#ef4444" : "#94a3b8" }} />
              </div>
              <span className="tabular-nums w-12 text-right">{v.avgRate.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground w-14 text-right">{v.count.toLocaleString()}교</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        작은 학교는 표본이 작아 한 사건이 비율을 크게 끌어올릴 수 있습니다.
      </div>
      {(() => {
        const small = agg.bySize["<200"]?.avgRate ?? 0;
        const large = agg.bySize["1000+"]?.avgRate ?? 0;
        if (!small || !large) return null;
        return (
          <Insight>
            소규모 학교(&lt;200명)가 대형(1000+)보다 약 <b>{(small / large).toFixed(1)}배 높음</b>.
            단, 분모 효과(작은 학교일수록 한 사건의 비율 충격이 큼)가 일부 영향.
          </Insight>
        );
      })()}
    </Card>
  );
}

// ─── Card 5: 공립 / 사립 / 국립 ──────────────────────
function FoundationCard({ agg, selected, scope }: { agg: ReturnType<typeof computeAggregates>; selected: School | null; scope: Scope }) {
  const max = Math.max(0.001, ...FOUND_ORDER.map((k) => agg.byFoundation[k]?.avgRate ?? 0));
  return (
    <Card title="설립 유형별 평균 비율" subtitle="공립 vs 사립 vs 국립">
      <div className="flex flex-col gap-1.5">
        {FOUND_ORDER.map((k) => {
          const v = agg.byFoundation[k];
          if (!v) return null;
          const isMine = selected?.foundation === k;
          return (
            <div key={k} className={cn("flex items-center gap-2 text-xs", isMine && "font-semibold")}>
              <span className="w-12 text-muted-foreground">{k}</span>
              <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${(v.avgRate / max) * 100}%`, background: isMine ? "#ef4444" : "#94a3b8" }} />
              </div>
              <span className="tabular-nums w-12 text-right">{v.avgRate.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground w-14 text-right">{v.count.toLocaleString()}교</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        자체해결 비중: {FOUND_ORDER.map((k) => agg.byFoundation[k] && `${k} ${(agg.byFoundation[k].selfRatio * 100).toFixed(0)}%`).filter(Boolean).join(" · ")}
      </div>
      {(() => {
        const rates = FOUND_ORDER.map((k) => agg.byFoundation[k]?.avgRate ?? 0).filter((r) => r > 0);
        if (rates.length < 2) return null;
        const gap = (Math.max(...rates) - Math.min(...rates)) / Math.max(...rates);
        const nationalNote = "국립이 다소 낮은 건 표본 수(약 40여 교)가 적은 영향도 있음.";
        const sudogwonCount = agg.byFoundation["국립"]?.count ?? 0;
        const sudogwonNote = `수도권은 사립 비중이 전국 대비 높고, 국립은 ${sudogwonCount}교에 불과해 변동성 큼.`;
        return (
          <Insight>
            세 유형 차이는 <b>최대 {(gap * 100).toFixed(0)}% 이내</b> — 설립 주체(공·사·국립)는 학폭 발생률에 큰 영향이 없음.
            {" "}{scope === "전국" ? nationalNote : sudogwonNote}
          </Insight>
        );
      })()}
    </Card>
  );
}

// ─── Card 6: 사건 처리 방식 ────────────────────────
function SelfRatioCard({ agg, selected }: { agg: ReturnType<typeof computeAggregates>; selected: School | null }) {
  const sel = selected && selected.violenceTotal + (selected.selfResolvedTotal ?? 0) > 0
    ? (selected.selfResolvedTotal ?? 0) / (selected.violenceTotal + (selected.selfResolvedTotal ?? 0))
    : null;
  return (
    <Card title="학교의 사건 처리 방식" subtitle="자체해결 비중 (= 자체해결 / 전체 사건)">
      <div className="flex flex-col gap-2">
        <ProcRow label="전국" value={agg.all.selfRatio} />
        {KIND_ORDER.map((k) => agg.byKind[k] && (
          <ProcRow key={k} label={k} value={agg.byKind[k].selfRatio} />
        ))}
        {sel != null && selected && (
          <>
            <div className="border-t my-1" />
            <ProcRow label={`우리 학교 (${selected.name})`} value={sel} mine />
          </>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        높을수록 학교 자체에서 처리. 너무 낮으면 모든 사건이 심의위로, 너무 높으면 사건이 가려질 가능성도 있습니다.
      </div>
      <Insight>
        전국 약 <b>{(agg.all.selfRatio * 100).toFixed(0)}%</b>가 자체해결 — 절반은 심의위로 가지 않고 학교 내부에서 종결.
        초등이 가장 높음(중대 사안 비중↓). 수치가 50%에서 크게 벗어난 학교는 처리 패턴 점검 필요.
      </Insight>
    </Card>
  );
}

function ProcRow({ label, value, mine }: { label: string; value: number; mine?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 text-xs", mine && "font-semibold")}>
      <span className="w-32 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
        <div className="h-full" style={{ width: `${Math.min(100, value * 100)}%`, background: mine ? "#ef4444" : "#94a3b8" }} />
      </div>
      <span className="tabular-nums w-12 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

// ─── Card 7: 여학교 vs 공학 통념 검증 ─────────────
function GenderCard({ agg, typeLabels, selected }: { agg: ReturnType<typeof computeAggregates>; typeLabels: string[]; selected: School | null }) {
  const order = ["여", "남", "공학"] as const;
  const max = Math.max(0.001, ...order.map((k) => agg.byGender[k]?.avgRate ?? 0));
  return (
    <Card title="여학교 vs 공학" subtitle="성별 통념 검증 + 폭력 유형 차이">
      <div className="flex flex-col gap-1.5">
        {order.map((k) => {
          const v = agg.byGender[k];
          if (!v || v.count < 5) return null;
          const isMine = selected?.gender === k;
          return (
            <div key={k} className={cn("flex items-center gap-2 text-xs", isMine && "font-semibold")}>
              <span className="w-12 text-muted-foreground">{k}{k !== "공학" ? "학교" : ""}</span>
              <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${(v.avgRate / max) * 100}%`, background: isMine ? "#ef4444" : "#94a3b8" }} />
              </div>
              <span className="tabular-nums w-12 text-right">{v.avgRate.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground w-14 text-right">{v.count.toLocaleString()}교</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2 mb-1">유형 비중 (8개 항목)</div>
      <div className="flex flex-col gap-1">
        {order.map((k) => {
          const v = agg.byGender[k];
          if (!v || v.count < 5) return null;
          return (
            <div key={k} className="flex items-center gap-2 text-[10px]">
              <span className="w-12 text-muted-foreground">{k}</span>
              <div className="flex-1 flex h-3 rounded-sm overflow-hidden">
                {v.typeShare.map((s, i) => (
                  <div key={i} title={`${typeLabels[i]} ${(s * 100).toFixed(0)}%`} style={{ width: `${s * 100}%`, background: TYPE_COLORS[i] }} />
                ))}
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
          {typeLabels.map((label, i) => (
            <span key={label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="size-2 rounded-sm" style={{ background: TYPE_COLORS[i] }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      {(() => {
        const f = agg.byGender["여"];
        const c = agg.byGender["공학"];
        if (!f || !c) return null;
        const fCyber = (f.typeShare[6] ?? 0) * 100;
        const cCyber = (c.typeShare[6] ?? 0) * 100;
        const fPhy = (f.typeShare[0] ?? 0) * 100;
        const cPhy = (c.typeShare[0] ?? 0) * 100;
        return (
          <Insight>
            공학이 여학교보다 약 <b>{(c.avgRate / Math.max(0.01, f.avgRate)).toFixed(1)}배 높음</b>.
            단, 폭력 양상이 다름 — 여학교는 사이버폭력 <b>{fCyber.toFixed(0)}%</b>(공학 {cCyber.toFixed(0)}%) 비중↑,
            공학은 신체폭력 <b>{cPhy.toFixed(0)}%</b>(여학교 {fPhy.toFixed(0)}%) 비중↑.
          </Insight>
        );
      })()}
    </Card>
  );
}

// ─── Card 8: 가장 평화로운 동네 TOP 10 ──────────
function PeacefulSggCard({ agg, selected, scope }: { agg: ReturnType<typeof computeAggregates>; selected: School | null; scope: Scope }) {
  const items = useMemo(() => {
    return Object.entries(agg.bySgg)
      .map(([k, v]) => ({ name: k, ...v, peaceRatio: v.withData > 0 ? v.zeroFour / v.withData : 0 }))
      .filter((x) => x.withData >= 10)
      .sort((a, b) => b.peaceRatio - a.peaceRatio)
      .slice(0, 10);
  }, [agg]);
  const mySgg = selected ? [selected.sido || "", selected.city, selected.district].filter(Boolean).join(" ").trim() : null;
  return (
    <Card title="가장 평화로운 동네 TOP 10" subtitle="시·군·구 내 4년 연속 0건 학교 비율 (학교 10교+ 만)">
      <div className="flex flex-col gap-1">
        {items.map((it, i) => {
          const isMine = mySgg === it.name;
          return (
            <div key={it.name} className={cn("flex items-center gap-2 text-xs", isMine && "font-semibold")}>
              <span className="w-4 text-right text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="flex-1 truncate">{it.name}</span>
              <span className="tabular-nums w-12 text-right">{(it.peaceRatio * 100).toFixed(0)}%</span>
              <span className="text-[10px] text-muted-foreground w-14 text-right">{it.zeroFour}/{it.withData}교</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        ⚠ 신고 회피 가능성 있음. 0건 = 평화 또는 은폐.
      </div>
      <Insight>
        {scope === "전국"
          ? "TOP 10 대부분 농어촌 군 단위 — 학생수가 적어 신고 자체가 드물 수도, 실제 평화로움일 수도. 도시 신축 단지는 거의 등장하지 않음."
          : "수도권 안에서도 외곽 군 단위(연천·강화·옹진·가평·양평 등)가 상위 — 학생수 적은 학교가 많아 0건 비율이 자연스럽게 높아짐. 서울 자치구는 학생 표본이 커서 0건 학교가 거의 없음."}
      </Insight>
    </Card>
  );
}

// ─── Card 8-1: 가장 거친 동네 TOP 10 ──────────
function RoughSggCard({ agg, selected, scope }: { agg: ReturnType<typeof computeAggregates>; selected: School | null; scope: Scope }) {
  const items = useMemo(() => {
    return Object.entries(agg.bySgg)
      .map(([k, v]) => ({ name: k, ...v }))
      .filter((x) => x.withData >= 10 && x.avgRate > 0)
      .sort((a, b) => b.avgRate - a.avgRate)
      .slice(0, 10);
  }, [agg]);
  const max = Math.max(0.001, ...items.map((x) => x.avgRate));
  const mySgg = selected ? [selected.sido || "", selected.city === (selected.sido || "") ? "" : selected.city, selected.district].filter(Boolean).join(" ").trim() : null;
  return (
    <Card title="가장 거친 동네 TOP 10" subtitle="시·군·구 평균 학폭 비율 (학교 10교+ 만)">
      <div className="flex flex-col gap-1">
        {items.map((it, i) => {
          const isMine = mySgg === it.name;
          return (
            <div key={it.name} className={cn("flex items-center gap-2 text-xs", isMine && "font-semibold")}>
              <span className="w-4 text-right text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="w-32 truncate">{it.name}</span>
              <div className="flex-1 bg-muted h-2 rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${(it.avgRate / max) * 100}%`, background: isMine ? "#ef4444" : "#dc2626" }} />
              </div>
              <span className="tabular-nums w-12 text-right">{it.avgRate.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground w-10 text-right">{it.withData}교</span>
            </div>
          );
        })}
      </div>
      {items.length > 0 && (
        <Insight>
          최상위 <b>{items[0].name}</b> 평균 <b>{items[0].avgRate.toFixed(2)}/100명·년</b>으로 {scope} 평균({agg.all.avgRate.toFixed(2)})의 약 <b>{(items[0].avgRate / Math.max(0.01, agg.all.avgRate)).toFixed(1)}배</b>.
          {scope === "전국"
            ? " 평화 동네와 마찬가지로 농어촌·소규모 학교가 많은 군 단위가 자주 등장 — 한 사건이 평균을 크게 끌어올리는 분모 효과 영향."
            : " 수도권에서는 외곽 군·시 단위와 일부 도심 자치구가 섞여 등장 — 학교 규모와 사건 빈도가 함께 영향."}
        </Insight>
      )}
    </Card>
  );
}

// ─── Card 9: 학생수 변화 vs 학폭 ─────────────────
function TrendCard({ agg, selected, scope }: { agg: ReturnType<typeof computeAggregates>; selected: School | null; scope: Scope }) {
  const order: TrendBucket[] = ["감소", "정체", "증가"];
  const max = Math.max(0.001, ...order.map((b) => agg.byTrend[b]?.avgRate ?? 0));
  const myBucket = selected ? trendBucket(selected.details?.studentTrend) : null;
  return (
    <Card title="학생수 변화 vs 학폭" subtitle="4년간 학생수 변화 구간별 평균 (감소: −10% 이하 · 증가: +10% 이상)">
      <div className="flex flex-col gap-1.5">
        {order.map((b) => {
          const v = agg.byTrend[b];
          if (!v) return null;
          const isMine = myBucket === b;
          return (
            <div key={b} className={cn("flex items-center gap-2 text-xs", isMine && "font-semibold")}>
              <span className="w-14 text-muted-foreground">학생수 {b}</span>
              <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${(v.avgRate / max) * 100}%`, background: isMine ? "#ef4444" : "#94a3b8" }} />
              </div>
              <span className="tabular-nums w-12 text-right">{v.avgRate.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground w-14 text-right">{v.count.toLocaleString()}교</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">인구 감소 지역 학교가 더 어려움을 겪는지 확인.</div>
      {(() => {
        const dec = agg.byTrend["감소"]?.avgRate ?? 0;
        const inc = agg.byTrend["증가"]?.avgRate ?? 0;
        if (!dec || !inc) return null;
        const lower = dec < inc ? "감소" : "증가";
        return (
          <Insight>
            학생수 <b>{lower} 학교가 {dec === inc ? "비슷" : "오히려 낮음"}</b>.
            {scope === "전국"
              ? ' "인구가 빠지면 학폭이 심해진다"는 통념과 반대 — 농어촌 인구감소 지역이 평균적으로 학폭 비율도 낮은 경향(평화 동네 카드와 일치).'
              : " 수도권에서는 신축 단지 유입(증가)과 구도심 학생 감소(감소)의 효과가 섞여, 차이가 비교적 작은 편."}
          </Insight>
        );
      })()}
    </Card>
  );
}

// ─── Card 10: 교사 1인당 학생수 vs 학폭 ──────────
function TeacherRatioCard({ agg, selected, scope }: { agg: ReturnType<typeof computeAggregates>; selected: School | null; scope: Scope }) {
  const order: RatioBucket[] = ["<10명", "10–15명", "15–20명", "20명+"];
  const max = Math.max(0.001, ...order.map((b) => agg.byTeacherRatio[b]?.avgRate ?? 0));
  const myBucket = selected ? studentPerTeacherBucket(selected.studentTotal, selected.teachers) : null;
  return (
    <Card title="교사 1인당 학생수 vs 학폭" subtitle="교사 부족이 학폭과 상관 있는가">
      <div className="flex flex-col gap-1.5">
        {order.map((b) => {
          const v = agg.byTeacherRatio[b];
          if (!v) return null;
          const isMine = myBucket === b;
          return (
            <div key={b} className={cn("flex items-center gap-2 text-xs", isMine && "font-semibold")}>
              <span className="w-14 text-muted-foreground">교사당 {b}</span>
              <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${(v.avgRate / max) * 100}%`, background: isMine ? "#ef4444" : "#94a3b8" }} />
              </div>
              <span className="tabular-nums w-12 text-right">{v.avgRate.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground w-14 text-right">{v.count.toLocaleString()}교</span>
            </div>
          );
        })}
      </div>
      {(() => {
        const small = agg.byTeacherRatio["<10명"]?.avgRate ?? 0;
        const big = agg.byTeacherRatio["20명+"]?.avgRate ?? 0;
        if (!small || !big) return null;
        const inverted = small > big;
        return (
          <Insight>
            <b>교사당 학생이 {inverted ? "적은" : "많은"} 학교일수록 비율이 높음</b>{inverted ? " — 통념과 반대." : "."}
            {scope === "전국"
              ? " 교사당 <10명은 대부분 농어촌 소규모 학교라 분모 효과 + 한 사건의 비율 충격이 큼. \"교사 부족 → 학폭 증가\"는 이 데이터로 뒷받침되지 않음."
              : " 수도권은 농어촌이 적어 분모 효과가 약함 — 교사당 학생수가 학폭과 강하게 연결되지 않음."}
          </Insight>
        );
      })()}
    </Card>
  );
}

// ─── Card 11: 학폭과 강하게 연관된 데이터 ──────────
const CORR_CANDIDATES: { name: string; fn: (s: School) => number | null | undefined }[] = [
  { name: "돌봄교실 수", fn: (s) => s.details?.afterSchool?.careRooms },
  { name: "방과후 학생수", fn: (s) => s.details?.afterSchool?.students },
  { name: "방과후 프로그램 수", fn: (s) => s.details?.afterSchool?.programs },
  { name: "방과후 부담금", fn: (s) => s.details?.afterSchool?.burdenAmount },
  { name: "장학금 금액", fn: (s) => s.details?.scholarship?.totalAmount },
  { name: "예방프로그램 참여학생", fn: (s) => s.preventionEdu?.[2026]?.progStudents },
  { name: "자율 동아리 수", fn: (s) => s.details?.activities?.clubs },
  { name: "특별교실 수", fn: (s) => s.details?.facility?.specialClassrooms },
  { name: "학급당 학생수", fn: (s) => s.studentTotal && s.classTotal ? s.studentTotal / s.classTotal : null },
  { name: "남학생 비율(%)", fn: (s) => {
    const g = s.genderRatio;
    return g && (g.boy + g.girl) > 0 ? (g.boy / (g.boy + g.girl)) * 100 : null;
  } },
  { name: "보건실 1인당 이용", fn: (s) => s.details?.health?.perStudentVisits },
  { name: "교사당 학생수", fn: (s) => s.studentTotal && s.teachers ? s.studentTotal / s.teachers : null },
];

function rankArr(arr: number[]): number[] {
  const idx = arr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

function CorrelationCard({ data, scope }: { data: DataSet; scope: Scope }) {
  const items = useMemo(() => {
    return CORR_CANDIDATES.map((c) => {
      const xs: number[] = [], ys: number[] = [];
      for (const s of data.schools) {
        if (s.violenceRatePer100 == null) continue;
        const x = c.fn(s);
        if (x == null || !Number.isFinite(x)) continue;
        xs.push(x as number);
        ys.push(s.violenceRatePer100);
      }
      if (xs.length < 200) return null;
      const r = pearson(rankArr(xs), rankArr(ys));
      return { name: c.name, n: xs.length, r };
    }).filter((x): x is { name: string; n: number; r: number } => !!x);
  }, [data]);
  const max = Math.max(0.001, ...items.map((x) => Math.abs(x.r)));
  const sorted = [...items].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return (
    <Card title="학폭과 가장 강하게 연관된 데이터" subtitle="Spearman 순위 상관 (양수=비례, 음수=반비례)">
      <div className="flex flex-col gap-1">
        {sorted.map((it) => {
          const w = (Math.abs(it.r) / max) * 100;
          const isPos = it.r > 0;
          return (
            <div key={it.name} className="flex items-center gap-2 text-xs">
              <span className="w-32 truncate text-muted-foreground">{it.name}</span>
              <div className="flex-1 bg-muted h-2 rounded-sm relative overflow-hidden">
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: isPos ? "50%" : `${50 - w / 2}%`,
                    width: `${w / 2}%`,
                    background: isPos ? "#dc2626" : "#16a34a",
                  }}
                />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
              </div>
              <span className={cn("tabular-nums w-12 text-right", isPos ? "text-red-600" : "text-green-600")}>
                {it.r > 0 ? "+" : ""}{it.r.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
      <Insight>
        {sorted.length > 0 && (
          <>
            상위 신호:
            {sorted.slice(0, 3).map((it, i) => (
              <span key={it.name} className={cn("ml-1", it.r > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>
                {i > 0 && ","} <b>{it.name}</b>({it.r > 0 ? "+" : ""}{it.r.toFixed(2)})
              </span>
            ))}.
          </>
        )}
        {" "}
        {scope === "전국"
          ? "전국 단위에서는 돌봄·방과후 인프라가 가장 일관된 보호 요인. 농어촌 소규모 학교 효과(교란변수)가 강하게 작용."
          : "수도권은 농어촌 효과가 약해 순수 도시 효과가 더 두드러짐 — 학급당 학생수·학생 규모가 학폭 평균과 어떻게 연결되는지 전국과 비교해 보세요."}
        ⚠ 상관 ≠ 인과.
      </Insight>
    </Card>
  );
}

// ─── Card 12: 유형별 심각한 동네 TOP 3 ───────────
function TypeSeverityCard({ data, scope }: { data: DataSet; scope: Scope }) {
  const topPerType = useMemo(() => {
    const map = new Map<string, { typeEvents: number[]; studentYears: number; schools: number }>();
    for (const s of data.schools) {
      if (!s.studentTotal || s.studentTotal <= 0) continue;
      const sidoVal = s.sido || "";
      const cityVal = s.city === sidoVal ? "" : s.city;
      const sgg = [sidoVal, cityVal, s.district].filter(Boolean).join(" ").trim();
      if (!sgg) continue;
      let years = 0;
      const t = new Array(8).fill(0);
      for (const y of data.years) {
        const v = s.violence[y];
        if (!v) continue;
        years++;
        for (let i = 0; i < 8; i++) t[i] += v.types[i] ?? 0;
      }
      if (years === 0) continue;
      const cur = map.get(sgg) ?? { typeEvents: new Array(8).fill(0), studentYears: 0, schools: 0 };
      for (let i = 0; i < 8; i++) cur.typeEvents[i] += t[i];
      cur.studentYears += s.studentTotal * years;
      cur.schools++;
      map.set(sgg, cur);
    }
    const entries = [...map.entries()].filter(([_, v]) => v.schools >= 10);
    return data.typeLabels.map((label, i) => ({
      label,
      color: TYPE_COLORS[i],
      top: entries
        .map(([name, v]) => ({
          name,
          rate: v.studentYears > 0 ? (v.typeEvents[i] / v.studentYears) * 100 : 0,
        }))
        .filter((x) => x.rate > 0)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 3),
    }));
  }, [data]);
  return (
    <Card title="유형별 심각한 동네 TOP 3" subtitle="시·군·구 학생 100명·년 기준 (학교 10교+ 만)">
      <div className="grid grid-cols-1 gap-2">
        {topPerType.map((t) => (
          <div key={t.label} className="flex items-start gap-2 text-[11px]">
            <span className="size-2.5 rounded-sm mt-1 shrink-0" style={{ background: t.color }} />
            <div className="w-16 font-semibold shrink-0">{t.label}</div>
            <div className="flex-1 flex flex-col gap-0.5">
              {t.top.map((x, i) => (
                <div key={x.name} className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground tabular-nums w-3">{i + 1}</span>
                  <span className="flex-1 truncate">{x.name}</span>
                  <span className="tabular-nums">{x.rate.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Insight>
        유형별로 상위 동네가 다름 — 같은 평균 비율이라도 폭력 양상이 다르게 나타남.
        성폭력·강요·따돌림은 전체 평균이 낮아 한두 사건에도 순위가 크게 바뀜.
        {scope === "전국"
          ? " 다수 농어촌 군 단위 등장 → 분모 효과(소규모 학교) 영향."
          : " 수도권은 외곽 군·시 + 도심 자치구가 섞여 등장 — 사이버폭력은 도심에서, 신체폭력은 외곽에서 두드러지는 경향."}
      </Insight>
    </Card>
  );
}

// ─── Card 13: 우리 아이가 학폭 당사자가 될 확률 ──
function SafetyOddsCard({ data, selected, scope }: { data: DataSet; selected: School | null; scope: Scope }) {
  const stats = useMemo(() => {
    let victims = 0, perps = 0, studentYears = 0;
    for (const s of data.schools) {
      if (!s.studentTotal || s.studentTotal <= 0) continue;
      for (const y of data.years) {
        const v = s.violence[y];
        if (!v?.cases) continue;
        victims += (v.cases.s1?.v ?? 0) + (v.cases.s2?.v ?? 0);
        perps += (v.cases.s1?.p ?? 0) + (v.cases.s2?.p ?? 0);
        studentYears += s.studentTotal;
      }
    }
    return {
      victimRate: studentYears > 0 ? (victims / studentYears) * 100 : 0,
      perpRate: studentYears > 0 ? (perps / studentYears) * 100 : 0,
    };
  }, [data]);

  const my = useMemo(() => {
    if (!selected || !selected.studentTotal) return null;
    let v = 0, p = 0, ys = 0;
    for (const y of data.years) {
      const ev = selected.violence[y];
      if (!ev?.cases) continue;
      v += (ev.cases.s1?.v ?? 0) + (ev.cases.s2?.v ?? 0);
      p += (ev.cases.s1?.p ?? 0) + (ev.cases.s2?.p ?? 0);
      ys++;
    }
    if (ys === 0) return null;
    return {
      victimRate: (v / (selected.studentTotal * ys)) * 100,
      perpRate: (p / (selected.studentTotal * ys)) * 100,
    };
  }, [selected, data]);

  return (
    <Card title="내 아이가 학폭 당사자가 될 확률" subtitle="학생 100명·년당 피해/가해로 판정된 학생 수">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded bg-muted/40 p-2">
          <div className="text-[10px] text-muted-foreground">{scope} 평균 — 피해</div>
          <div className="text-sm font-semibold tabular-nums">{stats.victimRate.toFixed(2)} <span className="text-[10px] font-normal">/100명·년</span></div>
          {my && (
            <div className={cn("text-[11px] mt-0.5", my.victimRate > stats.victimRate ? "text-red-600" : "text-green-700 dark:text-green-400")}>
              우리 학교: <b>{my.victimRate.toFixed(2)}</b> {my.victimRate > stats.victimRate ? "↑ 높음" : "↓ 낮음"}
            </div>
          )}
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-[10px] text-muted-foreground">{scope} 평균 — 가해</div>
          <div className="text-sm font-semibold tabular-nums">{stats.perpRate.toFixed(2)} <span className="text-[10px] font-normal">/100명·년</span></div>
          {my && (
            <div className={cn("text-[11px] mt-0.5", my.perpRate > stats.perpRate ? "text-red-600" : "text-green-700 dark:text-green-400")}>
              우리 학교: <b>{my.perpRate.toFixed(2)}</b> {my.perpRate > stats.perpRate ? "↑ 높음" : "↓ 낮음"}
            </div>
          )}
        </div>
      </div>
      <Insight>
        쉽게 풀면 <b>{scope} 평균</b>: <b>{Math.round(10000 / Math.max(0.01, stats.victimRate))}명 중 1명</b>이 매년 학폭 피해자, <b>{Math.round(10000 / Math.max(0.01, stats.perpRate))}명 중 1명</b>이 가해자로 판정됨.
        {my && <> 우리 학교 기준으로는 피해 <b>{Math.round(10000 / Math.max(0.01, my.victimRate))}명 중 1명</b>, 가해 <b>{Math.round(10000 / Math.max(0.01, my.perpRate))}명 중 1명</b>.</>}
      </Insight>
    </Card>
  );
}

// ─── Card 14: 우리 학교 선도조치 활용 ─────────────
function DisciplineStrengthCard({ data, selected }: { data: DataSet; selected: School | null }) {
  const dist = useMemo(() => {
    const buckets = { 부재: 0, 약함: 0, 보통: 0, 강함: 0 };
    let mySchoolPC: number | null = null;
    let avgPC = 0, n = 0;
    for (const s of data.schools) {
      let perps = 0, measures = 0;
      for (const y of data.years) {
        const v = s.violence[y];
        if (!v?.cases) continue;
        perps += (v.cases.s1?.p ?? 0) + (v.cases.s2?.p ?? 0);
        if (v.perpMeasures) {
          for (let i = 0; i < 9; i++) measures += v.perpMeasures[i] ?? 0;
        }
      }
      if (perps < 3) continue;
      const pc = measures / perps;
      avgPC += pc; n++;
      if (pc < 0.5) buckets.부재++;
      else if (pc < 1.0) buckets.약함++;
      else if (pc < 1.5) buckets.보통++;
      else buckets.강함++;
      if (selected && s.code === selected.code) mySchoolPC = pc;
    }
    return { buckets, avgPC: n > 0 ? avgPC / n : 0, n, mySchoolPC };
  }, [data, selected]);

  const labels: { key: keyof typeof dist.buckets; label: string; color: string; range: string }[] = [
    { key: "부재", label: "부재", color: "#10b981", range: "<0.5건" },
    { key: "약함", label: "약함", color: "#facc15", range: "0.5–1.0" },
    { key: "보통", label: "보통", color: "#f97316", range: "1.0–1.5" },
    { key: "강함", label: "강함", color: "#dc2626", range: "≥1.5" },
  ];
  const total = Object.values(dist.buckets).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(dist.buckets));

  return (
    <Card title="학교의 선도조치 활용 분포" subtitle="가해학생 1명당 평균 선도조치 수 (가해 3명+)">
      <div className="flex flex-col gap-1">
        {labels.map((b) => {
          const cnt = dist.buckets[b.key];
          const pct = total > 0 ? (cnt / total) * 100 : 0;
          const w = (cnt / max) * 100;
          const myBucket =
            dist.mySchoolPC == null ? false :
            (b.key === "부재" && dist.mySchoolPC < 0.5) ||
            (b.key === "약함" && dist.mySchoolPC >= 0.5 && dist.mySchoolPC < 1.0) ||
            (b.key === "보통" && dist.mySchoolPC >= 1.0 && dist.mySchoolPC < 1.5) ||
            (b.key === "강함" && dist.mySchoolPC >= 1.5);
          return (
            <div key={b.key} className={cn("flex items-center gap-2 text-xs", myBucket && "font-bold")}>
              <span className="w-20 text-muted-foreground">{b.label}</span>
              <span className="text-[10px] text-muted-foreground w-14">({b.range})</span>
              <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${w}%`, background: b.color }} />
              </div>
              <span className="tabular-nums w-10 text-right">{cnt.toLocaleString()}</span>
              <span className="tabular-nums w-10 text-right text-muted-foreground text-[10px]">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
      <Insight>
        전국 평균: 가해 1명당 <b>{dist.avgPC.toFixed(2)}건</b> 처분 부여 (1호~9호 합산).
        {dist.mySchoolPC != null && <> 우리 학교: <b className={cn(dist.mySchoolPC >= 1.0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>{dist.mySchoolPC.toFixed(2)}건</b>.</>}
        {" "}한 학생에게 여러 호 중복 부여 가능 (예: 5호 특별교육 + 6호 출석정지). 부재이면 솜방망이 가능성, 강하면 엄정 처리 또는 중대 사안 비중↑.
      </Insight>
    </Card>
  );
}

// ─── Card 15: 피해자 보호조치 활용 ─────────────────
function ProtectionStrengthCard({ data, selected }: { data: DataSet; selected: School | null }) {
  const stats = useMemo(() => {
    let totalVictims = 0, totalMeasures = 0;
    let mySchool: { victims: number; measures: number } | null = null;
    for (const s of data.schools) {
      let victims = 0, m = 0;
      for (const y of data.years) {
        const v = s.violence[y];
        if (!v?.cases) continue;
        victims += (v.cases.s1?.v ?? 0) + (v.cases.s2?.v ?? 0);
        if (v.victimMeasures) {
          for (let i = 0; i < 5; i++) m += v.victimMeasures[i] ?? 0;
        }
      }
      totalVictims += victims;
      totalMeasures += m;
      if (selected && s.code === selected.code && victims > 0) mySchool = { victims, measures: m };
    }
    return {
      avgPerVictim: totalVictims > 0 ? totalMeasures / totalVictims : 0,
      myAvg: mySchool && mySchool.victims > 0 ? mySchool.measures / mySchool.victims : null,
    };
  }, [data, selected]);

  return (
    <Card title="피해 학생 보호조치 활용" subtitle="피해 학생 1명당 평균 보호조치 수 (학폭예방법 16조 1~5호 합산)">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded bg-muted/40 p-2">
          <div className="text-[10px] text-muted-foreground">전국 평균</div>
          <div className="text-base font-semibold tabular-nums">{stats.avgPerVictim.toFixed(2)}건</div>
          <div className="text-[10px] text-muted-foreground">/피해자</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-[10px] text-muted-foreground">우리 학교</div>
          <div className={cn("text-base font-semibold tabular-nums", stats.myAvg != null && (stats.myAvg >= stats.avgPerVictim ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"))}>
            {stats.myAvg != null ? `${stats.myAvg.toFixed(2)}건` : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {stats.myAvg != null
              ? (stats.myAvg >= stats.avgPerVictim ? "전국 평균 이상" : "전국 평균 이하")
              : "피해 없음"}
          </div>
        </div>
      </div>
      <Insight>
        보호조치는 <b>심리상담·일시보호·치료·학급교체·기타</b> 5종 (학폭예방법 16조). 한 학생에게 여러 조치 중복 부여 가능.
        분모를 사안이 아닌 <b>피해 학생 수</b>로 잡아 집단 피해 학교의 비율 부풀림을 보정.
        <b>1건 이하</b>이면 보호 부재, <b>1.5건 이상</b>이면 다층 보호.
      </Insight>
    </Card>
  );
}

// ─── Card 16: 우리 동네 학교 안전 순위 ──────────
function NeighborhoodRankCard({ data, selected }: { data: DataSet; selected: School }) {
  const items = useMemo(() => {
    return data.schools
      .filter((s) => s.kind === selected.kind && s.city === selected.city && s.district === selected.district && s.violenceRatePer100 != null)
      .sort((a, b) => (a.violenceRatePer100 ?? 0) - (b.violenceRatePer100 ?? 0));
  }, [data, selected]);
  const myIdx = items.findIndex((s) => s.code === selected.code);
  const showCount = Math.min(15, items.length);
  const showItems = items.slice(0, showCount);
  const mustInsertMine = myIdx >= showCount;
  return (
    <Card
      title={`우리 동네 ${selected.kind === "초등" ? "초등학교" : selected.kind === "중학" ? "중학교" : "고등학교"} 순위`}
      subtitle={`${[selected.city, selected.district].filter(Boolean).join(" ")} 안전 순 (낮을수록 안전)`}
    >
      {items.length < 2 ? (
        <Empty msg="비교 가능한 같은 동네 학교가 부족합니다" />
      ) : (
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {showItems.map((s, i) => {
            const isMine = s.code === selected.code;
            return (
              <div key={s.code} className={cn("flex items-center gap-2 text-xs", isMine && "font-bold")}>
                <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                <SchoolLink school={s} className={cn("flex-1 truncate", isMine && "text-red-600")}>
                  {s.name}{isMine && " ← 우리 학교"}
                </SchoolLink>
                <span className="tabular-nums text-[11px]">{(s.violenceRatePer100 ?? 0).toFixed(2)}</span>
              </div>
            );
          })}
          {mustInsertMine && (
            <>
              <div className="text-center text-[10px] text-muted-foreground py-0.5">⋯</div>
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="w-5 text-right text-muted-foreground tabular-nums">{myIdx + 1}</span>
                <SchoolLink school={selected} className="flex-1 truncate text-red-600">{selected.name} ← 우리 학교</SchoolLink>
                <span className="tabular-nums text-[11px]">{(selected.violenceRatePer100 ?? 0).toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      )}
      {items.length >= 2 && myIdx >= 0 && (
        <Insight>
          같은 동네 같은 학교종류 <b>{items.length}개교</b> 중 우리 학교는 <b>{myIdx + 1}위</b> (낮은 순).
          상위 1/3이면 안전한 편, 하위 1/3이면 신중하게 살펴볼 만.
          학원·학생 분포 등 동일 지역 조건을 통제한 비교라 가장 실용적.
        </Insight>
      )}
    </Card>
  );
}

// ─── Card 17: 선도조치 활용 가장 높은 학교 TOP ──────
function TopDisciplineSchoolsCard({ data, selected }: { data: DataSet; selected: School | null }) {
  const items = useMemo(() => {
    const out: { s: School; perPerp: number; perps: number }[] = [];
    for (const s of data.schools) {
      let perps = 0, measures = 0;
      for (const y of data.years) {
        const v = s.violence[y];
        if (!v?.cases) continue;
        perps += (v.cases.s1?.p ?? 0) + (v.cases.s2?.p ?? 0);
        if (v.perpMeasures) {
          for (let i = 0; i < 9; i++) measures += v.perpMeasures[i] ?? 0;
        }
      }
      if (perps < 3) continue;
      out.push({ s, perPerp: measures / perps, perps });
    }
    return out.sort((a, b) => b.perPerp - a.perPerp).slice(0, 12);
  }, [data]);
  return (
    <Card title="선도조치 활용 가장 높은 학교 TOP 12" subtitle="가해학생 1명당 평균 선도조치 수 (가해 3명+)">
      {items.length === 0 ? (
        <Empty msg="조건을 만족하는 학교 없음" />
      ) : (
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {items.map(({ s, perPerp, perps }, i) => {
            const isMine = selected?.code === s.code;
            return (
              <div key={s.code} className={cn("flex items-center gap-2 text-xs", isMine && "font-bold")}>
                <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                <SchoolLink school={s} className={cn("flex-1 truncate", isMine && "text-red-600 dark:text-red-400")}>
                  {s.name}{isMine && " ← 우리 학교"}
                </SchoolLink>
                <span className="text-[10px] text-muted-foreground w-20 text-right truncate">
                  {[s.city, s.district].filter(Boolean).join(" ")}
                </span>
                <span className="tabular-nums w-12 text-right text-red-700 dark:text-red-400 font-semibold">{perPerp.toFixed(2)}</span>
                <span className="text-[10px] text-muted-foreground w-10 text-right">가해 {perps}</span>
              </div>
            );
          })}
        </div>
      )}
      <Insight>
        가해 학생 1명당 다층 처분(여러 호 동시 부여)을 두텁게 내리는 학교.
        분모를 가해 학생 수로 잡아 보호조치 카드와 일관된 의미. 한 학생에게 여러 호 중복 부여(예: 5호 + 6호)되면 비율↑.
      </Insight>
    </Card>
  );
}

// ─── Card 18: 피해자 보호조치 활용 가장 높은 학교 TOP
function TopProtectionSchoolsCard({ data, selected }: { data: DataSet; selected: School | null }) {
  const items = useMemo(() => {
    const out: { s: School; perVictim: number; victims: number }[] = [];
    for (const s of data.schools) {
      let victims = 0, measures = 0;
      for (const y of data.years) {
        const v = s.violence[y];
        if (!v?.cases) continue;
        victims += (v.cases.s1?.v ?? 0) + (v.cases.s2?.v ?? 0);
        if (v.victimMeasures) {
          for (let i = 0; i < 5; i++) measures += v.victimMeasures[i] ?? 0;
        }
      }
      if (victims < 3) continue;
      out.push({ s, perVictim: measures / victims, victims });
    }
    return out.sort((a, b) => b.perVictim - a.perVictim).slice(0, 12);
  }, [data]);
  return (
    <Card title="피해 학생 보호조치 활용 가장 높은 학교 TOP 12" subtitle="피해 학생 1명당 평균 보호조치 수 (피해 3명+)">
      {items.length === 0 ? (
        <Empty msg="조건을 만족하는 학교 없음" />
      ) : (
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {items.map(({ s, perVictim, victims }, i) => {
            const isMine = selected?.code === s.code;
            return (
              <div key={s.code} className={cn("flex items-center gap-2 text-xs", isMine && "font-bold")}>
                <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                <SchoolLink school={s} className={cn("flex-1 truncate", isMine && "text-red-600 dark:text-red-400")}>
                  {s.name}{isMine && " ← 우리 학교"}
                </SchoolLink>
                <span className="text-[10px] text-muted-foreground w-20 text-right truncate">
                  {[s.city, s.district].filter(Boolean).join(" ")}
                </span>
                <span className="tabular-nums w-12 text-right text-green-700 dark:text-green-400 font-semibold">{perVictim.toFixed(2)}</span>
                <span className="text-[10px] text-muted-foreground w-10 text-right">피해 {victims}</span>
              </div>
            );
          })}
        </div>
      )}
      <Insight>
        한 피해 학생당 다층 보호조치(심리상담·일시보호·치료·학급교체 등)를 두텁게 부여하는 학교.
        분모를 사안이 아닌 피해 학생 수로 잡아 집단 피해 학교가 비율 부풀려져 상위에 가는 왜곡 보정.
      </Insight>
    </Card>
  );
}

// ─── Card 19: 특별교육 이수율 (학생 vs 보호자) ──
function SpecialEdCard({ data, selected }: { data: DataSet; selected: School | null }) {
  const stats = useMemo(() => {
    let target = 0, studentDone = 0, parentDone = 0;
    let mySchool: { target: number; studentDone: number; parentDone: number } | null = null;
    for (const s of data.schools) {
      let t = 0, sd = 0, pd = 0;
      for (const y of data.years) {
        const e = s.violence[y]?.specialEd;
        if (!e) continue;
        t += e.target; sd += e.studentDone; pd += e.parentDone;
      }
      target += t; studentDone += sd; parentDone += pd;
      if (selected && s.code === selected.code && t > 0) mySchool = { target: t, studentDone: sd, parentDone: pd };
    }
    return {
      avgStudent: target > 0 ? (studentDone / target) * 100 : 0,
      avgParent: target > 0 ? (parentDone / target) * 100 : 0,
      myStudent: mySchool && mySchool.target > 0 ? (mySchool.studentDone / mySchool.target) * 100 : null,
      myParent: mySchool && mySchool.target > 0 ? (mySchool.parentDone / mySchool.target) * 100 : null,
      target, studentDone, parentDone,
    };
  }, [data, selected]);

  const Bar = ({ label, value, avg }: { label: string; value: number; avg: number }) => (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-semibold">{value.toFixed(1)}%</span>
      </div>
      <div className="bg-muted h-2 rounded-sm overflow-hidden relative">
        <div className="h-full" style={{ width: `${value}%`, background: value >= 80 ? "#16a34a" : value >= 60 ? "#facc15" : "#dc2626" }} />
        <div className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: `${avg}%` }} title={`전국 평균 ${avg.toFixed(1)}%`} />
      </div>
    </div>
  );

  return (
    <Card title="특별교육 이수율 (가해학생·보호자)" subtitle="학폭예방법 17조 9항 이수 현황">
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">전국 평균</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded bg-muted/40 p-2">
              <div className="text-[10px] text-muted-foreground">학생 이수율</div>
              <div className="text-base font-semibold tabular-nums">{stats.avgStudent.toFixed(1)}%</div>
            </div>
            <div className="rounded bg-muted/40 p-2">
              <div className="text-[10px] text-muted-foreground">보호자 이수율</div>
              <div className="text-base font-semibold tabular-nums">{stats.avgParent.toFixed(1)}%</div>
            </div>
          </div>
        </div>
        {stats.myStudent != null && stats.myParent != null && (
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">우리 학교 vs 전국 평균(흰 선)</div>
            <div className="flex flex-col gap-1.5">
              <Bar label="학생 이수율" value={stats.myStudent} avg={stats.avgStudent} />
              <Bar label="보호자 이수율" value={stats.myParent} avg={stats.avgParent} />
            </div>
          </div>
        )}
      </div>
      <Insight>
        가해학생 본인뿐 아니라 <b>보호자에게도 특별교육 이수 의무</b>가 있음 (학폭예방법 17조 9항).
        전국적으로 학생 이수율 <b>{stats.avgStudent.toFixed(0)}%</b> vs 보호자 이수율 <b>{stats.avgParent.toFixed(0)}%</b> —
        보호자 참여율이 낮으면 가정 내 후속 관리·재발 방지가 어려움.
      </Insight>
    </Card>
  );
}

// ─── 공통 ───────────────────────────────────────
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3 flex flex-col gap-2">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
function Empty({ msg }: { msg: string }) {
  return <div className="text-xs text-muted-foreground py-4 text-center">{msg}</div>;
}

// 학교 링크 — 클릭 시 confirm 다이얼로그 띄움. 평상시에도 링크임을 색상+밑줄로 표시.
const PickContext = createContext<((s: School) => void) | null>(null);
function SchoolLink({ school, className, children }: { school: School; className?: string; children?: React.ReactNode }) {
  const requestPick = useContext(PickContext);
  if (!requestPick) return <span className={className}>{children ?? school.name}</span>;
  return (
    <button
      type="button"
      onClick={() => requestPick(school)}
      className={cn(
        "text-left text-blue-700 dark:text-blue-400 underline decoration-blue-300/60 dark:decoration-blue-500/40 underline-offset-2 hover:decoration-blue-700 dark:hover:decoration-blue-300 cursor-pointer",
        className,
      )}
      title={`${school.name} 학교 패널로 이동`}
    >
      {children ?? school.name}
    </button>
  );
}
function Insight({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 px-2 py-1.5 rounded text-[10px] leading-relaxed bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 border border-blue-100 dark:border-blue-900">
      💡 {children}
    </div>
  );
}
function percentileColor(p: number): string {
  if (p < 25) return "#22c55e";  // 안전
  if (p < 50) return "#84cc16";
  if (p < 75) return "#f59e0b";
  if (p < 90) return "#f97316";
  return "#ef4444";              // 위험
}
const TYPE_COLORS = ["#ef4444","#f97316","#eab308","#84cc16","#06b6d4","#a855f7","#ec4899","#94a3b8"];

// Badge import keep for future
export const __badge_keep = Badge;
