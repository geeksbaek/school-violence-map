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
