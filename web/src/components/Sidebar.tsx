import { useMemo } from "react";
import type { DataSet, School, SchoolKind, SchoolGender } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  SEVERITY_COLOR, SEVERITY_ORDER, severityOf, severityLabel, type Metric,
} from "@/lib/severity";
import type { SchoolStat } from "@/lib/stats";
import { cn } from "@/lib/utils";

interface FilterState {
  cities: Set<string>;
  kinds: Set<SchoolKind>;
  genders: Set<SchoolGender>;
  query: string;
  types: Set<number>; // 학폭 유형 인덱스 (0..7)
}

interface Props {
  data: DataSet;
  filtered: School[];
  stats: Map<string, SchoolStat>;
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  selected: School | null;
  onPick: (s: School) => void;
  metric: Metric;
  setMetric: (m: Metric) => void;
  onClose?: () => void; // 모바일 닫기 버튼
}

const KIND_LIST: SchoolKind[] = ["초등", "중학", "고등"];
const GENDER_LIST: SchoolGender[] = ["공학", "여", "남"];

export function Sidebar({
  data, filtered, stats, filter, setFilter, selected, onPick, metric, setMetric, onClose,
}: Props) {
  const cityList = useMemo(() => Array.from(new Set(data.schools.map((s) => s.city))).sort(), [data]);

  const sortedTop = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const sa = stats.get(a.code);
      const sb = stats.get(b.code);
      if (metric === "rate") {
        const ar = sa?.hasData ? sa.ratePer100 ?? -1 : -1;
        const br = sb?.hasData ? sb.ratePer100 ?? -1 : -1;
        return br - ar;
      }
      const ah = sa?.hasData ? 1 : 0;
      const bh = sb?.hasData ? 1 : 0;
      if (ah !== bh) return bh - ah;
      return (sb?.total ?? 0) - (sa?.total ?? 0);
    });
  }, [filtered, stats, metric]);

  const sevCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of filtered) {
      const st = stats.get(s.code);
      const sev = severityOf(metric, st?.ratePer100 ?? null, st?.total ?? 0, st?.hasData ?? false);
      counts[sev] = (counts[sev] ?? 0) + 1;
    }
    return counts;
  }, [filtered, stats, metric]);

  const labels = severityLabel(metric);
  const allTypesOn = filter.types.size === 8;
  const allGendersOn = filter.genders.size === 3;

  // 학교 성별별 카운트 (현재 다른 필터 무시한 전체 기준 — 정보용)
  const genderCounts = useMemo(() => {
    const m: Record<SchoolGender, number> = { 공학: 0, 여: 0, 남: 0 };
    for (const s of data.schools) m[s.gender]++;
    return m;
  }, [data]);

  return (
    <aside className="bg-background flex flex-col gap-3 overflow-hidden border-r p-3 w-full h-full md:w-[340px] md:flex-shrink-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-bold leading-tight">학교폭력 지도</h1>
          <span className="text-muted-foreground text-xs">
            수원·용인·성남·화성 · {data.schools.length}개 학교
          </span>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden shrink-0">
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* 검색 */}
      <input
        type="search"
        placeholder="학교명 검색..."
        value={filter.query}
        onChange={(e) => setFilter({ ...filter, query: e.target.value })}
        className="border rounded-md px-3 py-2 text-sm bg-background"
      />

      {/* 학교 종류 필터 */}
      <div className="flex gap-1.5">
        {KIND_LIST.map((k) => {
          const active = filter.kinds.has(k);
          return (
            <Button
              key={k}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const next = new Set(filter.kinds);
                if (active) next.delete(k); else next.add(k);
                setFilter({ ...filter, kinds: next });
              }}
              className="flex-1"
            >
              {k}
            </Button>
          );
        })}
      </div>

      {/* 학교 성별 필터 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>학교 성별 ({filter.genders.size}/3)</span>
          <button
            type="button"
            onClick={() =>
              setFilter({
                ...filter,
                genders: allGendersOn ? new Set() : new Set(GENDER_LIST),
              })
            }
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {allGendersOn ? "모두 끄기" : "모두 켜기"}
          </button>
        </div>
        <div className="flex gap-1.5">
          {GENDER_LIST.map((g) => {
            const active = filter.genders.has(g);
            return (
              <Button
                key={g}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const next = new Set(filter.genders);
                  if (active) next.delete(g); else next.add(g);
                  setFilter({ ...filter, genders: next });
                }}
                className="flex-1 text-xs"
              >
                {g === "여" ? "여학교" : g === "남" ? "남학교" : "공학"} ({genderCounts[g]})
              </Button>
            );
          })}
        </div>
      </div>

      {/* 시 필터 */}
      <div className="flex flex-wrap gap-1">
        {cityList.map((c) => {
          const active = filter.cities.has(c);
          return (
            <Badge
              key={c}
              variant={active ? "default" : "outline"}
              onClick={() => {
                const next = new Set(filter.cities);
                if (active) next.delete(c); else next.add(c);
                setFilter({ ...filter, cities: next });
              }}
              className="cursor-pointer"
            >
              {c}
            </Badge>
          );
        })}
      </div>

      {/* 학폭 유형 필터 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>학폭 유형 ({filter.types.size}/8)</span>
          <button
            type="button"
            onClick={() =>
              setFilter({
                ...filter,
                types: allTypesOn ? new Set() : new Set([0, 1, 2, 3, 4, 5, 6, 7]),
              })
            }
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {allTypesOn ? "모두 끄기" : "모두 켜기"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {data.typeLabels.map((label, i) => {
            const active = filter.types.has(i);
            return (
              <Badge
                key={label}
                variant={active ? "default" : "outline"}
                onClick={() => {
                  const next = new Set(filter.types);
                  if (active) next.delete(i); else next.add(i);
                  setFilter({ ...filter, types: next });
                }}
                className="cursor-pointer text-[10px]"
              >
                {label}
              </Badge>
            );
          })}
        </div>
      </div>

      {/* 메트릭 토글 */}
      <div className="flex gap-1 rounded-md border p-0.5 bg-muted/30">
        <Button
          variant={metric === "rate" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMetric("rate")}
          className="flex-1 h-7"
        >
          비율
        </Button>
        <Button
          variant={metric === "count" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMetric("count")}
          className="flex-1 h-7"
        >
          건수
        </Button>
      </div>

      {/* 범례 — 색·크기·모양 */}
      <Card className="py-2">
        <CardHeader className="px-3 pb-1">
          <CardTitle className="text-xs">
            색 — {metric === "rate" ? "학생 100명당 연 사건" : "4년 합계 건수"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 flex flex-col gap-1 text-[11px]">
          {SEVERITY_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full border border-white shadow-sm"
                style={{ background: SEVERITY_COLOR[s] }}
              />
              <span className="flex-1">{labels[s]}</span>
              <span className="text-muted-foreground tabular-nums">
                {sevCounts[s] ?? 0}개
              </span>
            </div>
          ))}
        </CardContent>

        <div className="mt-1 border-t pt-2 px-3 flex flex-col gap-1.5">
          <div className="text-xs font-semibold">
            크기 — {metric === "rate" ? "학생수" : "사건 수 (4년)"}
          </div>
          <div className="flex items-end gap-3 pl-1">
            {(metric === "rate"
              ? [
                  { d: 9, l: "<200" },
                  { d: 11, l: "200+" },
                  { d: 14, l: "500+" },
                  { d: 18, l: "1000+" },
                ]
              : [
                  { d: 8, l: "0건" },
                  { d: 10, l: "1+" },
                  { d: 13, l: "5+" },
                  { d: 17, l: "15+" },
                  { d: 22, l: "30+" },
                ]
            ).map((s) => (
              <div key={s.l} className="flex flex-col items-center gap-0.5">
                <span
                  className="rounded-full bg-foreground/60 border border-white"
                  style={{ width: s.d, height: s.d }}
                />
                <span className="text-[10px] text-muted-foreground">{s.l}</span>
              </div>
            ))}
          </div>

          <div className="text-xs font-semibold mt-1">모양 — 학교 종류</div>
          <div className="flex items-center gap-3 pl-1 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-full bg-foreground/60" />
              초등
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block size-3 bg-foreground/60" />
              중학
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block size-3 bg-foreground/60 rotate-45" />
              고등
            </div>
          </div>
        </div>
      </Card>

      {/* 리스트 */}
      <div className="text-muted-foreground text-xs px-1">
        리스트 ({sortedTop.length}개) — {metric === "rate" ? "비율" : "건수"} ↓
      </div>
      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        <ul className="flex flex-col gap-1">
          {sortedTop.map((s) => {
            const st = stats.get(s.code);
            const sev = severityOf(metric, st?.ratePer100 ?? null, st?.total ?? 0, st?.hasData ?? false);
            const isSel = selected?.code === s.code;
            return (
              <li key={s.code}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className={cn(
                    "w-full text-left rounded-md border px-2 py-1.5 hover:bg-accent transition-colors",
                    isSel && "bg-accent border-foreground/30",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full border border-white shadow-sm shrink-0"
                      style={{ background: SEVERITY_COLOR[sev] }}
                    />
                    <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {st?.hasData ? (
                        metric === "rate" && st.ratePer100 != null
                          ? `${st.ratePer100.toFixed(2)}/100명·년`
                          : `${st.total}건`
                      ) : "—"}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground pl-4 truncate">
                    {s.kind} · {s.city} {s.district}
                    {s.studentTotal ? ` · ${s.studentTotal.toLocaleString()}명` : ""}
                  </div>
                </button>
              </li>
            );
          })}
          {sortedTop.length === 0 && (
            <li className="text-center text-xs text-muted-foreground py-4">필터 조건에 맞는 학교 없음</li>
          )}
        </ul>
      </div>
    </aside>
  );
}

export type { FilterState };
