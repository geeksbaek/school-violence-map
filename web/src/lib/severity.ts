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

export function severityOfRate(rate: number | null, hasData: boolean): Severity {
  if (!hasData) return "unknown";
  if (rate == null || rate === 0) return "none";
  if (rate < 0.5) return "veryLow";    // ~p25
  if (rate < 1.0) return "low";        // ~p50
  if (rate < 2.0) return "moderate";   // ~p75
  if (rate < 3.0) return "elevated";   // ~p90
  if (rate < 4.5) return "high";       // ~p95
  if (rate < 7.5) return "veryHigh";   // ~p99
  return "severe";                     // p99+
}

export function severityOfCount(total: number, hasData: boolean): Severity {
  if (!hasData) return "unknown";
  if (total === 0) return "none";
  if (total < 4) return "veryLow";     // ~p25
  if (total < 13) return "low";        // ~p50
  if (total < 29) return "moderate";   // ~p75
  if (total < 51) return "elevated";   // ~p90
  if (total < 70) return "high";       // ~p95
  if (total < 115) return "veryHigh";  // ~p99
  return "severe";                     // p99+
}

export function severityOf(
  metric: Metric,
  rate: number | null,
  total: number,
  hasData: boolean,
): Severity {
  return metric === "rate"
    ? severityOfRate(rate, hasData)
    : severityOfCount(total, hasData);
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

export const SEVERITY_LABEL_RATE: Record<Severity, string> = {
  unknown: "데이터 없음",
  none: "발생 없음",
  veryLow: "매우 낮음 (<0.5)",
  low: "낮음 (0.5–1.0)",
  moderate: "보통 (1.0–2.0)",
  elevated: "다소 높음 (2.0–3.0)",
  high: "높음 (3.0–4.5)",
  veryHigh: "매우 높음 (4.5–7.5)",
  severe: "심각 (≥7.5)",
};

export const SEVERITY_LABEL_COUNT: Record<Severity, string> = {
  unknown: "데이터 없음",
  none: "발생 없음",
  veryLow: "매우 낮음 (1–3건)",
  low: "낮음 (4–12건)",
  moderate: "보통 (13–28건)",
  elevated: "다소 높음 (29–50건)",
  high: "높음 (51–69건)",
  veryHigh: "매우 높음 (70–114건)",
  severe: "심각 (≥115건)",
};

export function severityLabel(metric: Metric): Record<Severity, string> {
  return metric === "rate" ? SEVERITY_LABEL_RATE : SEVERITY_LABEL_COUNT;
}

export const SEVERITY_ORDER: Severity[] = [
  "unknown", "none", "veryLow", "low", "moderate", "elevated", "high", "veryHigh", "severe",
];
