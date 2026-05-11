/**
 * 학폭 심각도 → 색상/라벨.
 * `rate`는 (4년 평균 사건수 / 학생수) × 100, 단위 %.
 * 즉 1.0 = 학생 100명당 매년 1건 평균.
 */
export type Severity = "none" | "low" | "moderate" | "high" | "severe" | "unknown";

export function severityOf(rate: number | null, hasData: boolean): Severity {
  if (!hasData) return "unknown";
  if (rate == null || rate === 0) return "none";
  if (rate < 0.5) return "low";
  if (rate < 1.5) return "moderate";
  if (rate < 3.0) return "high";
  return "severe";
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  unknown: "#9ca3af",  // gray-400
  none: "#10b981",     // emerald-500
  low: "#84cc16",      // lime-500
  moderate: "#facc15", // yellow-400
  high: "#f97316",     // orange-500
  severe: "#dc2626",   // red-600
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  unknown: "데이터 없음",
  none: "발생 없음",
  low: "낮음 (<0.5)",
  moderate: "보통 (0.5–1.5)",
  high: "높음 (1.5–3.0)",
  severe: "심각 (≥3.0)",
};

export const SEVERITY_ORDER: Severity[] = ["unknown", "none", "low", "moderate", "high", "severe"];
