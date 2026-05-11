/**
 * {base}_part_*.json + 기존 {base}.json 머지 → {base}.json.
 * 같은 (학교, 년도) 키가 여러 part에 있으면 "성공한 결과" 우선.
 *
 * Usage:
 *   bun src/merge_violence.ts                # 기본 violence
 *   bun src/merge_violence.ts --base self_resolved
 *   bun src/merge_violence.ts --base prevention_edu
 */
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { DATA_DIR } from "./_env.ts";

function isSuccess(v: any): boolean {
  if (!v) return false;
  return !v.error && !v.skipped && !v.parseError;
}

const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "violence";

const mainPath = join(DATA_DIR, `${BASE}.json`);
const merged: Record<string, Record<string, any>> = existsSync(mainPath)
  ? await Bun.file(mainPath).json()
  : {};

const partRegex = new RegExp(`^${BASE}_part_.*\\.json$`);
const parts = readdirSync(DATA_DIR).filter((f) => partRegex.test(f));
console.log(`머지 대상 part 파일 (${BASE}): ${parts.length}개\n`);

let added = 0, updated = 0;
for (const file of parts) {
  const data: Record<string, Record<string, any>> = await Bun.file(join(DATA_DIR, file)).json();
  let fileAdded = 0, fileUpdated = 0;
  for (const [code, byYear] of Object.entries(data)) {
    if (!merged[code]) merged[code] = {};
    for (const [year, v] of Object.entries(byYear)) {
      const cur = merged[code][year];
      if (!cur) {
        merged[code][year] = v;
        fileAdded++;
        added++;
      } else if (!isSuccess(cur) && isSuccess(v)) {
        merged[code][year] = v;
        fileUpdated++;
        updated++;
      }
    }
  }
  console.log(`  ${file}: +${fileAdded}건, 갱신 ${fileUpdated}건`);
}

await Bun.write(mainPath, JSON.stringify(merged, null, 2));

const totalEntries = Object.values(merged).reduce((s, v) => s + Object.keys(v).length, 0);
const successEntries = Object.values(merged).reduce(
  (s, byYear) => s + Object.values(byYear).filter(isSuccess).length, 0,
);
console.log(`\n=== 머지 완료 ===`);
console.log(`학교: ${Object.keys(merged).length}`);
console.log(`(학교,년도) 엔트리: ${totalEntries}, 성공 ${successEntries}`);
console.log(`이번 머지: 추가 ${added}, 갱신 ${updated}`);
