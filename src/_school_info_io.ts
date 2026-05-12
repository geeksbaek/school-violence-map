/**
 * school_info를 시·도 단위 18개 파일로 분할 저장/로드.
 * 단일 파일(193MB)이 GitHub 100MB 한도 초과 → sido별 분할.
 *
 * 저장 위치: data/school_info/{sido}.json
 *   sido는 schools.json의 atptOrg에서 "교육청" 제거 (서울특별시, 경기도, ...)
 *   교육부 소속 + 매핑 실패는 "기타.json"
 *
 * Public API:
 *   loadSchoolInfo()   : Record<code, blob>
 *   saveSchoolInfo(d, schools)  : 분할 저장
 *   sidoOfSchool(s)    : sido 추출
 */
import { join } from "node:path";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { DATA_DIR } from "./_env.ts";

export const INFO_DIR = join(DATA_DIR, "school_info");
export const LEGACY_PATH = join(DATA_DIR, "school_info.json");

export function sidoOfSchool(s: { atptOrg?: string }): string {
  const v = (s.atptOrg ?? "").replace(/교육청$/, "").trim();
  return v || "기타";
}

export async function loadSchoolInfo(): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  if (existsSync(INFO_DIR)) {
    for (const f of readdirSync(INFO_DIR)) {
      if (!f.endsWith(".json")) continue;
      const part = await Bun.file(join(INFO_DIR, f)).json();
      Object.assign(out, part);
    }
    return out;
  }
  // 분할 파일 없으면 단일 legacy 로드
  if (existsSync(LEGACY_PATH)) return Bun.file(LEGACY_PATH).json();
  return out;
}

export async function saveSchoolInfo(
  data: Record<string, any>,
  schools: Record<string, any>,
): Promise<void> {
  if (!existsSync(INFO_DIR)) mkdirSync(INFO_DIR, { recursive: true });
  const buckets: Record<string, Record<string, any>> = {};
  for (const [code, blob] of Object.entries(data)) {
    const sch = schools[code];
    const sido = sch ? sidoOfSchool(sch) : "기타";
    (buckets[sido] ??= {})[code] = blob;
  }
  const writes: Promise<unknown>[] = [];
  for (const [sido, blob] of Object.entries(buckets)) {
    const path = join(INFO_DIR, `${sido}.json`);
    writes.push(Bun.write(path, JSON.stringify(blob, null, 2)));
  }
  await Promise.all(writes);
}
