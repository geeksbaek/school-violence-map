import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { School } from "@/types";
import { severityOf, SEVERITY_COLOR, severityLabel, type Metric } from "@/lib/severity";
import type { SchoolStat } from "@/lib/stats";
import type { RegionPick } from "./SchoolDeckLayer";
import { cn } from "@/lib/utils";

interface Props {
  region: RegionPick;
  schools: School[];
  stats: Map<string, SchoolStat>;
  metric: Metric;
  selectedCode: string | null;
  onPickSchool: (s: School) => void;
  onClose: () => void;
}

export function RegionDetail({ region, schools, stats, metric, selectedCode, onPickSchool, onClose }: Props) {
  const inRegion = useMemo(() => {
    return schools.filter((s) => {
      if (region.type === "city") return s.city === region.key;
      if (region.type === "district") return `${s.city}|${s.district}` === region.key;
      return s.dongCode === region.key;
    });
  }, [schools, region]);

  const summary = useMemo(() => {
    let total = 0, rateSum = 0, rateCnt = 0, hasData = false;
    for (const s of inRegion) {
      const st = stats.get(s.code);
      if (!st) continue;
      total += st.total;
      if (st.ratePer100 != null) {
        rateSum += st.ratePer100;
        rateCnt++;
      }
      if (st.hasData) hasData = true;
    }
    const avgRate = rateCnt > 0 ? rateSum / rateCnt : null;
    return { total, avgRate, hasData };
  }, [inRegion, stats]);

  // 폴리곤 색상과 일관성 위해 학교당 평균 건수 사용
  const avgTotalPerSchool = inRegion.length > 0 ? summary.total / inRegion.length : 0;
  const sev = severityOf(metric, summary.avgRate, avgTotalPerSchool, summary.hasData);
  const labels = severityLabel(metric);
  const color = SEVERITY_COLOR[sev];

  const sorted = useMemo(() => {
    return [...inRegion].sort((a, b) => {
      const sa = stats.get(a.code);
      const sb = stats.get(b.code);
      if (metric === "rate") {
        return (sb?.ratePer100 ?? -1) - (sa?.ratePer100 ?? -1);
      }
      return (sb?.total ?? 0) - (sa?.total ?? 0);
    });
  }, [inRegion, stats, metric]);

  const TYPE_LABEL = { city: "시", district: "구", dong: "동" }[region.type];

  return (
    <Card className="w-full">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-base min-w-0">
            <span
              className="size-3 rounded-full border border-white shadow-sm shrink-0"
              style={{ background: color }}
            />
            <span className="truncate">{region.label}</span>
            <Badge variant="outline" className="shrink-0">{TYPE_LABEL}</Badge>
          </CardTitle>
          <span className="text-muted-foreground text-xs truncate">
            학교 {inRegion.length}개 · {labels[sev]}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mt-1 -mr-1">
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/* 요약 */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded bg-muted/50 p-1.5">
            <div className="text-[10px] text-muted-foreground">학교 수</div>
            <div className="text-sm font-semibold tabular-nums">{inRegion.length}</div>
          </div>
          <div className="rounded bg-muted/50 p-1.5">
            <div className="text-[10px] text-muted-foreground">4년 합계 사건</div>
            <div className="text-sm font-semibold tabular-nums">{summary.total}건</div>
          </div>
          <div className="rounded bg-muted/50 p-1.5 col-span-2">
            <div className="text-[10px] text-muted-foreground">평균 비율 (학생100명·년)</div>
            <div className="text-sm font-semibold tabular-nums">
              {summary.avgRate != null ? summary.avgRate.toFixed(2) : "—"}
            </div>
          </div>
        </div>

        {/* 학교 리스트 */}
        <div className="text-muted-foreground text-xs">학교 — {metric === "rate" ? "비율" : "건수"} ↓</div>
        <ul className="flex flex-col gap-1 max-h-[40dvh] md:max-h-[50dvh] overflow-y-auto">
          {sorted.map((s) => {
            const st = stats.get(s.code);
            const ssev = severityOf(metric, st?.ratePer100 ?? null, st?.total ?? 0, st?.hasData ?? false);
            const isSel = selectedCode === s.code;
            return (
              <li key={s.code}>
                <button
                  type="button"
                  onClick={() => onPickSchool(s)}
                  className={cn(
                    "w-full text-left rounded-md border px-2 py-1.5 hover:bg-accent transition-colors",
                    isSel && "bg-accent border-foreground/30",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full border border-white shadow-sm shrink-0"
                      style={{ background: SEVERITY_COLOR[ssev] }}
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
                    {s.kind} {s.studentTotal ? `· ${s.studentTotal.toLocaleString()}명` : ""}
                  </div>
                </button>
              </li>
            );
          })}
          {sorted.length === 0 && (
            <li className="text-center text-xs text-muted-foreground py-4">학교 없음</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
