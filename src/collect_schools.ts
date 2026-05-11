/**
 * 학교 마스터 목록 수집.
 * 학교알리미 OpenAPI apiType=0 (학교기본정보) → 시군구 × 학교종류(초/중/고) 호출.
 *
 * 출력: data/schools.json
 *   { [SCHUL_CODE]: {
 *       code, name, kind ("초등"|"중학"|"고등"), city, district,
 *       sgg, addr, lat, lng, foundYmd, tel, websiteUrl?, fondScCode (설립유형),
 *       atptOfcdcOrgNm (교육청), closeYn ("Y"|"N")
 *     } }
 *
 * Usage: bun src/collect_schools.ts
 */
import { join } from "node:path";
import { DATA_DIR, sleep } from "./_env.ts";
import { REGIONS, SCHOOL_KIND, type SchoolKindCode } from "./regions.ts";

const KEY = process.env.SCHOOLINFO_API_KEY!;
if (!KEY) throw new Error("SCHOOLINFO_API_KEY missing");

const ENDPOINT = "https://www.schoolinfo.go.kr/openApi.do";

interface BasicRow {
  SCHUL_CODE: string;
  SCHUL_NM: string;
  SCHUL_KND_SC_CODE: string;   // "02"/"03"/"04"
  SCHUL_RNDA?: string;          // 도로명 주소
  DTLAD_BRKDN?: string;         // 상세주소(지번)
  ADRCD_CD?: string;            // 행정구역 코드
  LTTUD?: string;               // 위도
  LGTUD?: string;               // 경도
  FOND_YMD?: string;            // 설립일 YYYYMMDD
  USER_TELNO?: string;          // 대표전화
  CLOSE_YN?: string;            // 폐교 Y/N
  ATPT_OFCDC_ORG_NM?: string;   // 교육청
  FOND_SC_CODE?: string;        // 설립구분 코드
  SCHUL_FOND_TYP_CODE?: string; // 설립유형
  HMPG_ADRES?: string;          // 홈페이지
  ZIP_CODE?: string;
}

interface SchoolEntry {
  code: string;
  name: string;
  kind: "초등" | "중학" | "고등";
  city: string;
  district: string;
  sgg: string;
  addr: string;
  lat: number | null;
  lng: number | null;
  foundYmd: string | null;
  tel: string | null;
  closeYn: "Y" | "N";
  atptOrg: string | null;
  fondType: string | null;
  homepage: string | null;
}

const KIND_LABEL: Record<string, "초등" | "중학" | "고등"> = {
  "02": "초등",
  "03": "중학",
  "04": "고등",
};

async function fetchSchools(sido: string, sgg: string, schulKnd: SchoolKindCode): Promise<BasicRow[]> {
  const url =
    ENDPOINT +
    "?" +
    new URLSearchParams({
      apiKey: KEY,
      apiType: "0",
      sidoCode: sido,
      sggCode: sgg,
      schulKndCode: schulKnd,
    });
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ${sgg}/${schulKnd} HTTP ${res.status}`);
    return [];
  }
  const j = (await res.json()) as { resultCode: string; resultMsg?: string; list?: BasicRow[] };
  if (j.resultCode !== "success") {
    console.warn(`  ${sgg}/${schulKnd} fail: ${j.resultMsg}`);
    return [];
  }
  return j.list ?? [];
}

function toEntry(r: BasicRow, region: { city: string; district: string; sgg: string }): SchoolEntry {
  const lat = r.LTTUD ? parseFloat(r.LTTUD) : NaN;
  const lng = r.LGTUD ? parseFloat(r.LGTUD) : NaN;
  return {
    code: r.SCHUL_CODE,
    name: r.SCHUL_NM,
    kind: KIND_LABEL[r.SCHUL_KND_SC_CODE] ?? "초등",
    city: region.city,
    district: region.district,
    sgg: region.sgg,
    addr: [r.SCHUL_RNDA, r.DTLAD_BRKDN].filter(Boolean).join(" ").trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    foundYmd: r.FOND_YMD || null,
    tel: r.USER_TELNO || null,
    closeYn: (r.CLOSE_YN === "Y" ? "Y" : "N") as "Y" | "N",
    atptOrg: r.ATPT_OFCDC_ORG_NM || null,
    fondType: r.SCHUL_FOND_TYP_CODE || null,
    homepage: r.HMPG_ADRES || null,
  };
}

async function main() {
  const out: Record<string, SchoolEntry> = {};
  const stats: Record<string, { 초등: number; 중학: number; 고등: number }> = {};

  for (const region of REGIONS) {
    const s = (stats[region.label] = { 초등: 0, 중학: 0, 고등: 0 });
    for (const knd of ["02", "03", "04"] as SchoolKindCode[]) {
      const rows = await fetchSchools(region.sido, region.sgg, knd);
      for (const r of rows) {
        if (!r.SCHUL_CODE) continue;
        // 일반구가 신설된 시(고양/수원/성남/안산/안양/용인/화성)는 통합 sgg + 일반구 sgg 둘 다 호출.
        // 같은 학교가 여러 row에 등장 가능 → SCHUL_CODE dedup.
        // district 정보가 있는 row를 우선 유지 ("(통합)" 또는 "")
        const existing = out[r.SCHUL_CODE];
        if (existing && existing.district && existing.district !== "(통합)") continue;
        out[r.SCHUL_CODE] = toEntry(r, region);
        const kindKey = KIND_LABEL[knd];
        if (kindKey === "초등") s.초등++;
        else if (kindKey === "중학") s.중학++;
        else s.고등++;
      }
      console.log(`  ${region.label} ${SCHOOL_KIND[knd]}: ${rows.length}개`);
      await sleep(150);
    }
  }

  await Bun.write(join(DATA_DIR, "schools.json"), JSON.stringify(out, null, 2));

  // 폐교 제외 통계
  const active = Object.values(out).filter((s) => s.closeYn === "N");
  const elem = active.filter((s) => s.kind === "초등").length;
  const mid = active.filter((s) => s.kind === "중학").length;
  const high = active.filter((s) => s.kind === "고등").length;
  const closed = Object.values(out).filter((s) => s.closeYn === "Y").length;
  const noCoord = active.filter((s) => s.lat == null || s.lng == null).length;

  console.log(`\n저장: data/schools.json`);
  console.log(`전체 ${Object.keys(out).length}개 (폐교 ${closed}개)`);
  console.log(`현재 운영: 초등 ${elem} · 중학 ${mid} · 고등 ${high} = ${active.length}`);
  console.log(`좌표 누락: ${noCoord}개`);
}

await main();
