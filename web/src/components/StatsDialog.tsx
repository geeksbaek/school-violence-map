import { useMemo } from "react";
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
}

const KIND_ORDER = ["초등", "중학", "고등"] as const;
const SIZE_ORDER: SizeBucket[] = ["<200", "200–500", "500–1000", "1000+"];
const FOUND_ORDER = ["공립", "사립", "국립"] as const;

export function StatsDialog({ open, onOpenChange, data, selected }: Props) {
  const agg = useMemo(() => computeAggregates(data.schools, data.years), [data]);

  // 선택된 학교의 백분위
  const percentiles = useMemo(() => {
    if (!selected) return null;
    const all = data.schools;
    const mySido = selected.sido || selected.city;
    const sameKind = all.filter((s) => s.kind === selected.kind);
    const sameSido = all.filter((s) => (s.sido || s.city) === mySido);
    const sameSgg = all.filter((s) => s.city === selected.city && s.district === selected.district);
    return {
      national: schoolPercentile(selected, all, "전국"),
      kind: schoolPercentile(selected, sameKind, `전국 ${selected.kind}`),
      sido: schoolPercentile(selected, sameSido, mySido),
      sgg: schoolPercentile(selected, sameSgg, [selected.city, selected.district].filter(Boolean).join(" ")),
    };
  }, [selected, data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>전국 학교폭력 통계</DialogTitle>
          <DialogDescription>
            학교알리미 공시 4개년({data.years[0]}~{data.years[data.years.length - 1]}) 기준 · 전국 {agg.all.count.toLocaleString()}개 학교
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 1. 우리 학교 위치 */}
          <SchoolPositionCard selected={selected} percentiles={percentiles} all={agg.all} />

          {/* 2. 시·도별 평균 ranking */}
          <SidoRankingCard agg={agg} selected={selected} />

          {/* 3. 초→중→고 변화 */}
          <KindTransitionCard agg={agg} typeLabels={data.typeLabels} />

          {/* 4. 학교 규모별 평균 */}
          <SizeBucketCard agg={agg} selected={selected} />

          {/* 5. 공립 vs 사립 vs 국립 */}
          <FoundationCard agg={agg} selected={selected} />

          {/* 6. 학교의 사건 처리 방식 */}
          <SelfRatioCard agg={agg} selected={selected} />

          {/* 7. 여학교 vs 공학 통념 검증 */}
          <GenderCard agg={agg} typeLabels={data.typeLabels} selected={selected} />

          {/* 8. 가장 평화로운 동네 TOP 10 */}
          <PeacefulSggCard agg={agg} selected={selected} />

          {/* 9. 학생수 변화 vs 학폭 */}
          <TrendCard agg={agg} selected={selected} />

          {/* 10. 교사 1인당 학생수 vs 학폭 */}
          <TeacherRatioCard agg={agg} selected={selected} />
        </div>

        <div className="text-[10px] text-muted-foreground pt-1 border-t">
          ⚠ 공시 누락·은폐로 0건 학교 해석에 주의. 비율은 학생 100명 기준 연 평균. 학생수 미보유 학교는 비율 계산에서 제외.
        </div>
      </DialogContent>
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
function SidoRankingCard({ agg, selected }: { agg: ReturnType<typeof computeAggregates>; selected: School | null }) {
  const items = useMemo(() => {
    return Object.entries(agg.bySido)
      .map(([k, v]) => ({ name: k, ...v }))
      .filter((x) => x.withData >= 5 && x.name !== "교육부")
      .sort((a, b) => b.avgRate - a.avgRate);
  }, [agg]);
  const max = Math.max(0.001, ...items.map((x) => x.avgRate));
  const mySido = selected?.sido || selected?.city;

  return (
    <Card title="시·도별 평균 비율" subtitle="학생 100명·년 기준 (17개 광역)">
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
    </Card>
  );
}

// ─── Card 3: 초→중→고 변화 ──────────────────────────
function KindTransitionCard({ agg, typeLabels }: { agg: ReturnType<typeof computeAggregates>; typeLabels: string[] }) {
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
        {/* 유형 비중 stacked bar */}
        <div className="flex flex-col gap-1">
          <div className="text-[10px] text-muted-foreground">학교종류별 폭력 유형 비중</div>
          {KIND_ORDER.map((k) => {
            const v = agg.byKind[k];
            if (!v) return null;
            return (
              <div key={k} className="flex items-center gap-2 text-[10px]">
                <span className="w-8 text-muted-foreground">{k}</span>
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
    </Card>
  );
}

// ─── Card 5: 공립 / 사립 / 국립 ──────────────────────
function FoundationCard({ agg, selected }: { agg: ReturnType<typeof computeAggregates>; selected: School | null }) {
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
    </Card>
  );
}

// ─── Card 8: 가장 평화로운 동네 TOP 10 ──────────
function PeacefulSggCard({ agg, selected }: { agg: ReturnType<typeof computeAggregates>; selected: School | null }) {
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
    </Card>
  );
}

// ─── Card 9: 학생수 변화 vs 학폭 ─────────────────
function TrendCard({ agg, selected }: { agg: ReturnType<typeof computeAggregates>; selected: School | null }) {
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
    </Card>
  );
}

// ─── Card 10: 교사 1인당 학생수 vs 학폭 ──────────
function TeacherRatioCard({ agg, selected }: { agg: ReturnType<typeof computeAggregates>; selected: School | null }) {
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
