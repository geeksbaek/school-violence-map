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

import { loadSchoolInfo } from "./_school_info_io.ts";
const schools: Record<string, any> = await Bun.file(join(DATA_DIR, "schools.json")).json();
const info: Record<string, any> = await loadSchoolInfo();
const violence: Record<string, Record<string, any>> = existsSync(join(DATA_DIR, "violence.json"))
  ? await Bun.file(join(DATA_DIR, "violence.json")).json()
  : {};
const schoolIds: Record<string, { uuid: string; nameInSearch: string }> = existsSync(join(DATA_DIR, "school_ids.json"))
  ? await Bun.file(join(DATA_DIR, "school_ids.json")).json()
  : {};
const selfResolved: Record<string, Record<string, any>> = existsSync(join(DATA_DIR, "self_resolved.json"))
  ? await Bun.file(join(DATA_DIR, "self_resolved.json")).json()
  : {};
const preventionEdu: Record<string, Record<string, any>> = existsSync(join(DATA_DIR, "prevention_edu.json"))
  ? await Bun.file(join(DATA_DIR, "prevention_edu.json")).json()
  : {};
const studentTrend: Record<string, Record<string, number>> = existsSync(join(DATA_DIR, "student_trend.json"))
  ? await Bun.file(join(DATA_DIR, "student_trend.json")).json()
  : {};

// 동 polygon 로드 + bbox 사전 계산 (학교 좌표 → 동 매핑용)
const dongPath = join(ROOT, "web/public/dong.geojson");
let dongIndex: Array<{ code: string; name: string; bbox: [number, number, number, number]; rings: number[][][] }> = [];
if (existsSync(dongPath)) {
  const dongGeo = await Bun.file(dongPath).json();
  for (const f of dongGeo.features) {
    const polys: number[][][][] = f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates;
    for (const poly of polys) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const [lng, lat] of poly[0]) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
      dongIndex.push({
        code: f.properties.code,
        name: f.properties.name,
        bbox: [minLng, minLat, maxLng, maxLat],
        rings: poly,  // [outer, hole1, hole2...]
      });
    }
  }
  console.log(`동 polygon 로드: ${dongIndex.length}개`);
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function findDong(lng: number, lat: number): { code: string; name: string } | null {
  for (const d of dongIndex) {
    if (lng < d.bbox[0] || lng > d.bbox[2] || lat < d.bbox[1] || lat > d.bbox[3]) continue;
    // 외곽 ring 안 + 모든 hole 밖이면 매칭
    if (!pointInRing(lng, lat, d.rings[0])) continue;
    let inHole = false;
    for (let h = 1; h < d.rings.length; h++) {
      if (pointInRing(lng, lat, d.rings[h])) { inHole = true; break; }
    }
    if (!inHole) return { code: d.code, name: d.name };
  }
  return null;
}

const YEARS = ["2023", "2024", "2025", "2026"] as const;
const TYPE_LABELS = ["신체폭력", "언어폭력", "금품갈취", "강요", "따돌림", "성폭력", "사이버폭력", "기타"];

interface SchoolView {
  code: string;
  name: string;
  kind: "초등" | "중학" | "고등";
  gender: "여" | "남" | "공학";
  city: string;
  district: string;
  sido: string;        // 광역 시·도 (atptOrg에서 추출). 17개 표준 단위.
  dong: string;        // 행정동 (없으면 빈 문자열)
  dongCode: string;
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
  // cd 75 자체해결: 학기 합계 (s1+s2). 학교가 심의위 회부 없이 자체해결한 건수.
  selfResolved: Record<string, { s1: number; s2: number; total: number } | null>;
  selfResolvedTotal: number;
  // cd 66 예방교육: 의미 추출된 요약. studentEdu의 "교원" 행은 [횟수, 참여인원, 참여율%], "학부모" 행은 [횟수, ...].
  // staffEdu/prevProgram의 4컬럼은 학교마다 의미가 달라(학년 또는 분기 추정) raw 표시 대신 합계만.
  preventionEdu: Record<string, {
    teacherSessions?: number;       // 교원 대상 정규수업 학기당 횟수 합계
    teacherParticipants?: number;   // 교원 참여 인원 합계
    teacherRate?: number;           // 교원 평균 참여율 (%)
    parentSessions?: number;        // 학부모 대상 횟수 합계
    staffStudents?: number | null;  // 교원·학부모 연수 참여학생 누적
    staffTeachers?: number | null;  // 교원·학부모 연수 지도교사 누적
    progStudents?: number | null;   // 예방프로그램 참여학생 누적
    progTeachers?: number | null;   // 예방프로그램 지도교사 누적
  } | null>;
  schoolinfoUuid?: string;          // 학교알리미 직접 링크용
  foundation?: string;              // 공립/사립/국립 (school_info FOND_SC_CODE)
  details: SchoolDetails;
}

