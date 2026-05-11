/**
 * .env 직접 로드 (Bun 내장 dotenv 동작 차이를 피해 명시 로드).
 */
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..");
export const DATA_DIR = join(ROOT, "data");

const envPath = join(ROOT, ".env");
const envText = await Bun.file(envPath).text();
for (const line of envText.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  const k = t.slice(0, eq).trim();
  if (process.env[k]) continue;
  const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
  (process.env as any)[k] = v;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
