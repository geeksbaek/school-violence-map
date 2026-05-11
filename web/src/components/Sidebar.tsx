import { useEffect, useMemo, useRef, useState } from "react";
import type { DataSet, School, SchoolKind, SchoolGender } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Search, X } from "lucide-react";
import {
  SEVERITY_COLOR, SEVERITY_ORDER, severityOf, severityLabel, type Metric,
} from "@/lib/severity";
import type { SchoolStat } from "@/lib/stats";
import { cn } from "@/lib/utils";

interface FilterState {
  kinds: Set<SchoolKind>;
  genders: Set<SchoolGender>;
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
  onClose?: () => void;
}

const KIND_LIST: SchoolKind[] = ["초등", "중학", "고등"];
const GENDER_LIST: SchoolGender[] = ["공학", "여"];
const ALL_TYPES = [0, 1, 2, 3, 4, 5, 6, 7];

export function Sidebar({
  data, filtered, stats, filter, setFilter, selected, onPick, metric, setMetric, onClose,
}: Props) {
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

  const genderCounts = useMemo(() => {
    const m: Record<SchoolGender, number> = { 공학: 0, 여: 0, 남: 0 };
    for (const s of data.schools) m[s.gender]++;
    return m;
  }, [data]);

  return (
    <aside className="bg-background flex h-full w-full flex-col gap-4 overflow-y-auto overscroll-contain border-r p-4 md:w-[340px] md:flex-shrink-0">
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-base font-bold leading-tight">학교폭력 지도</h1>
          <span className="text-muted-foreground text-xs">
            전국 {data.schools.length.toLocaleString()}개 학교
          </span>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden shrink-0 -mt-1 -mr-1">
            <X className="size-4" />
          </Button>
        )}
      </header>

      {/* 자동완성 검색 — 학교 1개 선택 */}
      <SchoolAutocomplete
        schools={data.schools}
        stats={stats}
        metric={metric}
        onPick={onPick}
      />

      {/* 메트릭 토글 */}
      <ToggleGroup
        type="single"
        value={metric}
        onValueChange={(v) => v && setMetric(v as Metric)}
        variant="outline"
        size="sm"
        className="w-full"
      >
        <ToggleGroupItem value="rate" className="flex-1">비율</ToggleGroupItem>
        <ToggleGroupItem value="count" className="flex-1">건수</ToggleGroupItem>
      </ToggleGroup>

      <Separator />

      {/* 학교 종류 */}
      <FilterBlock label="학교 종류" count={`${filter.kinds.size}/3`}>
        <ToggleGroup
          type="multiple"
          value={[...filter.kinds]}
          onValueChange={(arr) => setFilter({ ...filter, kinds: new Set(arr as SchoolKind[]) })}
          variant="outline"
          size="sm"
          className="w-full"
        >
          {KIND_LIST.map((k) => (
            <ToggleGroupItem key={k} value={k} className="flex-1">
              {k}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterBlock>

      {/* 학교 성별 */}
      <FilterBlock label="학교 성별" count={`${filter.genders.size}/2`}>
        <ToggleGroup
          type="multiple"
          value={[...filter.genders]}
          onValueChange={(arr) => setFilter({ ...filter, genders: new Set(arr as SchoolGender[]) })}
          variant="outline"
          size="sm"
          className="w-full"
        >
          {GENDER_LIST.map((g) => (
            <ToggleGroupItem key={g} value={g} className="flex-1 text-xs">
              {g === "여" ? "여학교" : "공학"}
              <span className="ml-1 text-muted-foreground tabular-nums">{genderCounts[g]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterBlock>

      {/* 학폭 유형 */}
      <FilterBlock
        label="학폭 유형"
        count={`${filter.types.size}/8`}
        action={
          <button
            type="button"
            onClick={() => setFilter({ ...filter, types: allTypesOn ? new Set() : new Set(ALL_TYPES) })}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {allTypesOn ? "모두 끄기" : "모두 켜기"}
          </button>
        }
      >
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
                className="cursor-pointer text-[10px] select-none"
              >
                {label}
              </Badge>
            );
          })}
        </div>
      </FilterBlock>

      <Separator />

      {/* 범례 */}
      <Card className="py-2 gap-0">
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

        <Separator className="my-2" />
        <CardContent className="px-3 flex flex-col gap-1.5">
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
        </CardContent>
      </Card>

      <Separator />

      {/* 리스트 */}
      <div className="flex flex-col gap-2">
        <div className="text-muted-foreground text-xs px-1">
          리스트 ({sortedTop.length.toLocaleString()}개) — {metric === "rate" ? "비율" : "건수"} ↓
        </div>
        <ul className="flex flex-col gap-1">
          {sortedTop.slice(0, 200).map((s) => {
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
          {sortedTop.length > 200 && (
            <li className="text-center text-[10px] text-muted-foreground py-2">
              상위 200개만 표시 — 필터로 좁히거나 검색으로 직접 선택하세요
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}

function FilterBlock({
  label, count, action, children,
}: { label: string; count?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-muted-foreground">
          {label}
          {count && <span className="ml-1 tabular-nums">({count})</span>}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── 학교 검색 자동완성 ────────────────────────────
function SchoolAutocomplete({
  schools, stats, metric, onPick,
}: {
  schools: School[];
  stats: Map<string, SchoolStat>;
  metric: Metric;
  onPick: (s: School) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = useMemo(() => {
    const query = q.trim();
    if (!query) return [];
    const out: School[] = [];
    for (const s of schools) {
      if (s.name.includes(query)) {
        out.push(s);
        if (out.length >= 50) break;
      }
    }
    return out;
  }, [q, schools]);

  // 키보드 네비
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(matches.length - 1, i + 1));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = matches[active];
      if (s) {
        onPick(s);
        setQ("");
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function pick(s: School) {
    onPick(s);
    setQ("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        placeholder="학교명 검색"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => q && setOpen(true)}
        onKeyDown={onKey}
        className="pl-8"
      />
      {open && q && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg overflow-hidden">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">일치하는 학교 없음</div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {matches.map((s, i) => {
                const st = stats.get(s.code);
                const sev = severityOf(metric, st?.ratePer100 ?? null, st?.total ?? 0, st?.hasData ?? false);
                return (
                  <li key={s.code}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(s)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 flex items-center gap-2 transition-colors",
                        i === active ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <span
                        className="size-2.5 rounded-full border border-white shadow-sm shrink-0"
                        style={{ background: SEVERITY_COLOR[sev] }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {s.kind} · {s.city} {s.district}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export type { FilterState };
