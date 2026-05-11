import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X } from "lucide-react";
import type { DataSet, School, SchoolDetails } from "@/types";
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
  const yearTotals = yearsArr.map((y) => {
    const v = school.violence[y];
    if (!v) return null;
    let s = 0;
    for (const i of selectedTypes) s += v.types[i] ?? 0;
    return s;
  });
  const maxYearTotal = Math.max(1, ...yearTotals.map((t) => t ?? 0));
  const allTypesOn = selectedTypes.size === 8;

  const defaultYear = (() => {
    for (let i = yearsArr.length - 1; i >= 0; i--) {
      if (school.violence[yearsArr[i]]) return yearsArr[i];
    }
    return yearsArr[yearsArr.length - 1];
  })();
  const [selectedYear, setSelectedYear] = useState<string>(defaultYear);
  const selectedYearV = school.violence[selectedYear];
  const maxTypeTotal = Math.max(1, ...(selectedYearV?.types ?? [0]));

  return (
    <Card className="w-full gap-3 py-4">
      <CardHeader className="flex-row items-start justify-between gap-2 px-4">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-base min-w-0">
            <span
              className="size-3 rounded-full border border-white shadow-sm shrink-0"
              style={{ background: color }}
            />
            <span className="truncate">{school.name}</span>
            <Badge variant={KIND_VARIANT[school.kind]} className="shrink-0">
              {school.kind}
            </Badge>
          </CardTitle>
          <span className="text-muted-foreground text-xs truncate">
            {school.city} {school.district}
            {school.addr ? ` · ${school.addr}` : ""}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mt-1 -mr-1">
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4">
        {/* 요약 */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="학생수" value={school.studentTotal?.toLocaleString() ?? "—"} />
          <Stat label="학급수" value={school.classTotal?.toString() ?? "—"} />
          <Stat label="교원" value={school.teachers?.toString() ?? "—"} />
        </div>

        {/* 학폭 요약 */}
        <div
          className="rounded-md border p-2 text-xs"
          style={{ borderColor: color }}
        >
          <div className="flex items-center justify-between mb-1.5">
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

        {/* 년도별 막대 */}
        <div>
          <div className="text-muted-foreground mb-2 text-xs">
            공시년도별 사건 {!allTypesOn && <span>· 선택 유형</span>}
          </div>
          <div className="flex items-end gap-1.5 h-24 px-0.5">
            {yearsArr.map((y, idx) => {
              const t = yearTotals[idx];
              const h = t != null ? Math.max(2, (t / maxYearTotal) * 64) : 0;
              const isActive = y === selectedYear;
              const hasData = !!school.violence[y];
              return (
                <button
                  type="button"
                  key={y}
                  onClick={() => hasData && setSelectedYear(y)}
                  disabled={!hasData}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 transition-all rounded-sm p-0.5",
                    hasData ? "cursor-pointer hover:bg-accent/50" : "cursor-not-allowed",
                    isActive && hasData && "bg-accent ring-1 ring-foreground/20",
                  )}
                >
                  <div className="text-[10px] tabular-nums leading-none h-3">{t != null ? t : "—"}</div>
                  <div
                    className="w-full rounded-sm transition-all"
                    style={{
                      height: h,
                      background: t != null ? color : "#e5e7eb",
                      opacity: t != null ? (isActive ? 1 : 0.7) : 0.4,
                    }}
                  />
                  <div className={cn("text-[10px]", isActive ? "text-foreground font-semibold" : "text-muted-foreground")}>
                    {y}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 유형별 (선택된 년도) */}
        {selectedYearV && (
          <div>
            <div className="text-muted-foreground mb-1.5 text-xs">
              {selectedYear}공시 유형별
            </div>
            <div className="flex flex-col gap-1">
              {data.typeLabels.map((label, i) => {
                const cnt = selectedYearV.types[i] ?? 0;
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
        )}

        {/* 공시 정보 */}
        {school.details && (
          <>
            <Separator />
            <DetailsSections details={school.details} color={color} />
          </>
        )}
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

// ─── 공시 정보 ────────────────────────────────────────
const fmtNum = (n: number | null | undefined): string => (n == null ? "—" : n.toLocaleString());
const fmtAmt = (n: number | null | undefined): string =>
  n == null ? "—" : `${(n / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })}만원`;
const fmtPct = (n: number | null | undefined): string => (n == null ? "—" : `${n.toFixed(1)}%`);

function DetailsSections({ details, color }: { details: SchoolDetails; color: string }) {
  type Section = { key: string; title: string; body: React.ReactNode };
  const sections: Section[] = [];

  if (details.grades?.length) {
    sections.push({
      key: "grades",
      title: "학년별 학급/학생",
      body: (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 px-2">학년</TableHead>
              <TableHead className="h-7 px-2 text-right">학급</TableHead>
              <TableHead className="h-7 px-2 text-right">학생</TableHead>
              <TableHead className="h-7 px-2 text-right">학급당</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {details.grades.map((g) => (
              <TableRow key={g.label}>
                <TableCell className="py-1 px-2">{g.label}</TableCell>
                <TableCell className="py-1 px-2 text-right tabular-nums">{fmtNum(g.classes)}</TableCell>
                <TableCell className="py-1 px-2 text-right tabular-nums">{fmtNum(g.students)}</TableCell>
                <TableCell className="py-1 px-2 text-right tabular-nums">{fmtNum(g.perClass)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ),
    });
  }

  if (details.studentTrend?.length) {
    const max = Math.max(1, ...details.studentTrend.map((t) => t.total));
    sections.push({
      key: "trend",
      title: "전년도 학생수 추이",
      body: (
        <div className="flex items-end gap-1.5 h-24 px-0.5">
          {details.studentTrend.map((t) => {
            const h = Math.max(2, (t.total / max) * 60);
            return (
              <div key={t.year} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] tabular-nums leading-none h-3">{t.total}</div>
                <div className="w-full rounded-sm" style={{ height: h, background: color, opacity: 0.7 }} />
                <div className="text-[10px] text-muted-foreground leading-none">{t.year}</div>
              </div>
            );
          })}
        </div>
      ),
    });
  }

  if (details.teaching) {
    const t = details.teaching;
    sections.push({
      key: "teaching",
      title: "수업·교사",
      body: <KV pairs={[
        ["총 교사", suffix(t.teachers, "명")],
        ["주당 수업", suffix(t.weeklyHours, "시간")],
        ["주 수업일", suffix(t.daysPerWeek, "일")],
      ]} />,
    });
  }

  if (details.facility) {
    const f = details.facility;
    sections.push({
      key: "facility",
      title: "시설",
      body: <KV pairs={trim([
        ["일반교실", suffix(f.regularClassrooms, "실")],
        ["특별교실", suffix(f.specialClassrooms, "실")],
        ["체육교실", suffix(f.sportsClassrooms, "실")],
        ["남자 화장실", suffix(f.maleToilets, "개")],
        ["여자 화장실", suffix(f.femaleToilets, "개")],
        ["샤워실", suffix(f.showers, "실")],
        ["강당", suffix(f.auditorium, "실")],
        ["수영장", f.pool ?? "—"],
        ["기숙사 수용", suffix(f.boardingCapacity, "명")],
      ])} />,
    });
  }

  if (details.meal) {
    const m = details.meal;
    sections.push({
      key: "meal",
      title: "급식",
      body: <KV pairs={trim([
        ["급식 학생수", suffix(m.students, "명")],
        ["영양사", suffix(m.nutritionists, "명")],
        ["조리원", suffix(m.cooks, "명")],
        ["조리보조", suffix(m.cookAssistants, "명")],
        ["운영방식", m.operationMethod ?? "—"],
      ])} />,
    });
  }

  if (details.digital) {
    const d = details.digital;
    sections.push({
      key: "digital",
      title: "정보화 활용",
      body: <KV pairs={[
        ["전체 활용 학생", suffix(d.allUtilStudents, "명")],
        ["주간 평균", suffix(d.weeklyAvgUtilStudents, "명")],
      ]} />,
    });
  }

  if (details.safetyEducation) {
    const cats = Object.entries(details.safetyEducation);
    const maxTotal = Math.max(1, ...cats.map(([, v]) => v.total ?? 0));
    sections.push({
      key: "safety",
      title: "안전교육",
      body: (
        <div className="flex flex-col gap-1">
          {cats.map(([cat, v]) => {
            const w = ((v.total ?? 0) / maxTotal) * 100;
            return (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <div className="w-20 text-muted-foreground truncate">{cat}</div>
                <div className="flex-1 bg-muted h-3 rounded-sm overflow-hidden">
                  <div className="h-full" style={{ width: `${w}%`, background: color, opacity: 0.7 }} />
                </div>
                <div className="w-12 text-right tabular-nums">{fmtNum(v.total)}h</div>
              </div>
            );
          })}
        </div>
      ),
    });
  }

  if (details.activities) {
    const a = details.activities;
    sections.push({
      key: "activities",
      title: "창체·동아리",
      body: <KV pairs={trim([
        ["창체 학생수", suffix(a.creativeStudents, "명")],
        ["창체 담당교사", suffix(a.creativeTeachers, "명")],
        ["외부강사", suffix(a.creativeExternalLecturers, "명")],
        ["창체 예산", fmtAmt(a.creativeBudget)],
        ["동아리 수", suffix(a.clubs, "개")],
        ["동아리 예산", fmtAmt(a.clubBudget)],
      ])} />,
    });
  }

  if (details.afterSchool) {
    const a = details.afterSchool;
    sections.push({
      key: "after",
      title: "방과후·돌봄",
      body: <KV pairs={trim([
        ["방과후 프로그램", suffix(a.programs, "개")],
        ["방과후 학생", suffix(a.students, "명")],
        ["수익자 부담금", fmtAmt(a.burdenAmount)],
        ["돌봄 교실", suffix(a.careRooms, "실")],
        ["돌봄 학생", suffix(a.careStudents, "명")],
      ])} />,
    });
  }

  if (details.scholarship) {
    const s = details.scholarship;
    sections.push({
      key: "scholarship",
      title: "장학금",
      body: <KV pairs={[
        ["금전 (건/금액)", `${fmtNum(s.money?.count)} / ${fmtAmt(s.money?.amount)}`],
        ["보험·금융 (건/금액)", `${fmtNum(s.fortune?.count)} / ${fmtAmt(s.fortune?.amount)}`],
        ["물품 (건/금액)", `${fmtNum(s.things?.count)} / ${fmtAmt(s.things?.amount)}`],
        ["합계 (건/금액)", `${fmtNum(s.total?.count)} / ${fmtAmt(s.total?.amount)}`],
      ]} />,
    });
  }

  if (details.graduation) {
    const g = details.graduation;
    sections.push({
      key: "graduation",
      title: "졸업·진학",
      body: <KV pairs={trim([
        ["전체 졸업생", suffix(g.totalGrads, "명")],
        ["진학자", suffix(g.advanceCount, "명")],
        ["취업자", suffix(g.employmentCount, "명")],
        ["진학률", fmtPct(g.advanceRate)],
        ["취업률", fmtPct(g.employmentRate)],
        ["외국인 비율", fmtPct(g.foreignRate)],
      ])} />,
    });
  }

  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-muted-foreground text-xs">공시 정보</div>
      <Accordion type="multiple" className="w-full">
        {sections.map((s) => (
          <AccordionItem key={s.key} value={s.key} className="last:border-b">
            <AccordionTrigger className="py-2 text-xs font-medium hover:no-underline">
              {s.title}
            </AccordionTrigger>
            <AccordionContent className="pb-3">{s.body}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function suffix(n: number | null | undefined, unit: string): string {
  return n == null ? "—" : `${fmtNum(n)}${unit}`;
}
function trim(pairs: [string, string][]): [string, string][] {
  return pairs.filter(([, v]) => v !== "—");
}

function KV({ pairs }: { pairs: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {pairs.map(([k, v]) => (
        <div key={k} className="contents">
          <div className="text-muted-foreground">{k}</div>
          <div className="text-right tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}
