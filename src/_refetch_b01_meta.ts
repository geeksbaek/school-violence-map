/**
 * OpenAPI 미등록 학교들에 대해 학교알리미 b01 상세페이지의 meta description을
 * fetch + 파싱해서 학생수/교원수/설립/주소를 school_info.json의 _b01 필드로 저장.
 *
 * b01 meta 예시:
 *   학생수 : 158명, 교원수 : 29명, 설립구분 : 공립, 설립유형 : 단설,
 *   설립일자 : 1962년 06월 22일, 대표번호 : ..., 팩스 : ...,
 *   주소 : ..., 체육집회공간 : 1실, 관할교육청 : ..., 행정실 : ..., 교무실 : ...
 */
import { join } from "node:path";
import { DATA_DIR, sleep } from "./_env.ts";
import { loadSchoolInfo, saveSchoolInfo } from "./_school_info_io.ts";

const BASE = "https://www.schoolinfo.go.kr";

const init = await fetch(`${BASE}/Main.do`, { redirect: "manual" });
const cookies = init.headers.getSetCookie?.() ?? [];
const SESSION = cookies.map((c) => c.split(";")[0])
  .filter((c) => c.includes("JSESSIONID") || c.includes("WMONID"))
  .join("; ");

const sch: Record<string, any> = await Bun.file(join(DATA_DIR, "schools.json")).json();
const ids: Record<string, { uuid: string }> = await Bun.file(join(DATA_DIR, "school_ids.json")).json();
const data: Record<string, any> = await loadSchoolInfo();

const targets: { code: string; uuid: string; name: string; kind: string; sgg: string }[] = [];
for (const s of Object.values(sch) as any[]) {
  if (s.closeYn !== "N") continue;
  const cur = data[s.code];
  if (cur && Object.keys(cur).filter((k) => k !== "_meta" && k !== "_b01").length > 0) continue;
  const id = ids[s.code];
  if (!id) continue;
  targets.push({ code: s.code, uuid: id.uuid, name: s.name, kind: s.kind, sgg: s.sgg });
}
console.log(`b01 fetch 대상: ${targets.length}교`);

interface B01 {
  studentTotal?: number;
  teachers?: number;
  foundType?: string;        // 공립/사립/국립
  foundSubType?: string;     // 단설/병설/부속
  foundedAt?: string;
  tel?: string;
  fax?: string;
  addr?: string;
  sportsRooms?: number;
  district?: string;
  adminTel?: string;
  staffTel?: string;
}

function parseMeta(html: string): B01 | null {
  const m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (!m) return null;
  const txt = m[1];
  const out: B01 = {};
  const fields: Array<[string, RegExp, (v: string) => any, keyof B01]> = [
    ["학생수", /학생수\s*:\s*([\d,]+)명/, (v) => parseInt(v.replace(/,/g, "")), "studentTotal"],
    ["교원수", /교원수\s*:\s*([\d,]+)명/, (v) => parseInt(v.replace(/,/g, "")), "teachers"],
    ["설립구분", /설립구분\s*:\s*([^,]+)/, (v) => v.trim(), "foundType"],
    ["설립유형", /설립유형\s*:\s*([^,]+)/, (v) => v.trim(), "foundSubType"],
    ["설립일자", /설립일자\s*:\s*([^,]+)/, (v) => v.trim(), "foundedAt"],
    ["대표번호", /대표번호\s*:\s*([^,]+)/, (v) => v.trim(), "tel"],
    ["팩스", /팩스\s*:\s*([^,]+)/, (v) => v.trim(), "fax"],
    ["주소", /주소\s*:\s*([^,]+(?:,\s*\S+)?)/, (v) => v.trim().split(",")[0], "addr"],
    ["체육집회공간", /체육집회공간\s*:\s*(\d+)실/, (v) => parseInt(v), "sportsRooms"],
    ["관할교육청", /관할교육청\s*:\s*([^,]+)/, (v) => v.trim(), "district"],
    ["행정실", /행정실\s*:\s*([^,"]+)/, (v) => v.trim(), "adminTel"],
    ["교무실", /교무실\s*:\s*([^,"]+)/, (v) => v.trim(), "staffTel"],
  ];
  for (const [, re, parse, key] of fields) {
    const mm = txt.match(re);
    if (mm) (out as any)[key] = parse(mm[1]);
  }
  return Object.keys(out).length > 0 ? out : null;
}

let ok = 0, fail = 0;
const t0 = Date.now();
for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  try {
    const r = await fetch(`${BASE}/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=${t.uuid}`, {
      headers: { Cookie: SESSION, Referer: `${BASE}/Main.do` },
    });
    const html = new TextDecoder("euc-kr").decode(await r.arrayBuffer());
    const meta = parseMeta(html);
    if (meta) {
      if (!data[t.code]) data[t.code] = { _meta: { name: t.name, kind: t.kind, sgg: t.sgg, year: "b01" } };
      data[t.code]._b01 = meta;
      ok++;
    } else {
      fail++;
    }
  } catch (e) {
    fail++;
  }
  if ((i + 1) % 50 === 0) {
    await saveSchoolInfo(data, sch);
    const eta = Math.round(((Date.now() - t0) / (i + 1)) * (targets.length - i - 1) / 1000);
    process.stdout.write(`  ${i + 1}/${targets.length} ok=${ok} fail=${fail} eta=${eta}s\n`);
  }
  await sleep(80);
}
await Bun.write(outPath, JSON.stringify(data, null, 2));
console.log(`\n=== 완료 ===\nok ${ok} / fail ${fail} / 시도 ${targets.length}`);