// 학교알리미 공시 정보 — 카테고리별 정리
interface SchoolDetails {
  // apiType 09: 학년별 학급/학생
  grades?: { label: string; classes: number | null; students: number | null; perClass: number | null }[];
  // apiType 10: 전년도 학생수 추이
  studentTrend?: { year: number; total: number }[];
  // apiType 08: 수업/교사
  teaching?: { teachers: number | null; weeklyHours: number | null; daysPerWeek: number | null };
  // apiType 17/18: 시설
  facility?: {
    regularClassrooms?: number | null;     // COM_CCCLA_FGR
    specialClassrooms?: number | null;     // CURR_CCCLA_FGR
    sportsClassrooms?: number | null;      // LRN_SPORT_ETC_CCCLA_FGR
    maleToilets?: number | null;
    femaleToilets?: number | null;
    showers?: number | null;
    auditorium?: number | null;            // COSE_CNSRM_FGR (체육관/강당)
    pool?: string | null;                  // SWMPL_ENNC (Y/N)
    boardingCapacity?: number | null;      // BRHS_RCPTN_NMPR_FGR
  };
  // apiType 34: 급식
  meal?: {
    students?: number | null;
    nutritionists?: number | null;
    cooks?: number | null;
    cookAssistants?: number | null;
    operationMethod?: string | null;       // OPER_MET_CODE (직영/위탁)
  };
  // apiType 38: 보건관리 (변수명이 IFRMA로 시작하지만 실제는 보건실 이용)
  health?: {
    annualVisits?: number | null;          // 연간 보건실 이용건수
    perStudentVisits?: number | null;      // 연간 1인당 보건실 이용건수
  };
  // apiType 43: 안전교육 7개 영역
  safetyEducation?: {
    [category: string]: { total: number | null; sem1: number | null; sem2: number | null };
  };
  // apiType 56: 창체/동아리
  activities?: {
    creativeStudents?: number | null;
    creativeTeachers?: number | null;
    creativeExternalLecturers?: number | null;
    creativeBudget?: number | null;
    clubs?: number | null;                  // STDNT_SLCTL_CCCLU_FGR
    clubBudget?: number | null;             // CCCLU_ACT_BDG_SPORT_AMT
  };
  // apiType 59: 방과후/돌봄
  afterSchool?: {
    programs?: number | null;
    students?: number | null;               // SUM_ASL_REG_STDNT_FGR
    burdenAmount?: number | null;           // ASL_BNFR_BRDN_AMT
    careRooms?: number | null;              // ECC_PM_OPER_CCCLA_FGR
    careStudents?: number | null;
  };
  // apiType 55: 장학금 수혜 현황
  scholarship?: {
    schoCount?: number | null;       // 장학금 인원
    schoAmount?: number | null;      // 장학금 금액
    aidCount?: number | null;        // 학비지원 인원
    aidAmount?: number | null;       // 학비지원 금액
    totalCount?: number | null;
    totalAmount?: number | null;
  };
}

function safetyCatLabel(prefix: string): string {
  return ({
    TRFC_SAFE: "교통안전",
    LVLH_SAFE: "생활안전",
    DISA_SAFE: "재난안전",
    DRU_CYBER_PRVT: "약물·사이버중독",
    CYBER_PRVT: "사이버폭력",
    OCCP_SAFE: "직업안전",
    VIO_PRVT_BDY_PRTC: "폭력·신체보호",
    EMGN_MDLRT: "응급처치",
  } as Record<string, string>)[prefix] ?? prefix;
}

