import type { School } from "@/types";

/**
 * 선택한 유형 인덱스 집합 기준으로 학교별 합계·평균비율 재계산.
 * - hasData: 어느 한 공시년도라도 학폭 데이터(0건 포함) 있는지
 * - total: 선택 유형의 4년 합계
 * - years: 데이터 있는 공시년도 수
 * - ratePer100: total / years / studentTotal × 100 (학생100명당 연 사건)
 */
export interface SchoolStat {
  total: number;
  years: number;
  ratePer100: number | null;
  hasData: boolean;
}

const ALL_BITS = 0b11111111; // 8개 유형 모두

export function computeStat(
  school: School,
  years: readonly string[],
  typesMask: number,
): SchoolStat {
  let total = 0;
  let dataYears = 0;
  for (const y of years) {
    const v = school.violence[y];
    if (!v) continue;
    dataYears++;
    if (typesMask === ALL_BITS) {
      total += v.total;
    } else {
      for (let i = 0; i < 8; i++) {
        if (typesMask & (1 << i)) total += v.types[i] ?? 0;
      }
    }
  }
  const ratePer100 =
    school.studentTotal && school.studentTotal > 0 && dataYears > 0
      ? Math.round((total / dataYears / school.studentTotal) * 100 * 1000) / 1000
      : null;
  return { total, years: dataYears, ratePer100, hasData: dataYears > 0 };
}

export function bitsToSet(mask: number): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) s.add(i);
  return s;
}
export function setToBits(s: Set<number>): number {
  let m = 0;
  for (const i of s) m |= 1 << i;
  return m;
}
export const ALL_TYPES_MASK = ALL_BITS;

// ─── 학부모 인사이트용 집계 ───────────────────────────────

export type SizeBucket = "<200" | "200–500" | "500–1000" | "1000+";

export function sizeBucket(n: number | null | undefined): SizeBucket | null {
  if (n == null) return null;
  if (n < 200) return "<200";
  if (n < 500) return "200–500";
  if (n < 1000) return "500–1000";
  return "1000+";
}

export interface SegmentStat {
  count: number;
  withData: number;
  zeroFour: number;
  avgRate: number;
  avgViolence: number;
  avgSelfResolved: number;
  selfRatio: number;
  typeShare: number[];
  yearTotals: { year: string; violence: number; selfResolved: number }[];
}

interface AggInput {
  count: number;
  withData: number;
  zeroFour: number;
  rateSum: number;
  rateCount: number;
  violenceSum: number;
  selfSum: number;
  typeSum: number[];
  yearViolence: Map<string, number>;
  yearSelf: Map<string, number>;
}
function emptyAgg(years: readonly string[]): AggInput {
  return {
    count: 0, withData: 0, zeroFour: 0,
    rateSum: 0, rateCount: 0, violenceSum: 0, selfSum: 0,
    typeSum: Array(8).fill(0),
    yearViolence: new Map(years.map((y) => [y, 0])),
    yearSelf: new Map(years.map((y) => [y, 0])),
  };
}
function feed(agg: AggInput, s: School, years: readonly string[]) {
  agg.count++;
  let totalV = 0, totalS = 0, hadAny = false;
  for (const y of years) {
    const v = s.violence[y];
    const sr = s.selfResolved?.[y];
    if (v) {
      hadAny = true;
      totalV += v.total;
      agg.yearViolence.set(y, (agg.yearViolence.get(y) ?? 0) + v.total);
      for (let i = 0; i < 8; i++) agg.typeSum[i] += v.types[i] ?? 0;
    }
    if (sr) {
      hadAny = true;
      totalS += sr.total;
      agg.yearSelf.set(y, (agg.yearSelf.get(y) ?? 0) + sr.total);
    }
  }
  if (hadAny) {
    agg.withData++;
    agg.violenceSum += totalV;
    agg.selfSum += totalS;
    if (totalV === 0 && totalS === 0) agg.zeroFour++;
    if (s.violenceRatePer100 != null) {
      agg.rateSum += s.violenceRatePer100;
      agg.rateCount++;
    }
  }
}
function finalize(agg: AggInput, years: readonly string[]): SegmentStat {
  const typeTotal = agg.typeSum.reduce((a, b) => a + b, 0);
  const totalAll = agg.violenceSum + agg.selfSum;
  return {
    count: agg.count,
    withData: agg.withData,
    zeroFour: agg.zeroFour,
    avgRate: agg.rateCount > 0 ? agg.rateSum / agg.rateCount : 0,
    avgViolence: agg.withData > 0 ? agg.violenceSum / agg.withData : 0,
    avgSelfResolved: agg.withData > 0 ? agg.selfSum / agg.withData : 0,
    selfRatio: totalAll > 0 ? agg.selfSum / totalAll : 0,
    typeShare: typeTotal > 0 ? agg.typeSum.map((v) => v / typeTotal) : Array(8).fill(0),
    yearTotals: years.map((y) => ({
      year: y,
      violence: agg.yearViolence.get(y) ?? 0,
      selfResolved: agg.yearSelf.get(y) ?? 0,
    })),
  };
}

