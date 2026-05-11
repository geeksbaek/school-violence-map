import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map as GMap, useMap } from "@vis.gl/react-google-maps";
import { Menu } from "lucide-react";
import type { DataSet, School, SchoolKind, SchoolGender } from "@/types";
import type { Metric } from "@/lib/severity";
import { computeStat, setToBits, type SchoolStat } from "@/lib/stats";
import { SchoolDeckLayer, type RegionPick } from "@/components/SchoolDeckLayer";
import { SchoolDetail } from "@/components/SchoolDetail";
import { RegionDetail } from "@/components/RegionDetail";
import { Sidebar, type FilterState } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { initAnalytics, trackSelection } from "@/lib/analytics";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string;

const BUILD_TS = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const DATA_URL = `${import.meta.env.BASE_URL}data.json?v=${BUILD_TS}`;

const DEFAULT_CENTER = { lat: 37.32, lng: 127.05 };
const ALL_KINDS: SchoolKind[] = ["초등", "중학", "고등"];
const ALL_GENDERS: SchoolGender[] = ["공학", "여"];

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station", stylers: [{ visibility: "off" }] },
];

export function App() {
  const [data, setData] = useState<DataSet | null>(null);
  const [adminGeo, setAdminGeo] = useState<any | null>(null);
  const [dongGeo, setDongGeo] = useState<any | null>(null);
  const [selected, setSelected] = useState<School | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionPick | null>(null);
  const [metric, setMetric] = useState<Metric>("rate");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState<FilterState>({
    kinds: new Set(ALL_KINDS),
    genders: new Set(ALL_GENDERS),
    query: "",
    types: new Set([0, 1, 2, 3, 4, 5, 6, 7]),
  });

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    fetch(DATA_URL, { cache: "no-cache" })
      .then((r) => r.json())
      .then((d: DataSet) => {
        for (const s of d.schools) {
          if (!s.gender || s.gender === "남") (s as any).gender = "공학";
        }
        setData(d);
      })
      .catch((e) => console.error("data load fail", e));

    fetch(`${import.meta.env.BASE_URL}admin.geojson`)
      .then((r) => r.json())
      .then(setAdminGeo)
      .catch(() => setAdminGeo(null));

    fetch(`${import.meta.env.BASE_URL}dong.geojson`)
      .then((r) => r.json())
      .then(setDongGeo)
      .catch(() => setDongGeo(null));
  }, []);

  // URL → state 1회 복원
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!data || restoredRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const schoolCode = params.get("school");
    if (schoolCode) {
      const s = data.schools.find((x) => x.code === schoolCode);
      if (s) {
        setSelected(s);
        restoredRef.current = true;
        return;
      }
    }
    const regionParam = params.get("region");
    if (regionParam) {
      const colon = regionParam.indexOf(":");
      if (colon > 0) {
        const type = regionParam.slice(0, colon) as RegionPick["type"];
        const key = regionParam.slice(colon + 1);
        if (type === "dong" && !dongGeo) return;
        let label = key;
        if (type === "district") label = key.split("|").join(" ");
        else if (type === "dong") {
          const f = dongGeo?.features?.find((x: any) => x.properties.code === key);
          if (f) label = `${f.properties.city ?? ""} ${f.properties.district ?? ""} ${f.properties.name ?? ""}`.trim();
        }
        setSelectedRegion({ type, key, label });
      }
      restoredRef.current = true;
    } else {
      restoredRef.current = true;
    }
  }, [data, dongGeo]);

  // state → URL 동기화
  useEffect(() => {
    if (!restoredRef.current) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("school");
    params.delete("region");
    if (selected) params.set("school", selected.code);
    else if (selectedRegion) params.set("region", `${selectedRegion.type}:${selectedRegion.key}`);
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? "?" + qs : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [selected, selectedRegion]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.query.trim();
    return data.schools.filter((s) => {
      if (!filter.kinds.has(s.kind)) return false;
      if (!filter.genders.has(s.gender)) return false;
      if (q && !s.name.includes(q)) return false;
      return true;
    });
  }, [data, filter]);

  // 방향키 네비게이션 — 선택된 학교 기준 가장 가까운 학교(같은 방향 90° wedge)로 이동
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      let dir: "left" | "right" | "up" | "down" | null = null;
      if (e.key === "ArrowLeft") dir = "left";
      else if (e.key === "ArrowRight") dir = "right";
      else if (e.key === "ArrowUp") dir = "up";
      else if (e.key === "ArrowDown") dir = "down";
      if (!dir) return;
      e.preventDefault();
      const next = nearestInDirection(selected!, filtered, dir);
      if (next) setSelected(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, filtered]);

  const stats = useMemo(() => {
    const m = new Map<string, SchoolStat>();
    if (!data) return m;
    const mask = setToBits(filter.types);
    for (const s of data.schools) m.set(s.code, computeStat(s, data.years, mask));
    return m;
  }, [data, filter.types]);

  if (!KEY) {
    return (
      <div className="h-screen flex items-center justify-center text-center text-sm">
        <Card className="p-6">
          <div className="font-semibold mb-1">Google Maps API 키 누락</div>
          <code className="text-xs">.env에 VITE_GOOGLE_MAPS_KEY 설정</code>
        </Card>
      </div>
    );
  }

  if (!data) return <LoadingScreen />;

  const sidebarNode = (
    <Sidebar
      data={data}
      filtered={filtered}
      stats={stats}
      filter={filter}
      setFilter={setFilter}
      selected={selected}
      onPick={(s) => {
        setSelected(s);
        setSidebarOpen(false);
        trackSelection("school", s.name, { school_kind: s.kind, city: s.city, source: "list" });
      }}
      metric={metric}
      setMetric={setMetric}
      onClose={() => setSidebarOpen(false)}
    />
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-[100dvh] w-screen overflow-hidden">
        {/* 데스크톱 사이드바 */}
        <div className="hidden md:block">{sidebarNode}</div>

        {/* 모바일 사이드바 — Sheet */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-full max-w-[360px] p-0 gap-0">
            <SheetHeader className="sr-only">
              <SheetTitle>학교폭력 지도</SheetTitle>
            </SheetHeader>
            {sidebarNode}
          </SheetContent>
        </Sheet>

        <main className="flex-1 relative">
          <APIProvider apiKey={KEY}>
            <GMap
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={11}
              gestureHandling="greedy"
              disableDefaultUI={false}
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={false}
              clickableIcons={false}
              styles={MAP_STYLES}
              className="absolute inset-0"
            >
              <SchoolDeckLayer
                schools={filtered}
                stats={stats}
                metric={metric}
                selectedCode={selected?.code ?? null}
                selectedRegion={selectedRegion}
                onPick={(s) => {
                  setSelected(s);
                  setSelectedRegion(null);
                  trackSelection("school", s.name, { school_kind: s.kind, city: s.city });
                }}
                onPickRegion={(r) => {
                  setSelectedRegion(r);
                  setSelected(null);
                  trackSelection("region", r.label, { region_type: r.type });
                }}
                adminGeo={adminGeo}
                dongGeo={dongGeo}
              />
              <FlyToSelected school={selected} />
            </GMap>
          </APIProvider>

          {/* 모바일 헤더 */}
          <div className="md:hidden absolute top-3 left-3 z-10 flex items-center gap-2">
            <Button
              variant="default"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="shadow-md"
            >
              <Menu className="size-5" />
            </Button>
            <div className="bg-white/90 backdrop-blur rounded-md px-2.5 py-1.5 text-xs shadow-md font-medium border">
              학교폭력 지도
            </div>
          </div>

          {/* 디테일 패널 */}
          {selected && (
            <div
              className={cn(
                "absolute z-10 overflow-y-auto",
                "left-2 right-2 bottom-2 max-h-[70dvh]",
                "md:left-auto md:bottom-auto md:right-3 md:top-3 md:w-[360px] md:max-h-[calc(100dvh-1.5rem)]",
              )}
            >
              <SchoolDetail
                school={selected}
                stat={stats.get(selected.code)!}
                data={data}
                metric={metric}
                selectedTypes={filter.types}
                onClose={() => setSelected(null)}
              />
            </div>
          )}

          {selectedRegion && !selected && (
            <div
              className={cn(
                "absolute z-10",
                "left-2 right-2 bottom-2 max-h-[70dvh]",
                "md:left-auto md:bottom-auto md:right-3 md:top-3 md:w-[380px] md:max-h-[calc(100dvh-1.5rem)]",
              )}
            >
              <RegionDetail
                region={selectedRegion}
                schools={filtered}
                stats={stats}
                metric={metric}
                selectedCode={null}
                onPickSchool={(s) => { setSelected(s); setSelectedRegion(null); }}
                onClose={() => setSelectedRegion(null)}
              />
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}

// 방향 wedge 안에서 가장 가까운 학교 선택. lat·lng 직접 비교(경도는 위도로 보정).
function nearestInDirection(from: School, all: School[], dir: "left" | "right" | "up" | "down"): School | null {
  const lngScale = Math.cos((from.lat * Math.PI) / 180);
  let best: School | null = null;
  let bestD2 = Infinity;
  for (const s of all) {
    if (s.code === from.code) continue;
    const dx = (s.lng - from.lng) * lngScale;
    const dy = s.lat - from.lat;
    let inWedge = false;
    if (dir === "right") inWedge = dx > 0 && Math.abs(dy) <= dx;
    else if (dir === "left") inWedge = dx < 0 && Math.abs(dy) <= -dx;
    else if (dir === "up") inWedge = dy > 0 && Math.abs(dx) <= dy;
    else if (dir === "down") inWedge = dy < 0 && Math.abs(dx) <= -dy;
    if (!inWedge) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = s; }
  }
  return best;
}

function FlyToSelected({ school }: { school: School | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !school) return;
    map.panTo({ lat: school.lat, lng: school.lng });
    if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
  }, [map, school]);
  return null;
}

function LoadingScreen() {
  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden">
      <aside className="hidden md:flex w-[340px] flex-col gap-4 border-r p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="flex flex-col gap-2 mt-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </aside>
      <main className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">데이터 로딩 중...</div>
      </main>
    </div>
  );
}
