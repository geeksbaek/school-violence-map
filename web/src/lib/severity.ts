/**
 * 학폭 심각도 → 색상/라벨. 심의 + 자체해결 합산 기준.
 * - rate 모드: ((심의+자체) / 데이터년수 / 학생수) × 100 (학생100명당 연 사건)
 * - count 모드: (심의+자체) 4년 절대 합계 건수
 *
 * 전국 분포 (12,563교):
 *   비율: p25=0.43 · p50=0.93 · p75=1.85 · p90=3.18 · p95=4.31 · p99=7.69
 *   건수: p25=3    · p50=12   · p75=28   · p90=51   · p95=70   · p99=115
 *
 * 7단계 (none/unknown 제외) — 백분위 기반 경계.
 */
export type Severity =
  | "unknown"
  | "none"
  | "veryLow"
  | "low"
  | "moderate"
  | "elevated"
  | "high"
  | "veryHigh"
  | "severe";
export type Metric = "rate" | "count";
export type SeverityBreaks = [number, number, number, number, number, number];

export interface SeverityThresholds {
  rate: SeverityBreaks;
  count: SeverityBreaks;
}

export interface SeverityStatLike {
  total: number;
  ratePer100: number | null;
  hasData: boolean;
}

export const DEFAULT_SEVERITY_THRESHOLDS: SeverityThresholds = {
  rate: [0.5, 1.0, 2.0, 3.0, 4.5, 7.5],
  count: [4, 13, 29, 51, 70, 115],
};

const BREAK_PERCENTILES = [25, 50, 75, 90, 95, 99] as const;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const weight = pos - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function roundBreak(value: number, metric: Metric): number {
  if (metric === "count") return Math.max(1, Math.round(value));
  return Math.round(value * 10) / 10;
}

function buildBreaks(values: number[], metric: Metric, fallback: SeverityBreaks): SeverityBreaks {
  if (values.length < 20) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return BREAK_PERCENTILES.map((p) => roundBreak(percentile(sorted, p), metric)) as SeverityBreaks;
}

export function buildSeverityThresholds(stats: Iterable<SeverityStatLike>): SeverityThresholds {
  const rateValues: number[] = [];
  const countValues: number[] = [];
  for (const stat of stats) {
    if (!stat.hasData) continue;
    if (stat.ratePer100 != null && stat.ratePer100 > 0) rateValues.push(stat.ratePer100);
    if (stat.total > 0) countValues.push(stat.total);
  }
  return {
    rate: buildBreaks(rateValues, "rate", DEFAULT_SEVERITY_THRESHOLDS.rate),
    count: buildBreaks(countValues, "count", DEFAULT_SEVERITY_THRESHOLDS.count),
  };
}

export function severityOfRate(
  rate: number | null,
  hasData: boolean,
  thresholds: SeverityBreaks = DEFAULT_SEVERITY_THRESHOLDS.rate,
): Severity {
  if (!hasData) return "unknown";
  if (rate == null || rate === 0) return "none";
  if (rate < thresholds[0]) return "veryLow";
  if (rate < thresholds[1]) return "low";
  if (rate < thresholds[2]) return "moderate";
  if (rate < thresholds[3]) return "elevated";
  if (rate < thresholds[4]) return "high";
  if (rate < thresholds[5]) return "veryHigh";
  return "severe";
}

export function severityOfCount(
  total: number,
  hasData: boolean,
  thresholds: SeverityBreaks = DEFAULT_SEVERITY_THRESHOLDS.count,
): Severity {
  if (!hasData) return "unknown";
  if (total === 0) return "none";
  if (total < thresholds[0]) return "veryLow";
  if (total < thresholds[1]) return "low";
  if (total < thresholds[2]) return "moderate";
  if (total < thresholds[3]) return "elevated";
  if (total < thresholds[4]) return "high";
  if (total < thresholds[5]) return "veryHigh";
  return "severe";
}

export function severityOf(
  metric: Metric,
  rate: number | null,
  total: number,
  hasData: boolean,
  thresholds: SeverityThresholds = DEFAULT_SEVERITY_THRESHOLDS,
): Severity {
  return metric === "rate"
    ? severityOfRate(rate, hasData, thresholds.rate)
    : severityOfCount(total, hasData, thresholds.count);
}

// ColorBrewer RdYlGn 7-class 역순 + none(emerald) + unknown(gray)
export const SEVERITY_COLOR: Record<Severity, string> = {
  unknown: "#9ca3af",  // gray-400
  none: "#10b981",     // emerald-500 (cool green = 발생없음)
  veryLow: "#84cc16",  // lime-500
  low: "#bef264",      // lime-300
  moderate: "#fde047", // yellow-300
  elevated: "#fb923c", // orange-400
  high: "#f97316",     // orange-500
  veryHigh: "#ef4444", // red-500
  severe: "#991b1b",   // red-800
};

function fmtRate(n: number): string {
  return n.toFixed(1);
}

function fmtCount(n: number): string {
  return `${Math.round(n)}건`;
}

function rateLabels(b: SeverityBreaks): Record<Severity, string> {
  return {
    unknown: "데이터 없음",
    none: "발생 없음",
    veryLow: `매우 낮음 (<${fmtRate(b[0])})`,
    low: `낮음 (${fmtRate(b[0])}–${fmtRate(b[1])})`,
    moderate: `보통 (${fmtRate(b[1])}–${fmtRate(b[2])})`,
    elevated: `다소 높음 (${fmtRate(b[2])}–${fmtRate(b[3])})`,
    high: `높음 (${fmtRate(b[3])}–${fmtRate(b[4])})`,
    veryHigh: `매우 높음 (${fmtRate(b[4])}–${fmtRate(b[5])})`,
    severe: `심각 (≥${fmtRate(b[5])})`,
  };
}

function countLabels(b: SeverityBreaks): Record<Severity, string> {
  return {
    unknown: "데이터 없음",
    none: "발생 없음",
    veryLow: `매우 낮음 (<${fmtCount(b[0])})`,
    low: `낮음 (${fmtCount(b[0])}–${fmtCount(b[1])})`,
    moderate: `보통 (${fmtCount(b[1])}–${fmtCount(b[2])})`,
    elevated: `다소 높음 (${fmtCount(b[2])}–${fmtCount(b[3])})`,
    high: `높음 (${fmtCount(b[3])}–${fmtCount(b[4])})`,
    veryHigh: `매우 높음 (${fmtCount(b[4])}–${fmtCount(b[5])})`,
    severe: `심각 (≥${fmtCount(b[5])})`,
  };
}

export const SEVERITY_LABEL_RATE: Record<Severity, string> = rateLabels(DEFAULT_SEVERITY_THRESHOLDS.rate);
export const SEVERITY_LABEL_COUNT: Record<Severity, string> = countLabels(DEFAULT_SEVERITY_THRESHOLDS.count);

export function severityLabel(
  metric: Metric,
  thresholds: SeverityThresholds = DEFAULT_SEVERITY_THRESHOLDS,
): Record<Severity, string> {
  return metric === "rate" ? rateLabels(thresholds.rate) : countLabels(thresholds.count);
}

export const SEVERITY_ORDER: Severity[] = [
  "unknown", "none", "veryLow", "low", "moderate", "elevated", "high", "veryHigh", "severe",
];