function extractDetails(i: any, kind: "초등" | "중학" | "고등", code: string): SchoolDetails {
  const d: SchoolDetails = {};
  const grade = i["09"];      // 학년별·학급별 학생수
  const wkly = i["08"];       // 수업일수 및 수업시수 현황
  const fac = i["17"];        // 교사(校舍) 현황
  const ground = i["18"];     // 학생교육활동 지원시설
  const meal = i["34"];       // 급식
  const health = i["38"];     // 보건관리
  const safety = i["43"];     // 안전교육 계획 및 실시현황
  const act = i["56"];        // 동아리 활동
  const after = i["59"];      // 방과후학교
  const scholarship = i["55"]; // 장학금 수혜 현황 (구버전 30 = 학교발전기금이라 잘못)

  // 학년별
  if (grade) {
    const maxGrade = kind === "초등" ? 6 : 3;
    const arr: NonNullable<SchoolDetails["grades"]> = [];
    for (let g = 1; g <= maxGrade; g++) {
      const c = num(grade[`COL_${g}`]);
      const s = num(grade[`COL_S${g}`]);
      const pc = num(grade[`COL_C${g}`]);
      if (c != null || s != null) {
        arr.push({ label: `${g}학년`, classes: c, students: s, perClass: pc });
      }
    }
    if (arr.length > 0) d.grades = arr;
  }

  // 학생수 다년치 추이 — student_trend.json (collect_student_trend로 별도 수집)
  const tr = studentTrend[code];
  if (tr && Object.keys(tr).length >= 2) {
    const arr = Object.entries(tr)
      .map(([y, t]) => ({ year: parseInt(y), total: t }))
      .filter((x) => Number.isFinite(x.year) && Number.isFinite(x.total))
      .sort((a, b) => a.year - b.year);
    if (arr.length >= 2) d.studentTrend = arr;
  }

  // 수업/교사
  if (wkly) {
    d.teaching = {
      teachers: num(wkly.ITRT_TCR_TOT_FGR),
      weeklyHours: num(wkly.WEEK_TOT_ITRT_HR_FGR),
      daysPerWeek: num(wkly.PER_STUDAY_DAY),
    };
  }

  // 시설 (apiType 17=교사, 18=지원시설)
  // 17: COL_1=일반교실, COL_5=특별교실, CURR_CCCLA_FGR=교과교실, ML/FML_TOI=화장실, STDNT_SWRM=샤워실
  // 18: COL_1=체육관, COL_2=강당, SWMPL_FGR=수영장, BRHS_RCPTN=기숙사 재실, COSE_CNSRM=진로상담실
  const facObj: NonNullable<SchoolDetails["facility"]> = {};
  if (fac) {
    facObj.regularClassrooms = num(fac.COL_1);
    facObj.specialClassrooms = num(fac.COL_5);
    facObj.subjectClassrooms = num(fac.CURR_CCCLA_FGR);
    facObj.maleToilets = num(fac.ML_TOI_FGR);
    facObj.femaleToilets = num(fac.FML_TOI_FGR);
    facObj.showers = num(fac.STDNT_SWRM_FGR);
  }
  if (ground) {
    facObj.gym = num(ground.COL_1);
    facObj.auditorium = num(ground.COL_2);
    const pool = num(ground.SWMPL_FGR);
    facObj.pool = pool != null && pool > 0 ? "있음" : pool === 0 ? "없음" : null;
    facObj.boardingCapacity = num(ground.BRHS_RCPTN_NMPR_FGR);
    facObj.careerRoom = num(ground.COSE_CNSRM_FGR);
  }
  if (Object.values(facObj).some((v) => v != null)) d.facility = facObj;

  // 급식
  if (meal) {
    d.meal = {
      students: num(meal.MLSV_STDNT_FGR),
      nutritionists: num(meal.NTRST_FGR),
      cooks: num(meal.COOK_FGR),
      cookAssistants: num(meal.COOAS_FGR),
      operationMethod: meal.OPER_MET_CODE === "1" ? "직영" : meal.OPER_MET_CODE === "2" ? "위탁" : null,
    };
  }

  // 보건관리 (apiType 38) — 변수명이 IFRMA(정보)로 시작하지만 실제는 보건실 이용
  if (health) {
    d.health = {
      annualVisits: num(health.ALL_IFRMA_UTILZ_STDNT_FGR),
      perStudentVisits: num(health.WIK_AVRG_IFRMA_UTILZ_STDNT_FGR),
    };
  }

  // 안전교육 7개 영역
  if (safety) {
    const cats: NonNullable<SchoolDetails["safetyEducation"]> = {};
    const prefixes = ["TRFC_SAFE", "LVLH_SAFE", "DISA_SAFE", "DRU_CYBER_PRVT", "CYBER_PRVT", "OCCP_SAFE", "VIO_PRVT_BDY_PRTC", "EMGN_MDLRT"];
    for (const p of prefixes) {
      const total = num(safety[`${p}_EDC_TOTAL`]);
      const s1 = num(safety[`${p}_EDC_HR_FGR1`]);
      const s2 = num(safety[`${p}_EDC_HR_FGR2`]);
      if (total != null || s1 != null || s2 != null) {
        cats[safetyCatLabel(p)] = { total, sem1: s1, sem2: s2 };
      }
    }
    if (Object.keys(cats).length > 0) d.safetyEducation = cats;
  }

  // 창체/동아리
  if (act) {
    d.activities = {
      creativeStudents: num(act.CREAT_EXPER_ACT_STDNT_FGR),
      creativeTeachers: num(act.CREAT_EXPER_ACT_CCH_TCR_FGR),
      creativeExternalLecturers: num(act.CREAT_EXPER_ACT_EXTRLLECTR_FGR),
      creativeBudget: num(act.CREAT_EXPER_ACT_BDG_SPORT_AMT),
      clubs: num(act.STDNT_SLCTL_CCCLU_FGR),
      clubBudget: num(act.CCCLU_ACT_BDG_SPORT_AMT),
    };
  }

  // 방과후/돌봄
  if (after) {
    d.afterSchool = {
      programs: num(after.SUM_ASL_PGM_FGR),
      students: num(after.SUM_ASL_REG_STDNT_FGR),
      burdenAmount: num(after.ASL_BNFR_BRDN_AMT),
      careRooms: num(after.ECC_PM_OPER_CCCLA_FGR),
      careStudents: num(after.ECC_PM_PTPT_STDNT_FGR),
    };
  }

  // 장학금 수혜 (apiType 55) — 모든 학교급
  if (scholarship) {
    const schoCount = num(scholarship.SCHO_NMPR_FGR);
    const schoAmount = num(scholarship.SCHO_AMT);
    const aidCount = num(scholarship.SCE_RDCTN_NMPR_FGR);
    const aidAmount = num(scholarship.SCE_RDCTN_AMT);
    const totalCount = num(scholarship.NMPR_FGR_SUM);
    const totalAmount = num(scholarship.AMT_SUM);
    if (totalCount || totalAmount || schoCount || aidCount) {
      d.scholarship = { schoCount, schoAmount, aidCount, aidAmount, totalCount, totalAmount };
    }
  }

  return d;
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
  const wkly = i["08"];            // 수업일수·시수

  let studentTotal: number | null = null;
  let classTotal: number | null = null;
  if (grade) {
    studentTotal = num(grade.COL_S_SUM);
    classTotal = num(grade.COL_C_SUM);
  }

  let teachers: number | null = null;
  if (wkly) teachers = num(wkly.ITRT_TCR_TOT_FGR);
  if (teachers == null && grade) teachers = num(grade.TEACH_CNT);

  // OpenAPI 미등록 학교 — 학교알리미 b01 메타 fallback (학생수/교원수만 가능)
  const b01 = i["_b01"] as { studentTotal?: number; teachers?: number; foundType?: string } | undefined;
  if (b01) {
    if (studentTotal == null && b01.studentTotal != null) studentTotal = b01.studentTotal;
    if (teachers == null && b01.teachers != null) teachers = b01.teachers;
  }

  // 성비 (apiType 63: 성별 학생수). COL_MSUM=계(남), COL_WSUM=계(여)
  let genderRatio: { boy: number; girl: number } | null = null;
  const gender = i["63"];
  if (gender) {
    const boy = num(gender.COL_MSUM) ?? 0;
    const girl = num(gender.COL_WSUM) ?? 0;
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

  // 자체해결 (cd 75) — 먼저 계산해야 violenceRatePer100에 합산 가능
  const sr: SchoolView["selfResolved"] = {};
  let selfResolvedTotal = 0;
  for (const y of YEARS) {
    const r = selfResolved[code]?.[y];
    if (!r || r.error || r.parseError || r.skipped) { sr[y] = null; continue; }
    if (r.zero || r.noData) { sr[y] = { s1: 0, s2: 0, total: 0 }; continue; }
    const inner = r.selfResolved;
    if (!inner) { sr[y] = null; continue; }
    const s1 = inner.s1 ?? 0;
    const s2 = inner.s2 ?? 0;
    sr[y] = { s1, s2, total: s1 + s2 };
    selfResolvedTotal += s1 + s2;
  }

  // 학폭 비율 — 심의 + 자체해결 합산 (학부모가 인식하는 "전체 학폭")
  const violenceRatePer100 =
    studentTotal && studentTotal > 0 && yearsWithData > 0
      ? Math.round(((violenceTotal + selfResolvedTotal) / yearsWithData / studentTotal) * 100 * 1000) / 1000
      : null;

  // 예방교육 (cd 66) — 의미 추출된 요약치만
  const pe: SchoolView["preventionEdu"] = {};
  for (const y of YEARS) {
    const r = preventionEdu[code]?.[y];
    if (!r || r.error || r.parseError || r.skipped) { pe[y] = null; continue; }
    if (r.zero || r.noData) { pe[y] = null; continue; }
    if (!r.studentEdu && !r.staffEdu && !r.prevProgram) { pe[y] = null; continue; }

    const summary: NonNullable<SchoolView["preventionEdu"][string]> = {};
    // studentEdu: 학기마다 ["...학기","교원"] td=[횟수, 인원, 참여율%], ["학부모"] td=[횟수,...]
    if (Array.isArray(r.studentEdu)) {
      let tSess = 0, tPart = 0, tRateSum = 0, tRateCnt = 0, pSess = 0;
      for (const row of r.studentEdu) {
        const label = (row.th ?? []).join(" ");
        const td = row.td ?? [];
        if (label.includes("교원")) {
          if (typeof td[0] === "number") tSess += td[0];
          if (typeof td[1] === "number") tPart += td[1];
          if (typeof td[2] === "number") { tRateSum += td[2]; tRateCnt++; }
        } else if (label.includes("학부모")) {
          if (typeof td[0] === "number") pSess += td[0];
        }
      }
      if (tSess) summary.teacherSessions = tSess;
      if (tPart) summary.teacherParticipants = tPart;
      if (tRateCnt) summary.teacherRate = Math.round((tRateSum / tRateCnt) * 10) / 10;
      if (pSess) summary.parentSessions = pSess;
    }
    // staffEdu/prevProgram: 행 라벨 "지도교사 수" / "참여 학생 수", td 합산만 (의미 매핑 불확실)
    const aggregate = (rows: any): { teachers: number; students: number } => {
      let teachers = 0, students = 0;
      if (!Array.isArray(rows)) return { teachers, students };
      for (const row of rows) {
        const label = (row.th ?? []).join(" ");
        const sumTd = (row.td ?? []).filter((x: any) => typeof x === "number").reduce((a: number, b: number) => a + b, 0);
        if (label.includes("지도교사")) teachers += sumTd;
        else if (label.includes("참여 학생") || label.includes("학생")) students += sumTd;
      }
      return { teachers, students };
    };
    const sa = aggregate(r.staffEdu);
    if (sa.teachers || sa.students) {
      summary.staffTeachers = sa.teachers || null;
      summary.staffStudents = sa.students || null;
    }
    const pa = aggregate(r.prevProgram);
    if (pa.teachers || pa.students) {
      summary.progTeachers = pa.teachers || null;
      summary.progStudents = pa.students || null;
    }
    pe[y] = Object.keys(summary).length > 0 ? summary : null;
  }

  // 학교명 기반 분류. 학교알리미 정식명은 "OO여자중학교"/"OO남자고등학교" 형태.
  // 줄임("OO여중")은 정식명에 없으므로 "여자"/"남자" 단어만 검사.
  const schoolGender: "여" | "남" | "공학" = s.name.includes("여자")
    ? "여"
    : s.name.includes("남자")
      ? "남"
      : "공학";

  // 학교 좌표 → 동 매핑
  const dongMatch = findDong(s.lng, s.lat);

  out.push({
    code,
    name: s.name,
    kind: s.kind,
    gender: schoolGender,
    dong: dongMatch?.name ?? "",
    dongCode: dongMatch?.code ?? "",
    city: s.city,
    district: s.district,
    sido: (s.atptOrg ?? "").replace(/교육청$/, "") || s.city,
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
    selfResolved: sr,
    selfResolvedTotal,
    preventionEdu: pe,
    schoolinfoUuid: schoolIds[code]?.uuid,
    foundation: (() => {
      for (const k of Object.keys(i)) {
        if (k === "_b01" || k === "_meta") continue;
        const v = i[k]?.FOND_SC_CODE;
        if (v) return String(v);
      }
      return i["_b01"]?.foundType;
    })(),
    details: extractDetails(i, s.kind, code),
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
