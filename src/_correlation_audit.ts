// 학폭 비율과 다양한 학교 특성의 상관관계 조사
import { readFileSync } from "node:fs";
import path from "node:path";

const data = JSON.parse(
  readFileSync(path.join(import.meta.dir, "../web/public/data.json"), "utf-8"),
);

interface School {
  studentTotal: number | null;
  classTotal: number | null;
  teachers: number | null;
  violenceRatePer100: number | null;
  violenceTotal: number;
  selfResolvedTotal?: number;
  preventionEdu?: Record<string, any>;
  details?: any;
  kind: string;
}

const schools: School[] = data.schools;

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

function spearman(xs: number[], ys: number[]): number {
  const ranks = (arr: number[]) => {
    const idx = arr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array(arr.length).fill(0);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  return pearson(ranks(xs), ranks(ys));
}

interface Candidate {
  name: string;
  fn: (s: School) => number | null;
}

const candidates: Candidate[] = [
  // 기본 지표
  { name: "학생수", fn: (s) => s.studentTotal },
  { name: "학급수", fn: (s) => s.classTotal },
  { name: "교사수", fn: (s) => s.teachers },
  { name: "교사당 학생수", fn: (s) => s.studentTotal && s.teachers ? s.studentTotal / s.teachers : null },
  { name: "학급당 학생수", fn: (s) => s.studentTotal && s.classTotal ? s.studentTotal / s.classTotal : null },
  { name: "남학생 비율(%)", fn: (s) => {
    const g = (s as any).genderRatio;
    return g && (g.boy + g.girl) > 0 ? (g.boy / (g.boy + g.girl)) * 100 : null;
  } },

  // 예방교육
  { name: "교원 정규수업 횟수", fn: (s) => s.preventionEdu?.[2026]?.teacherSessions ?? null },
  { name: "교원 정규수업 참여율(%)", fn: (s) => (s.preventionEdu?.[2026]?.teacherRate ?? 0) * 100 || null },
  { name: "학부모 교육 횟수", fn: (s) => s.preventionEdu?.[2026]?.parentSessions ?? null },
  { name: "예방프로그램 참여학생", fn: (s) => s.preventionEdu?.[2026]?.progStudents ?? null },
  { name: "예방프로그램 지도교사", fn: (s) => s.preventionEdu?.[2026]?.progTeachers ?? null },
  { name: "교원·학부모 연수 학생수", fn: (s) => s.preventionEdu?.[2026]?.staffStudents ?? null },

  // 시설
  { name: "일반교실수", fn: (s) => s.details?.facility?.regularClassrooms },
  { name: "특별교실수", fn: (s) => s.details?.facility?.specialClassrooms },
  { name: "교과교실수", fn: (s) => s.details?.facility?.subjectClassrooms },
  { name: "체육관 보유", fn: (s) => s.details?.facility?.gym ?? null },
  { name: "강당 보유", fn: (s) => s.details?.facility?.auditorium ?? null },

  // 보건
  { name: "보건실 연간 이용건수", fn: (s) => s.details?.health?.annualVisits },
  { name: "보건실 1인당 이용", fn: (s) => s.details?.health?.perStudentVisits },

  // 급식
  { name: "영양사수", fn: (s) => s.details?.meal?.nutritionists },
  { name: "조리사수", fn: (s) => s.details?.meal?.cooks },
  { name: "조리원수", fn: (s) => s.details?.meal?.cookAssistants },

  // 활동
  { name: "창체 동아리 학생수", fn: (s) => s.details?.activities?.creativeStudents },
  { name: "창체 외부강사", fn: (s) => s.details?.activities?.creativeExternalLecturers },
  { name: "창체 예산", fn: (s) => s.details?.activities?.creativeBudget },
  { name: "자율 동아리 수", fn: (s) => s.details?.activities?.clubs },
  { name: "자율 동아리 예산", fn: (s) => s.details?.activities?.clubBudget },

  // 방과후·돌봄
  { name: "방과후 프로그램 수", fn: (s) => s.details?.afterSchool?.programs },
  { name: "방과후 학생수", fn: (s) => s.details?.afterSchool?.students },
  { name: "방과후 부담금", fn: (s) => s.details?.afterSchool?.burdenAmount },
  { name: "돌봄교실수", fn: (s) => s.details?.afterSchool?.careRooms },

  // 장학금
  { name: "장학금 인원", fn: (s) => s.details?.scholarship?.totalCount },
  { name: "장학금 금액", fn: (s) => s.details?.scholarship?.totalAmount },
  { name: "학비지원 인원", fn: (s) => s.details?.scholarship?.aidCount },
  { name: "학비지원 금액", fn: (s) => s.details?.scholarship?.aidAmount },

  // 학교 환경
  { name: "전체 부지(m²)", fn: (s) => s.details?.land?.totalArea },
  { name: "체육장(m²)", fn: (s) => s.details?.land?.sportsGround },
  { name: "1인당 체육장(m²)", fn: (s) => s.details?.land?.sportsPerStudent },

  // 시설 개방
  { name: "시설 개방 가짓수", fn: (s) => {
    const o = s.details?.openness;
    if (!o) return null;
    return Object.values(o).filter((v) => v === true).length;
  } },

  // 장애인 편의
  { name: "장애인 편의시설 수", fn: (s) => s.details?.disability?.installedCount },

  // 안전교육
  { name: "안전교육 총 시수", fn: (s) => {
    const se = s.details?.safetyEducation;
    if (!se) return null;
    let sum = 0;
    for (const v of Object.values(se)) {
      const t = (v as any).total;
      if (typeof t === "number") sum += t;
    }
    return sum > 0 ? sum : null;
  } },

  // 자체해결 비중
  { name: "자체해결 비중(%)", fn: (s) => {
    const tot = s.violenceTotal + (s.selfResolvedTotal ?? 0);
    return tot > 0 ? ((s.selfResolvedTotal ?? 0) / tot) * 100 : null;
  } },
];

console.log("\n=== 학폭 비율(violenceRatePer100)과 각 변수의 상관계수 ===\n");
console.log("Pearson(P): 선형 상관, Spearman(S): 순위 상관 (이상치에 강함)");
console.log("|r| >= 0.3: 뚜렷, 0.1~0.3: 약함, <0.1: 무시할 수준");
console.log("");

interface Result {
  name: string;
  n: number;
  p: number;
  s: number;
  meanX: number;
}

const results: Result[] = [];

for (const c of candidates) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of schools) {
    if (s.violenceRatePer100 == null) continue;
    const x = c.fn(s);
    if (x == null || !Number.isFinite(x)) continue;
    xs.push(x);
    ys.push(s.violenceRatePer100);
  }
  if (xs.length < 100) continue;
  const p = pearson(xs, ys);
  const s = spearman(xs, ys);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  results.push({ name: c.name, n: xs.length, p, s, meanX });
}

