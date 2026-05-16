import type { School, SchoolCareerRow } from "@/types";

export type CareerSortMode =
  | "advancementRate"
  | "juniorCollegeRate"
  | "universityRate"
  | "overseasJuniorCollegeRate"
  | "overseasUniversityRate"
  | "overseasRate"
  | "employmentRate"
  | "otherRateDesc"
  | "otherRateAsc"
  | "graduates"
  | "advancementCount"
  | "juniorCollegeCount"
  | "universityCount"
  | "overseasJuniorCollegeCount"
  | "overseasUniversityCount"
  | "overseasCount"
  | "employmentCount"
  | "otherCount";

export type SchoolListSortMode = "violence" | CareerSortMode;

export type CareerSortSpec = {
  value: CareerSortMode;
  label: string;
  row: "rates" | "total";
  key: keyof SchoolCareerRow;
  format: "percent" | "count";
  asc?: boolean;
};

export const CAREER_SORT_OPTIONS = [
  { value: "advancementRate", label: "전체 진학률", row: "rates", key: "advancementTotal", format: "percent" },
  { value: "juniorCollegeRate", label: "전문대 진학률", row: "rates", key: "juniorCollege", format: "percent" },
  { value: "universityRate", label: "4년제 진학률", row: "rates", key: "university", format: "percent" },
  { value: "overseasJuniorCollegeRate", label: "국외 전문대 진학률", row: "rates", key: "overseasJuniorCollege", format: "percent" },
  { value: "overseasUniversityRate", label: "국외 4년제 진학률", row: "rates", key: "overseasUniversity", format: "percent" },
  { value: "overseasRate", label: "국외 진학률", row: "rates", key: "overseasTotal", format: "percent" },
  { value: "employmentRate", label: "취업률", row: "rates", key: "employed", format: "percent" },
  { value: "otherRateDesc", label: "기타 비율 높은순", row: "rates", key: "other", format: "percent" },
  { value: "otherRateAsc", label: "기타 비율 낮은순", row: "rates", key: "other", format: "percent", asc: true },
  { value: "graduates", label: "졸업자 수", row: "total", key: "graduates", format: "count" },
  { value: "advancementCount", label: "전체 진학자 수", row: "total", key: "advancementTotal", format: "count" },
  { value: "juniorCollegeCount", label: "전문대 진학자 수", row: "total", key: "juniorCollege", format: "count" },
  { value: "universityCount", label: "4년제 진학자 수", row: "total", key: "university", format: "count" },
  { value: "overseasJuniorCollegeCount", label: "국외 전문대 진학자 수", row: "total", key: "overseasJuniorCollege", format: "count" },
  { value: "overseasUniversityCount", label: "국외 4년제 진학자 수", row: "total", key: "overseasUniversity", format: "count" },
  { value: "overseasCount", label: "국외 진학자 수", row: "total", key: "overseasTotal", format: "count" },
  { value: "employmentCount", label: "취업자 수", row: "total", key: "employed", format: "count" },
  { value: "otherCount", label: "기타 인원", row: "total", key: "other", format: "count" },
] as const satisfies readonly CareerSortSpec[];

export const CAREER_SORT_BY_MODE = Object.fromEntries(
  CAREER_SORT_OPTIONS.map((option) => [option.value, option]),
) as Record<CareerSortMode, CareerSortSpec>;

export const SCHOOL_LIST_SORT_OPTIONS: { value: SchoolListSortMode; label: string }[] = [
  { value: "violence", label: "학폭 지표" },
  ...CAREER_SORT_OPTIONS.map(({ value, label }) => ({ value, label })),
];

export function careerForSort(school: School, statsYear: string) {
  if (statsYear !== "all") return school.careerSummary?.[statsYear] ?? null;
  return school.careerLatest ?? null;
}

export function careerSortValue(school: School, mode: CareerSortMode, statsYear: string): number | null {
  const career = careerForSort(school, statsYear);
  if (!career) return null;
  const spec = CAREER_SORT_BY_MODE[mode];
  if (spec.row === "rates") return career.rates[spec.key as keyof typeof career.rates] ?? null;
  return career.total[spec.key] ?? null;
}

export function careerListValue(school: School, mode: SchoolListSortMode, statsYear: string): string {
  if (mode === "violence") return "";
  const spec = CAREER_SORT_BY_MODE[mode];
  const value = careerSortValue(school, mode, statsYear);
  if (value == null) return "—";
  return spec.format === "percent" ? `${value.toFixed(1)}%` : `${value.toLocaleString()}명`;
}

export function compareCareerSort(a: School, b: School, mode: CareerSortMode, statsYear: string): number {
  const spec = CAREER_SORT_BY_MODE[mode];
  const av = careerSortValue(a, mode, statsYear);
  const bv = careerSortValue(b, mode, statsYear);
  if (av == null && bv == null) return a.name.localeCompare(b.name);
  if (av == null) return 1;
  if (bv == null) return -1;
  if (spec.asc) return av - bv || a.name.localeCompare(b.name);
  return bv - av || a.name.localeCompare(b.name);
}
