/**
 * 신규 apiType (55 장학금, 63 성별 학생수)만 추가 수집.
 * 기존 school_info에 머지.
 */
import { join } from "node:path";
import { DATA_DIR, sleep } from "./_env.ts";
import { REGIONS, SCHOOL_KIND, type SchoolKindCode } from "./regions.ts";
import { loadSchoolInfo, saveSchoolInfo } from "./_school_info_io.ts";

const KEY = process.env.SCHOOLINFO_API_KEY!;
const ENDPOINT = "https://www.schoolinfo.go.kr/openApi.do";
const NEW_API_TYPES = ["16", "20", "21"] as const;
const YEAR = "2025";

const schools: Record<string, any> = await Bun.file(join(DATA_DIR, "schools.json")).json();
const data: Record<string, any> = await loadSchoolInfo();

async function fetchOne(sido: string, sgg: string, knd: SchoolKindCode, apiType: string, year: string) {
  const url = ENDPOINT + "?" + new URLSearchParams({
    apiKey: KEY, apiType, sidoCode: sido, sggCode: sgg, schulKndCode: knd, pbanYr: year,
  });
  try {
    const r = await fetch(url);
    if (!r.ok) return [] as any[];
    const j: any = await r.json();
    if (j.resultCode !== "success") return [] as any[];
    return (j.list ?? []) as any[];
  } catch { return [] as any[]; }
}

let calls = 0, added = 0;
for (const region of REGIONS) {
  for (const knd of ["02","03","04"] as SchoolKindCode[]) {
    for (const apiType of NEW_API_TYPES) {
      const list = await fetchOne(region.sido, region.sgg, knd, apiType, YEAR);
      calls++;
      for (const row of list) {
        const code = row.SCHUL_CODE;
        if (!code || !schools[code]) continue;
        if (!data[code]) data[code] = { _meta: { name: schools[code].name, kind: schools[code].kind, sgg: schools[code].sgg, year: YEAR } };
        if (!data[code][apiType]) {
          data[code][apiType] = row;
          added++;
        }
      }
      await sleep(60);
    }
  }
  if (calls % 60 === 0) {
    await saveSchoolInfo(data, schools);
    process.stdout.write(`  ${calls}호출 +${added}\n`);
  }
}
await saveSchoolInfo(data, schools);
console.log(`완료: ${calls}호출, +${added} row`);