export interface AggregateResult {
  all: SegmentStat;
  byKind: Record<string, SegmentStat>;
  byFoundation: Record<string, SegmentStat>;
  bySize: Record<SizeBucket, SegmentStat>;
  bySido: Record<string, SegmentStat>;
}

export function computeAggregates(schools: School[], years: readonly string[]): AggregateResult {
  const all = emptyAgg(years);
  const byKind: Record<string, AggInput> = {};
  const byFoundation: Record<string, AggInput> = {};
  const bySize: Record<string, AggInput> = {};
  const bySido: Record<string, AggInput> = {};

  for (const s of schools) {
    feed(all, s, years);
    (byKind[s.kind] ??= emptyAgg(years));
    feed(byKind[s.kind], s, years);
    if (s.foundation) {
      (byFoundation[s.foundation] ??= emptyAgg(years));
      feed(byFoundation[s.foundation], s, years);
    }
    const sb = sizeBucket(s.studentTotal);
    if (sb) {
      (bySize[sb] ??= emptyAgg(years));
      feed(bySize[sb], s, years);
    }
    const sido = s.sido || s.city;
    if (sido) {
      (bySido[sido] ??= emptyAgg(years));
      feed(bySido[sido], s, years);
    }
  }

  const fin = (m: Record<string, AggInput>) => {
    const out: Record<string, SegmentStat> = {};
    for (const k of Object.keys(m)) out[k] = finalize(m[k], years);
    return out;
  };
  return {
    all: finalize(all, years),
    byKind: fin(byKind),
    byFoundation: fin(byFoundation),
    bySize: fin(bySize) as Record<SizeBucket, SegmentStat>,
    bySido: fin(bySido),
  };
}

// ─── 선택된 학교의 백분위 (낮을수록 안전) ─────────────
export interface PercentileInfo {
  scope: string;
  count: number;
  rank: number;
  percentile: number;   // 0~100, 100이면 가장 위험
}

export interface Verdict {
  label: string;
  icon: string;
  bg: string;
  fg: string;
}
export function verdictFromPercentile(p: number, kind?: string): Verdict {
  const peer = kind ? `또래 ${kind}` : "또래";
  if (p < 20) return { label: `${peer} 중 매우 안전한 편 (하위 20%)`, icon: "🟢", bg: "#dcfce7", fg: "#14532d" };
  if (p < 40) return { label: `${peer} 평균보다 안전 (하위 40%)`, icon: "🟢", bg: "#ecfccb", fg: "#365314" };
  if (p < 60) return { label: `${peer} 평균 수준`, icon: "⚪", bg: "#f1f5f9", fg: "#334155" };
  if (p < 80) return { label: `${peer} 평균보다 다소 높음 (상위 ${100 - p}%)`, icon: "🟠", bg: "#ffedd5", fg: "#9a3412" };
  if (p < 95) return { label: `${peer} 중 높은 편 (상위 ${100 - p}%)`, icon: "🔴", bg: "#fee2e2", fg: "#991b1b" };
  return { label: `${peer} 중 매우 높음 (상위 ${100 - p}%)`, icon: "🔴", bg: "#fecaca", fg: "#7f1d1d" };
}

export function schoolPercentile(
  target: School,
  pool: School[],
  scopeLabel: string,
): PercentileInfo | null {
  if (target.violenceRatePer100 == null) return null;
  const rates = pool
    .filter((s) => s.violenceRatePer100 != null && s.code !== target.code)
    .map((s) => s.violenceRatePer100 as number);
  if (rates.length < 2) return null;
  const lower = rates.filter((r) => r < (target.violenceRatePer100 as number)).length;
  const equal = rates.filter((r) => r === (target.violenceRatePer100 as number)).length;
  const total = rates.length + 1;
  const rank = lower + Math.ceil(equal / 2) + 1;
  const percentile = Math.round((rank / total) * 100);
  return { scope: scopeLabel, count: total, rank, percentile };
}
