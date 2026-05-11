import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { DataSet, School } from "@/types";
import { severityOf, SEVERITY_COLOR, severityLabel, type Metric } from "@/lib/severity";
import type { SchoolStat } from "@/lib/stats";
import { cn } from "@/lib/utils";

interface Props {
  school: School;
  stat: SchoolStat;
  data: DataSet;
  metric: Metric;
  selectedTypes: Set<number>;
  onClose: () => void;
}

const KIND_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  초등: "default",
  중학: "secondary",
  고등: "outline",
};

export function SchoolDetail({ school, stat, data, metric, selectedTypes, onClose }: Props) {
  const sev = severityOf(metric, stat.ratePer100, stat.total, stat.hasData);
  const color = SEVERITY_COLOR[sev];
  const labels = severityLabel(metric);

  const yearsArr = data.years;
  // 선택 유형만 합산한 년도별 총합으로 막대 그리기
  const yearTotals = yearsArr.map((y) => {
    const v = school.violence[y];
    if (!v) return null;
    let s = 0;
    for (const i of selectedTypes) s += v.types[i] ?? 0;
    return s;
  });
  const maxYearTotal = Math.max(1, ...yearTotals.map((t) => t ?? 0));
  const maxTypeTotal = Math.max(
    1,
    ...school.violence[yearsArr[yearsArr.length - 1]]?.types ?? [0],
  );
  const allTypesOn = selectedTypes.size === 8;

  return (
    <Card className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <span
              className="size-3 rounded-full border border-white shadow-sm"
              style={{ background: color }}
            />
            {school.name}
            <Badge variant={KIND_VARIANT[school.kind]} className="ml-1">
              {school.kind}
            </Badge>
          </CardTitle>
          <span className="text-muted-foreground text-xs">
            {school.city} {school.district}
            {school.addr ? ` · ${school.addr}` : ""}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/* 요약 */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="학생수" value={school.studentTotal?.toLocaleString() ?? "—"} />
          <Stat label="학급수" value={school.classTotal?.toString() ?? "—"} />
          <Stat label="교원" value={school.teachers?.toString() ?? "—"} />
        </div>

        {/* 학폭 요약 — 절대건수와 비율 모두 표시 */}
        <div
          className="rounded-md border p-2 text-xs"
          style={{ borderColor: color }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{labels[sev]}</span>
            <span className="text-[10px] text-muted-foreground">
              {metric === "rate" ? "비율 기준" : "건수 기준"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded bg-muted/50 p-1.5">
              <div className="text-[10px] text-muted-foreground">
                4년 합계 {!allTypesOn && <span>· 선택 유형</span>}
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {stat.hasData ? `${stat.total}건` : "—"}
              </div>
            </div>
            <div className="rounded bg-muted/50 p-1.5">
              <div className="text-[10px] text-muted-foreground">학생100명당/년</div>
              <div className="text-sm font-semibold tabular-nums">
                {stat.ratePer100 != null ? stat.ratePer100.toFixed(2) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* 년도별 막대 (선택 유형 합산) */}
        <div>
          <div className="text-muted-foreground mb-1 text-xs">
            공시년도별 사건 {!allTypesOn && <span>· 선택 유형</span>}
          </div>
          <div className="flex items-end gap-1.5 h-16">
            {yearsArr.map((y, idx) => {
              const t = yearTotals[idx];
              const h = t != null ? Math.max(2, (t / maxYearTotal) * 56) : 0;
              return (
                <div key={y} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] tabular-nums leading-none h-3">{t != null ? t : "—"}</div>
                  <div
                    className="w-full rounded-sm transition-all"
                    style={{
                      height: h,
                      background: t != null ? color : "#e5e7eb",
                      opacity: t != null ? 1 : 0.4,
                    }}
                  />
                  <div className="text-[10px] text-muted-foreground">{y}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 유형별 (최신년도) */}
        {(() => {
          const latest = yearsArr[yearsArr.length - 1];
          const latestV = school.violence[latest];
          if (!latestV) return null;
          return (
            <div>
              <div className="text-muted-foreground mb-1 text-xs">
                {latest}공시 유형별
              </div>
              <div className="flex flex-col gap-1">
                {data.typeLabels.map((label, i) => {
                  const cnt = latestV.types[i] ?? 0;
                  const w = (cnt / maxTypeTotal) * 100;
                  const isSelType = selectedTypes.has(i);
                  return (
                    <div
                      key={label}
                      className={cn(
                        "flex items-center gap-2 text-xs",
                        !isSelType && "opacity-40",
                      )}
                    >
                      <div className="w-14 text-muted-foreground">{label}</div>
                      <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                        <div
                          className="h-full rounded-sm"
                          style={{ width: `${w}%`, background: color, opacity: cnt > 0 ? 0.85 : 0.1 }}
                        />
                      </div>
                      <div className="w-6 text-right tabular-nums">{cnt}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="text-muted-foreground text-[10px]">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
