import { useMemo } from "react";
import type { DataSet, School, SchoolKind } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SEVERITY_COLOR, SEVERITY_LABEL, SEVERITY_ORDER, severityOf } from "@/lib/severity";
import { cn } from "@/lib/utils";

interface FilterState {
  cities: Set<string>;
  kinds: Set<SchoolKind>;
  query: string;
}

interface Props {
  data: DataSet;
  filtered: School[];
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  selected: School | null;
  onPick: (s: School) => void;
}

const KIND_LIST: SchoolKind[] = ["초등", "중학", "고등"];

export function Sidebar({ data, filtered, filter, setFilter, selected, onPick }: Props) {
  const cityList = useMemo(() => Array.from(new Set(data.schools.map((s) => s.city))).sort(), [data]);

  // 정렬: 학폭 비율 내림차순 (데이터 없는 건 뒤로)
  const sortedTop = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ar = a.violenceYears > 0 ? a.violenceRatePer100 ?? -1 : -1;
      const br = b.violenceYears > 0 ? b.violenceRatePer100 ?? -1 : -1;
      return br - ar;
    });
  }, [filtered]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of filtered) {
      const sev = severityOf(s.violenceRatePer100, s.violenceYears > 0);
      counts[sev] = (counts[sev] ?? 0) + 1;
    }
    return counts;
  }, [filtered]);

  return (
    <aside className="bg-background flex flex-col gap-3 overflow-hidden border-r p-3 w-[340px] flex-shrink-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-bold leading-tight">학교폭력 지도</h1>
        <span className="text-muted-foreground text-xs">
          수원·용인·성남·화성 · {data.schools.length}개 학교
        </span>
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

      {/* 범례 */}
      <Card className="py-2">
        <CardHeader className="px-3 pb-1">
          <CardTitle className="text-xs">학생 100명당 연 사건 비율</CardTitle>
        </CardHeader>
        <CardContent className="px-3 flex flex-col gap-1 text-[11px]">
          {SEVERITY_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full border border-white shadow-sm"
                style={{ background: SEVERITY_COLOR[s] }}
              />
              <span className="flex-1">{SEVERITY_LABEL[s]}</span>
              <span className="text-muted-foreground tabular-nums">
                {stats[s] ?? 0}개
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 리스트 */}
      <div className="text-muted-foreground text-xs px-1">
        리스트 ({sortedTop.length}개) — 학폭 비율 ↓
      </div>
      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        <ul className="flex flex-col gap-1">
          {sortedTop.map((s) => {
            const sev = severityOf(s.violenceRatePer100, s.violenceYears > 0);
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
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {s.violenceTotal > 0 ? `${s.violenceTotal}건` : ""}
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
