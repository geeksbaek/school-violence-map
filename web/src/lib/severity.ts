/**
 * 학폭 심각도 → 색상/라벨.
 * - rate 모드: (4년 평균 사건수 / 학생수) × 100 (학생100명당 연 사건)
 * - count 모드: 4년 절대 합계 건수
 */
export type Severity = "none" | "low" | "moderate" | "high" | "severe" | "unknown";
export type Metric = "rate" | "count";

export function severityOfRate(rate: number | null, hasData: boolean): Severity {
  if (!hasData) return "unknown";
  if (rate == null || rate === 0) return "none";
  if (rate < 0.5) return "low";
  if (rate < 1.5) return "moderate";
  if (rate < 3.0) return "high";
  return "severe";
}

export function severityOfCount(total: number, hasData: boolean): Severity {
  if (!hasData) return "unknown";
  if (total === 0) return "none";
  if (total < 5) return "low";
  if (total < 15) return "moderate";
  if (total < 30) return "high";
  return "severe";
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
  moderate: "보통 (0.5–1.5)",
  high: "높음 (1.5–3.0)",
  severe: "심각 (≥3.0)",
};

export const SEVERITY_LABEL_COUNT: Record<Severity, string> = {
  unknown: "데이터 없음",
  none: "발생 없음",
  low: "낮음 (1–4건)",
  moderate: "보통 (5–14건)",
  high: "높음 (15–29건)",
  severe: "심각 (≥30건)",
};

export function severityLabel(metric: Metric): Record<Severity, string> {
  return metric === "rate" ? SEVERITY_LABEL_RATE : SEVERITY_LABEL_COUNT;
}

export const SEVERITY_ORDER: Severity[] = ["unknown", "none", "low", "moderate", "high", "severe"];
