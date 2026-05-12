/**
 * 학교 상세 공시정보 수집 (학교알리미 OpenAPI).
 *
 * 시군구 × 학교종류 × apiType 호출로 raw row를 수집해 SCHUL_CODE 별로 저장.
 * 한 호출에 시군구 전체 학교가 한꺼번에 오므로 매우 효율적이다.
 *
 * 수집 대상 apiType (탐지 결과):
 *   00 학교기본정보 (좌표, 주소, 설립일 등 — schools.json과 중복이지만 공시년도별 갱신 위해 포함)
 *   08 수업일수 / 교과교사 총수
 *   09 학년별·학급별 학생수
 *   10 성별 학년별 학생수
 *   16 학급 수 / 시설 정보
 *   17 화장실/CCTV 등 시설
 *   18 보건/상담실 등
 *   20 입학·전출입 현황
 *   21 졸업·진학
 *   22 학업중단/유급
 *   30 자유학기제 운영
 *   34 급식 (조리원, 급식학생수)
 *   38 정보화 활용
 *   43 학교폭력 예방교육 (시간/실적)
 *   51 입학생 (조기/만기/유예 등)
 *   56 동아리/창의적체험활동
 *   59 방과후학교
 *
 * 출력: data/school_info.json
 *   { [SCHUL_CODE]: { [apiType]: row, _meta: { name, kind, sgg, year } } }
 *
 * 매 (sgg, knd, apiType) 호출 후 즉시 저장 → 중간 크래시에도 데이터 유실 방지.
 *
 * Usage: bun src/collect_info.ts [--year 2025]
 */
import { join } from "node:path";
import { DATA_DIR, sleep } from "./_env.ts";
import { REGIONS, SCHOOL_KIND, type SchoolKindCode } from "./regions.ts";
import { loadSchoolInfo, saveSchoolInfo } from "./_school_info_io.ts";

const KEY = process.env.SCHOOLINFO_API_KEY!;
const ENDPOINT = "https://www.schoolinfo.go.kr/openApi.do";

// apiType 의미 (학교알리미 OpenAPI_Output.xlsx 명세 기준):
//   00=학교기본정보 · 08=수업일수 · 09=학년별·학급별 학생수 · 10=전·출입/학업중단
//   16=학교용지 · 17=교사(校舍) 현황 · 18=학생활동 지원시설 · 20=시설 개방 · 21=장애인 편의
//   34=급식 · 38=보건관리 · 43=안전교육 · 55=장학금 수혜 · 56=동아리 · 59=방과후
//   62=학교현황 · 63=성별 학생수
const API_TYPES = [
  "00", "08", "09", "10", "16", "17", "18", "20", "21",
  "34", "38", "43", "55", "56", "59", "62", "63",
] as const;

const args = process.argv.slice(2);
const YEAR = args.includes("--year") ? args[args.indexOf("--year") + 1] : "2025";

interface SchoolEntry {
  code: string;
  name: string;
  kind: "초등" | "중학" | "고등";
  sgg: string;
}

interface InfoBlob {
  _meta: { name: string; kind: string; sgg: string; year: string };
  [apiType: string]: any;
}

const KIND_TO_CODE: Record<string, SchoolKindCode> = {
  초등: "02",
  중학: "03",
  고등: "04",
};

async function fetchOne(sido: string, sgg: string, schulKnd: SchoolKindCode, apiType: string, year: string) {
  const url =
    ENDPOINT +
    "?" +
    new URLSearchParams({
      apiKey: KEY,
      apiType,
      sidoCode: sido,
      sggCode: sgg,
      schulKndCode: schulKnd,
      pbanYr: year,
    });
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false as const, msg: `HTTP ${res.status}`, list: [] as any[] };
    const j = (await res.json()) as { resultCode: string; resultMsg?: string; list?: any[] };
    if (j.resultCode !== "success") return { ok: false as const, msg: j.resultMsg ?? j.resultCode, list: [] as any[] };
    return { ok: true as const, msg: "", list: j.list ?? [] };
  } catch (e: any) {
    return { ok: false as const, msg: e.message, list: [] as any[] };
  }
}

async function main() {
  const schools: Record<string, SchoolEntry> = await Bun.file(join(DATA_DIR, "schools.json")).json();
  const schoolList = Object.values(schools);
  console.log(`전체 학교: ${schoolList.length}개 (수집 대상 = 폐교 제외 ${schoolList.filter((s: any) => s.closeYn === "N").length})`);
  console.log(`공시년도: ${YEAR}, apiType: ${API_TYPES.length}개\n`);

  const data: Record<string, InfoBlob> = await loadSchoolInfo();

  // 시군구 → 해당 시군구 SCHUL_CODE 집합 (응답 row를 어느 학교에 매칭할지)
  const sggSchools: Record<string, Set<string>> = {};
  for (const s of schoolList) {
    if (!sggSchools[s.sgg]) sggSchools[s.sgg] = new Set();
    sggSchools[s.sgg].add(s.code);
  }

  let calls = 0;
  let totalRows = 0;
  let failed = 0;

  for (const region of REGIONS) {
    for (const knd of ["02", "03", "04"] as SchoolKindCode[]) {
      const kindLabel = SCHOOL_KIND[knd].slice(0, 2); // 초등/중학/고등 의 앞 2글자
      for (const apiType of API_TYPES) {
        const r = await fetchOne(region.sido, region.sgg, knd, apiType, YEAR);
        calls++;
        if (!r.ok) {
          // "공시되지 않은 항목" 등은 학교 종류별로 자연스럽게 발생 → 조용히 스킵
          if (!r.msg.includes("공시되지 않은")) {
            console.log(`  ✗ ${region.label} ${SCHOOL_KIND[knd]} api=${apiType}: ${r.msg}`);
            failed++;
          }
          await sleep(80);
          continue;
        }

        let added = 0;
        for (const row of r.list) {
          const code: string | undefined = row.SCHUL_CODE;
          if (!code) continue;
          const sch = schools[code];
          if (!sch) continue; // schools.json에 없는 학교는 스킵 (다른 시군구)
          if (!data[code]) {
            data[code] = {
              _meta: { name: sch.name, kind: sch.kind, sgg: sch.sgg, year: YEAR },
            };
          }
          data[code][apiType] = row;
          added++;
          totalRows++;
        }

        await sleep(80);

        if (added > 0) {
          process.stdout.write(`.`);
        }
      }
      console.log(` ${region.label} ${SCHOOL_KIND[knd]} 완료`);
      // 시·도 단위 진행 후 저장 (sido 단위 분할 파일 18개 일괄 갱신)
      await saveSchoolInfo(data, schools);
    }
  }
  await saveSchoolInfo(data, schools);

  const matched = Object.keys(data).length;
  console.log(`\n=== 완료 ===`);
  console.log(`호출: ${calls}회 (실패 ${failed})`);
  console.log(`행 누적: ${totalRows}`);
  console.log(`매칭 학교: ${matched}/${schoolList.length}`);
}

await main();
