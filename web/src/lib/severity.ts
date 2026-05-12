/**
 * 학폭 심각도 → 색상/라벨. 심의 + 자체해결 합산 기준.
 * - rate 모드: ((심의+자체) / 데이터년수 / 학생수) × 100 (학생100명당 연 사건)
 * - count 모드: (심의+자체) 4년 절대 합계 건수
 *
 * 전국 분포 (12,563교):
 *   비율: p25=0.43 · p50=0.93 · p75=1.85 · p90=3.18 · p95=4.31 · p99=7.69
 *   건수: p25=3    · p50=12   · p75=28   · p90=51   · p95=70   · p99=115
 */
export type Severity = "none" | "low" | "moderate" | "high" | "severe" | "unknown";
export type Metric = "rate" | "count";

export function severityOfRate(rate: number | null, hasData: boolean): Severity {
  if (!hasData) return "unknown";
  if (rate == null || rate === 0) return "none";
  if (rate < 0.5) return "low";        // ~p25
  if (rate < 2.0) return "moderate";   // ~p75
  if (rate < 4.5) return "high";       // ~p95
  return "severe";                     // p95+
}

export function severityOfCount(total: number, hasData: boolean): Severity {
  if (!hasData) return "unknown";
  if (total === 0) return "none";
  if (total < 5) return "low";         // ~p25
  if (total < 30) return "moderate";   // ~p75
  if (total < 70) return "high";       // ~p95
  return "severe";                     // p95+
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

export const SEVERITY_COLOR: Record<Severity, string> = {
  unknown: "#9ca3af",  // gray-400
  none: "#10b981",     // emerald-500
  low: "#84cc16",      // lime-500
  moderate: "#facc15", // yellow-400
  high: "#f97316",     // orange-500
  severe: "#dc2626",   // red-600
};

export const SEVERITY_LABEL_RATE: Record<Severity, string> = {
  unknown: "데이터 없음",
  none: "발생 없음",
  low: "낮음 (<0.5)",
  moderate: "보통 (0.5–2.0)",
  high: "높음 (2.0–4.5)",
  severe: "심각 (≥4.5)",
};

export const SEVERITY_LABEL_COUNT: Record<Severity, string> = {
  unknown: "데이터 없음",
  none: "발생 없음",
  low: "낮음 (1–4건)",
  moderate: "보통 (5–29건)",
  high: "높음 (30–69건)",
  severe: "심각 (≥70건)",
};

export function severityLabel(metric: Metric): Record<Severity, string> {
  return metric === "rate" ? SEVERITY_LABEL_RATE : SEVERITY_LABEL_COUNT;
}

export const SEVERITY_ORDER: Severity[] = ["unknown", "none", "low", "moderate", "high", "severe"];
