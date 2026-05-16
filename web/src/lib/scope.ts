import type { School } from "@/types";

export type AppScope = "전국" | "수도권";

export const APP_SCOPE_OPTIONS: AppScope[] = ["전국", "수도권"];
export const CAPITAL_AREA_SIDOS = new Set(["서울특별시", "인천광역시", "경기도"]);
const CAPITAL_AREA_SIDO_ALIASES = new Set([
  "서울",
  "서울특별시",
  "인천",
  "인천광역시",
  "경기",
  "경기도",
]);
const CAPITAL_AREA_SGG_PREFIXES = ["11", "28", "41"]; // 서울, 인천, 경기

export function isCapitalAreaSchool(school: School): boolean {
  return isCapitalAreaSido(school.sido) || isCapitalAreaSido(school.city) || isCapitalAreaSgg(school.sgg);
}

export function filterSchoolsByScope(schools: School[], scope: AppScope): School[] {
  if (scope === "전국") return schools;
  return schools.filter(isCapitalAreaSchool);
}

export function scopeToUrlValue(scope: AppScope): string | null {
  return scope === "수도권" ? "metro" : null;
}

export function scopeFromUrlValue(value: string | null): AppScope {
  return value === "metro" || value === "capital" || value === "수도권" ? "수도권" : "전국";
}

function isCapitalAreaSido(value?: string | null): boolean {
  return CAPITAL_AREA_SIDO_ALIASES.has(value ?? "");
}

function isCapitalAreaSgg(value?: string | null): boolean {
  return CAPITAL_AREA_SGG_PREFIXES.some((prefix) => value?.startsWith(prefix));
}

export function filterGeoJsonByScope<T extends { features?: any[] } | null>(geo: T, scope: AppScope): T {
  if (!geo || scope === "전국") return geo;
  return {
    ...geo,
    features: geo.features?.filter((feature) => {
      const p = feature?.properties ?? {};
      return isCapitalAreaSido(p.sido) || isCapitalAreaSido(p.city) || isCapitalAreaSgg(p.sgg);
    }) ?? [],
  };
}
