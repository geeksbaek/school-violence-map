/**
 * web/public/data.json 빌드.
 * schools.json + school_info.json + violence.json → 프론트용 단일 파일.
 *
 * 출력 스키마:
 *   { generatedAt: ISO, years: ["2023","2024","2025","2026"], schools: SchoolView[] }
 *   SchoolView = {
 *     code, name, kind, city, district, sgg, addr, lat, lng,
 *     studentTotal, classTotal,
 *     genderRatio: { boy, girl } | null,
 *     teachers,
 *     violence: { [year]: { total, types, cases } | null }
 *     violenceTotal: number       // 4년 합계
 *     violenceRatePer100: number  // (4년합계 / 학생수) * 100
 *   }
 */
import { join } from "node:path";
import { existsSync } from "node:fs";

const ROOT = join(import.meta.dir, "..");
const DATA_DIR = join(ROOT, "data");
const OUT_PATH = join(ROOT, "web/public/data.json");

const schools: Record<string, any> = await Bun.file(join(DATA_DIR, "schools.json")).json();
const info: Record<string, any> = existsSync(join(DATA_DIR, "school_info.json"))
  ? await Bun.file(join(DATA_DIR, "school_info.json")).json()
  : {};
const violence: Record<string, Record<string, any>> = existsSync(join(DATA_DIR, "violence.json"))
  ? await Bun.file(join(DATA_DIR, "violence.json")).json()
  : {};

const YEARS = ["2023", "2024", "2025", "2026"] as const;
const TYPE_LABELS = ["신체폭력", "언어폭력", "금품갈취", "강요", "따돌림", "성폭력", "사이버폭력", "기타"];

interface SchoolView {
  code: string;
  name: string;
  kind: "초등" | "중학" | "고등";
  city: string;
  district: string;
  sgg: string;
  addr: string;
  lat: number;
  lng: number;
  studentTotal: number | null;
  classTotal: number | null;
  teachers: number | null;
  genderRatio: { boy: number; girl: number } | null;
  violence: Record<string, {
    total: number;
    cases: any;
    types: number[];   // 8 항목 합산 (s1+s2)
    sped?: number;
  } | null>;
  violenceTotal: number;
  violenceYears: number; // 데이터 있는 년도 수
  violenceRatePer100: number | null; // 학생수 대비
}

function num(v: any): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

const out: SchoolView[] = [];
for (const code of Object.keys(schools)) {
  const s = schools[code];
  if (s.closeYn === "Y") continue;
  if (s.lat == null || s.lng == null) continue;

  const i = info[code] ?? {};
  const grade = i["09"];           // 학년별·학급별 학생수
  const gender = i["10"];          // 성별 학생수 (추정)
  const wkly = i["08"];            // 수업/교사

  let studentTotal: number | null = null;
  let classTotal: number | null = null;
  if (grade) {
    studentTotal = num(grade.COL_S_SUM);
    classTotal = num(grade.COL_C_SUM);
  }

  let teachers: number | null = null;
  if (wkly) teachers = num(wkly.ITRT_TCR_TOT_FGR);
  if (teachers == null && grade) teachers = num(grade.TEACH_CNT);

  // 성비: gender row의 키 패턴 분석 — COL_211/212 = (학년 1, 남/여) 형태로 추정
  let genderRatio: { boy: number; girl: number } | null = null;
  if (gender) {
    let boy = 0, girl = 0;
    for (const k of Object.keys(gender)) {
      if (!/^COL_\d+$/.test(k)) continue;
      const n = num(gender[k]);
      if (n == null) continue;
      // 끝자리 1=남, 2=여 (다수 시도/관찰 결과). 추측이므로 비어있으면 null로 둠.
      const last = k.slice(-1);
      if (last === "1") boy += n;
      else if (last === "2") girl += n;
    }
    if (boy + girl > 0) genderRatio = { boy, girl };
  }

  // 학폭
  const v: SchoolView["violence"] = {};
  let violenceTotal = 0;
  let yearsWithData = 0;
  for (const y of YEARS) {
    const r = violence[code]?.[y];
    if (!r || r.error || r.parseError || r.skipped) {
      v[y] = null;
      continue;
    }
    if (r.zero || r.noData || r.newSchool) {
      v[y] = { total: 0, cases: null, types: Array(8).fill(0) };
      yearsWithData++;
      continue;
    }
    if (!r.cases) { v[y] = null; continue; }
    const total = (r.cases.s1?.n ?? 0) + (r.cases.s2?.n ?? 0);
    const t1 = r.types?.s1 ?? Array(8).fill(0);
    const t2 = r.types?.s2 ?? Array(8).fill(0);
    const types = t1.map((x: number, idx: number) => x + (t2[idx] ?? 0));
    const sped = ((r.sped?.s1?.[1] ?? 0) + (r.sped?.s2?.[1] ?? 0));
    v[y] = { total, cases: r.cases, types, sped };
    violenceTotal += total;
    yearsWithData++;
  }

  const violenceRatePer100 =
    studentTotal && studentTotal > 0 && yearsWithData > 0
      ? Math.round((violenceTotal / yearsWithData / studentTotal) * 100 * 1000) / 1000
      : null;

  out.push({
    code,
    name: s.name,
    kind: s.kind,
    city: s.city,
    district: s.district,
    sgg: s.sgg,
    addr: s.addr,
    lat: s.lat,
    lng: s.lng,
    studentTotal,
    classTotal,
    teachers,
    genderRatio,
    violence: v,
    violenceTotal,
    violenceYears: yearsWithData,
    violenceRatePer100,
  });
}

const output = {
  generatedAt: new Date().toISOString(),
  years: YEARS,
  typeLabels: TYPE_LABELS,
  schools: out,
};

await Bun.write(OUT_PATH, JSON.stringify(output));

const withCoords = out.length;
const withViolence = out.filter((s) => s.violenceYears > 0).length;
const withInfo = out.filter((s) => s.studentTotal).length;
const sumViolence = out.reduce((a, b) => a + b.violenceTotal, 0);
console.log(`web/public/data.json 작성: ${withCoords} 학교`);
console.log(`  학생수 ${withInfo}, 학폭 데이터 ${withViolence} (총 ${sumViolence}건)`);
console.log(`  파일 크기: ${(Bun.file(OUT_PATH).size / 1024).toFixed(1)}KB`);
