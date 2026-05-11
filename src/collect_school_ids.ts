/**
 * 학교알리미 검색 인터페이스 SHL_IDF_CD (UUID) 수집.
 * OpenAPI의 SCHUL_CODE(S0xxxxx) ↔ 검색용 SHL_IDF_CD(UUID) 매핑.
 *
 * 학폭(b69) 등 캡차 페이지는 UUID가 필요해서 별도 매핑 단계가 필요.
 *
 * 시군구 × 초/중/고 호출 → SHL_NM 으로 schools.json과 매칭.
 *
 * 출력: data/school_ids.json
 *   { [SCHUL_CODE]: { uuid, nameInSearch } }
 *
 * Usage: bun src/collect_school_ids.ts
 */
import { join } from "node:path";
import { DATA_DIR, sleep } from "./_env.ts";
import { REGIONS } from "./regions.ts";

const BASE = "https://www.schoolinfo.go.kr";

let SESSION = "";

async function initSession() {
  const res = await fetch(`${BASE}/ei/ss/pneiss_a05_s0.do`, { redirect: "manual" });
  const cookies = res.headers.getSetCookie?.() ?? [];
  let js = "", wm = "";
  for (const c of cookies) {
    if (c.includes("JSESSIONID")) js = c.split(";")[0];
    if (c.includes("WMONID")) wm = c.split(";")[0];
  }
  SESSION = [wm, js].filter(Boolean).join("; ");
}

async function getList(sgg10: string, hgJongryu: string) {
  // hgJongryu: 02 초등 / 03 중등 / 04 고등
  const url = `${BASE}/ei/ss/pneiss_a05_s0/selectSchoolListLocation.do`;
  const body = new URLSearchParams({
    HG_JONGRYU_GB: hgJongryu,
    SIDO_CODE: "4100000000",
    SIGUNGU_CODE: sgg10,
    SULRIP_GB: "1",
    GS_HANGMOK_CD: "69",
    PNF_YR: "2026",
    JG_HANGMOK_CD: "97",
  });
  body.append("SULRIP_GB", "2");
  body.append("SULRIP_GB", "3");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Cookie: SESSION,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });
  const j = (await res.json()) as { schoolList?: { SHL_NM: string; SHL_IDF_CD: string }[] };
  return j.schoolList ?? [];
}

interface SchoolEntry {
  code: string;
  name: string;
  kind: "초등" | "중학" | "고등";
  sgg: string;
}

const KIND_TO_HG: Record<string, string> = { 초등: "02", 중학: "03", 고등: "04" };

function normalize(s: string): string {
  // "수원OO초등학교" / "OO초" / "OO초등학교" 등을 비교 가능하게
  return s.replace(/\s+/g, "").replace(/초등학교$|중학교$|고등학교$|초등$|중등$|고등$|초$|중$|고$/, "");
}

async function main() {
  await initSession();

  const schools: Record<string, SchoolEntry> = await Bun.file(join(DATA_DIR, "schools.json")).json();
  const byKindSggName = new Map<string, string>(); // `${kind}|${sgg}|${normName}` → code
  for (const s of Object.values(schools)) {
    if ((s as any).closeYn === "Y") continue;
    byKindSggName.set(`${s.kind}|${s.sgg}|${normalize(s.name)}`, s.code);
  }

  const out: Record<string, { uuid: string; nameInSearch: string }> = {};

  // 검색 인터페이스의 시군구 코드는 10자리, OpenAPI는 5자리.
  // 화성시 신설 4개 구(만세/효행/병점/동탄)로 검색해도 일부 누락되므로 통합(4159000000)도 같이 호출.
  const searchRegions = REGIONS;

  let matched = 0, unmatched = 0;
  for (const region of searchRegions) {
    for (const kind of ["초등", "중학", "고등"] as const) {
      const list = await getList(region.sgg10, KIND_TO_HG[kind]);
      let added = 0;
      for (const s of list) {
        // 학교명 매칭: 같은 sgg + kind 안에서 normalize 일치
        const norm = normalize(s.SHL_NM);
        // 화성시는 sgg가 41591/93/95/97 + 통합 41590 모두 가능 → 4개 구 sgg + 41590도 시도
        let code: string | undefined;
        const trySggs = region.city === "화성시" ? [region.sgg, "41590"] : [region.sgg];
        for (const sgg of trySggs) {
          code = byKindSggName.get(`${kind}|${sgg}|${norm}`);
          if (code) break;
        }
        if (code) {
          if (!out[code]) {
            out[code] = { uuid: s.SHL_IDF_CD, nameInSearch: s.SHL_NM };
            added++;
            matched++;
          }
        } else {
          unmatched++;
        }
      }
      console.log(`  ${region.label} ${kind}: 검색 ${list.length}개 → 매칭 ${added}개`);
      await sleep(120);
    }
  }

  await Bun.write(join(DATA_DIR, "school_ids.json"), JSON.stringify(out, null, 2));

  // 매칭 누락 학교 보고
  const allActive = Object.values(schools).filter((s: any) => s.closeYn === "N");
  const missing = allActive.filter((s: any) => !out[s.code]);
  console.log(`\n매칭: ${matched} / 검색 미매칭 row: ${unmatched}`);
  console.log(`schools.json 기준 매핑 없음: ${missing.length}개`);
  if (missing.length > 0 && missing.length <= 30) {
    for (const m of missing.slice(0, 30)) console.log(`  - ${m.kind} ${m.name} (${m.sgg})`);
  } else if (missing.length > 0) {
    console.log(`샘플 10개:`);
    for (const m of missing.slice(0, 10)) console.log(`  - ${m.kind} ${m.name} (${m.sgg})`);
  }
}

await main();