// |Spearman| 기준 정렬
results.sort((a, b) => Math.abs(b.s) - Math.abs(a.s));

console.log(
  "변수".padEnd(28),
  "n".padStart(6),
  "Pearson".padStart(9),
  "Spearman".padStart(10),
  "방향",
);
console.log("─".repeat(80));
for (const r of results) {
  const dir = Math.abs(r.s) < 0.05 ? " " : r.s > 0 ? "↑ 비례" : "↓ 반비례";
  console.log(
    r.name.padEnd(28),
    String(r.n).padStart(6),
    r.p.toFixed(3).padStart(9),
    r.s.toFixed(3).padStart(10),
    " " + dir,
  );
}

// 학교종류별 상위 5개
console.log("\n\n=== 학교종류별 상위 상관 (|Spearman| 기준 TOP 5) ===\n");
for (const kind of ["초등", "중학", "고등"]) {
  const sub = schools.filter((s) => s.kind === kind);
  console.log(`\n[${kind}] (${sub.length}교)`);
  const local: Result[] = [];
  for (const c of candidates) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of sub) {
      if (s.violenceRatePer100 == null) continue;
      const x = c.fn(s);
      if (x == null || !Number.isFinite(x)) continue;
      xs.push(x);
      ys.push(s.violenceRatePer100);
    }
    if (xs.length < 50) continue;
    local.push({ name: c.name, n: xs.length, p: pearson(xs, ys), s: spearman(xs, ys), meanX: 0 });
  }
  local.sort((a, b) => Math.abs(b.s) - Math.abs(a.s));
  for (const r of local.slice(0, 6)) {
    const dir = r.s > 0 ? "↑" : "↓";
    console.log(`  ${r.name.padEnd(26)} S=${r.s.toFixed(3)} ${dir}  (n=${r.n})`);
  }
}
