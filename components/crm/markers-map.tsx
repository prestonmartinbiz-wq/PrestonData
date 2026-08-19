"use client";

import {
  APIProvider,
  ControlPosition,
  InfoWindow,
  MapControl,
  Map as GoogleMap,
  Marker,
  useMap,
} from "@vis.gl/react-google-maps";
import { ExternalLink, MapPin, Minus, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FarmSetupDialog,
  type FarmDraftMeta,
} from "@/components/crm/farm-setup-dialog";
import type { Farm, FarmBoundary, TeamMember } from "@/lib/types";
import { cn, clarkAssessorUrl, clarkGismoUrl, normalizeApn } from "@/lib/utils";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  kind: "parcel" | "substation";
  title: string;
  subtitle?: string;
  href?: string;
  needsContact?: boolean;
  worked?: boolean;
};

const COLORS = {
  needsContact: "#f59e0b", // amber
  worked: "#10b981", // emerald
  parcel: "#0ea5e9", // sky
  substation: "#6d28d9", // violet
} as const;

function parcelColor(m: MapMarker): string {
  if (m.needsContact) return COLORS.needsContact;
  if (m.worked) return COLORS.worked;
  return COLORS.parcel;
}

function circleIcon(color: string, r: number): string {
  const size = r * 2 + 6;
  const c = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="2"/></svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function squareIcon(color: string, s: number): string {
  const size = s + 6;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="3" y="3" width="${s}" height="${s}" rx="3" fill="${color}" stroke="#ffffff" stroke-width="2"/></svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

/**
 * Nudge markers that share (nearly) identical coordinates onto a small ring so
 * stacked parcels (e.g. street-level geocodes) don't collapse into one pin.
 */
function destack(markers: MapMarker[]): MapMarker[] {
  const groups = new Map<string, MapMarker[]>();
  for (const m of markers) {
    const key = `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`;
    const arr = groups.get(key);
    if (arr) arr.push(m);
    else groups.set(key, [m]);
  }
  const out: MapMarker[] = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      out.push(arr[0]);
      continue;
    }
    const radius = 0.00018; // ~20m
    const latRad = (arr[0].lat * Math.PI) / 180;
    arr.forEach((m, i) => {
      const angle = (2 * Math.PI * i) / arr.length;
      out.push({
        ...m,
        lat: m.lat + radius * Math.sin(angle),
        lng: m.lng + (radius * Math.cos(angle)) / Math.max(0.2, Math.cos(latRad)),
      });
    });
  }
  return out;
}

type SelectedParcel = {
  apn: string;
  lat: number;
  lng: number;
  acres: number | null;
  tracked: boolean;
};

/**
 * Renders Clark County parcel boundaries for the current viewport (zoom ≥ 16)
 * as a clickable Google Maps Data layer. Tracked parcels (we already have a
 * lead/site) are shaded green. Clicking a parcel selects it (APN + centroid).
 */
function ParcelsLayer({
  enabled,
  interactive = true,
  trackedSet,
  onSelect,
}: {
  enabled: boolean;
  /** When false, lines render but clicks pass through to the map (for drawing). */
  interactive?: boolean;
  trackedSet: Set<string>;
  onSelect: (p: SelectedParcel) => void;
}) {
  const map = useMap();
  const dataRef = useRef<google.maps.Data | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return;
    const data = new google.maps.Data();
    dataRef.current = data;
    data.setMap(map);
    return () => {
      data.setMap(null);
      dataRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const data = dataRef.current;
    if (!data) return;
    data.setStyle((feature) => {
      const apn = String(feature.getProperty("APN") || "");
      const tracked = trackedSet.has(normalizeApn(apn));
      return {
        strokeColor: tracked ? "#059669" : "#1e293b",
        strokeWeight: tracked ? 2 : 0.8,
        strokeOpacity: 0.9,
        fillColor: "#10b981",
        fillOpacity: tracked ? 0.2 : 0.04,
        clickable: interactive,
      };
    });
  }, [trackedSet, interactive]);

  useEffect(() => {
    if (!map || !interactive) return;
    const data = dataRef.current;
    if (!data) return;
    const click = data.addListener("click", (e: google.maps.Data.MouseEvent) => {
      const apn = String(e.feature.getProperty("APN") || "").trim();
      const acresRaw = e.feature.getProperty("CALC_ACRES");
      const ll = e.latLng;
      onSelectRef.current({
        apn,
        lat: ll ? ll.lat() : 0,
        lng: ll ? ll.lng() : 0,
        acres: typeof acresRaw === "number" ? acresRaw : null,
        tracked: trackedSet.has(normalizeApn(apn)),
      });
    });
    return () => google.maps.event.removeListener(click);
  }, [map, trackedSet, interactive]);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    const clear = () => {
      const d = dataRef.current;
      if (d) d.forEach((f) => d.remove(f));
    };
    const load = async () => {
      const data = dataRef.current;
      if (!data) return;
      if (!enabled) return clear();
      if ((map.getZoom() ?? 0) < 16) return clear();
      const b = map.getBounds();
      if (!b) return;
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      const bbox = `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`;
      try {
        const res = await fetch(`/api/parcels?bbox=${encodeURIComponent(bbox)}`);
        if (!res.ok || cancelled) return;
        const gj = await res.json();
        const d = dataRef.current;
        if (!d || cancelled) return;
        d.forEach((f) => d.remove(f));
        if (gj && Array.isArray(gj.features)) d.addGeoJson(gj);
      } catch {
        /* transient county-service error — ignore */
      }
    };
    const idle = map.addListener("idle", load);
    load();
    return () => {
      cancelled = true;
      google.maps.event.removeListener(idle);
      clear();
    };
  }, [map, enabled]);

  return null;
}

function FarmsLayer({
  farms,
  enabled,
  highlightFarmId,
  onSelect,
}: {
  farms: Farm[];
  enabled: boolean;
  highlightFarmId?: string;
  onSelect: (farm: Farm) => void;
}) {
  const map = useMap();
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return;
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    if (!enabled || !farms.length) return;

    for (const farm of farms) {
      const ring = farm.boundary.coordinates[0]?.map(([lng, lat]) => ({ lat, lng }));
      if (!ring?.length) continue;
      const highlighted = farm.id === highlightFarmId;
      const poly = new google.maps.Polygon({
        paths: ring,
        fillColor: farm.color,
        fillOpacity: highlighted ? 0.25 : 0.12,
        strokeColor: farm.color,
        strokeWeight: highlighted ? 3 : 2,
        map,
        zIndex: highlighted ? 2 : 1,
      });
      poly.addListener("click", () => onSelectRef.current(farm));
      polygonsRef.current.push(poly);
    }

    return () => {
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
    };
  }, [map, farms, enabled, highlightFarmId]);

  return null;
}

function FarmDrawingTool({
  active,
  onComplete,
  onFinishReady,
  onVertexCountChange,
}: {
  active: boolean;
  onComplete: (boundary: FarmBoundary) => void;
  onFinishReady?: (finish: () => void) => void;
  onVertexCountChange?: (count: number) => void;
}) {
  const map = useMap();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onVertexCountChangeRef = useRef(onVertexCountChange);
  onVertexCountChangeRef.current = onVertexCountChange;
  const verticesRef = useRef<{ lat: number; lng: number }[]>([]);
  const previewRef = useRef<google.maps.Polygon | null>(null);

  useEffect(() => {
    if (!map || !active) {
      onFinishReady?.(() => undefined);
      onVertexCountChangeRef.current?.(0);
      return;
    }

    verticesRef.current = [];
    onVertexCountChangeRef.current?.(0);

    function cleanupPreview() {
      if (previewRef.current) {
        previewRef.current.setMap(null);
        previewRef.current = null;
      }
      verticesRef.current = [];
      onVertexCountChangeRef.current?.(0);
    }

    function finishPolygon() {
      const verts = verticesRef.current;
      if (verts.length < 3) {
        toast.error("Place at least 3 points before finishing");
        return;
      }
      const ring: [number, number][] = verts.map((v) => [v.lng, v.lat]);
      ring.push([ring[0][0], ring[0][1]]);
      cleanupPreview();
      onCompleteRef.current({ type: "Polygon", coordinates: [ring] });
    }

    onFinishReady?.(finishPolygon);

    function updatePreview() {
      const verts = verticesRef.current;
      if (previewRef.current) previewRef.current.setMap(null);
      if (verts.length >= 2) {
        previewRef.current = new google.maps.Polygon({
          paths: verts,
          fillColor: "#e11d48",
          fillOpacity: 0.15,
          strokeColor: "#e11d48",
          strokeWeight: 2,
          map,
        });
      }
    }

    const clickListener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      const latLng = e.latLng;
      if (!latLng) return;
      const verts = verticesRef.current;

      if (verts.length >= 3) {
        const first = verts[0];
        const dLat = latLng.lat() - first.lat;
        const dLng = latLng.lng() - first.lng;
        if (Math.hypot(dLat, dLng) < 0.00012) {
          finishPolygon();
          return;
        }
      }

      verts.push({ lat: latLng.lat(), lng: latLng.lng() });
      onVertexCountChangeRef.current?.(verts.length);
      updatePreview();
    });

    const dblClickListener = map.addListener("dblclick", (e: google.maps.MapMouseEvent) => {
      e.stop();
      finishPolygon();
    });

    return () => {
      google.maps.event.removeListener(clickListener);
      google.maps.event.removeListener(dblClickListener);
      cleanupPreview();
      onFinishReady?.(() => undefined);
    };
  }, [map, active, onFinishReady]);

  return null;
}

function MapZoomControls() {
  const map = useMap();

  function zoomBy(delta: number) {
    if (!map) return;
    const z = map.getZoom();
    if (z == null) return;
    map.setZoom(z + delta);
  }

  return (
    <MapControl position={ControlPosition.RIGHT_BOTTOM}>
      <div className="mb-3 mr-2 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(1)}
          className="flex h-9 w-9 items-center justify-center text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="border-t border-slate-100" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(-1)}
          className="flex h-9 w-9 items-center justify-center text-slate-700 hover:bg-slate-50"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </MapControl>
  );
}

/** Parcel lines only load at zoom ≥ 16 — nudge zoom when drawing a farm. */
function AutoZoomForParcelLines({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !active) return;
    const z = map.getZoom() ?? 0;
    if (z < 16) map.setZoom(16);
  }, [map, active]);
  return null;
}

/** Shows the in-progress or completed draft polygon before save. */
function DraftFarmPolygon({ boundary }: { boundary: FarmBoundary | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !boundary) return;
    const ring = boundary.coordinates[0]?.map(([lng, lat]) => ({ lat, lng }));
    if (!ring?.length) return;
    const poly = new google.maps.Polygon({
      paths: ring,
      fillColor: "#e11d48",
      fillOpacity: 0.22,
      strokeColor: "#e11d48",
      strokeWeight: 3,
      map,
      zIndex: 50,
    });
    return () => poly.setMap(null);
  }, [map, boundary]);

  return null;
}

function AddToFarmPicker({
  apn,
  farms: initialFarms,
  onAdded,
}: {
  apn: string;
  farms: Farm[];
  onAdded?: () => void;
}) {
  const [farms, setFarms] = useState(initialFarms);
  const [farmId, setFarmId] = useState(initialFarms[0]?.id || "");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setFarms(initialFarms);
    if (initialFarms.length) setFarmId(initialFarms[0].id);
  }, [initialFarms]);

  useEffect(() => {
    if (!apn) return;
    fetch("/api/farms")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.items)) {
          setFarms(data.items);
          if (data.items.length) setFarmId(data.items[0].id);
        }
      })
      .catch(() => undefined);
  }, [apn]);

  async function add() {
    if (!farmId || !apn) return;
    setAdding(true);
    try {
      const res = await fetch(
        `/api/farms/${encodeURIComponent(farmId)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apn }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Added to farm");
      onAdded?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2">
      <span className="text-[11px] font-semibold text-slate-700">Add to farm</span>
      {farms.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          No farms yet — tap the pen on the map to create one.
        </p>
      ) : (
        <>
          <select
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
            value={farmId}
            onChange={(e) => setFarmId(e.target.value)}
          >
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.assignedTo})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={adding}
            className="inline-flex w-full items-center justify-center rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {adding ? "Adding…" : "Add to farm"}
          </button>
        </>
      )}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  color,
  children,
  count,
}: {
  on: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition",
        on
          ? "border-slate-300 bg-white text-slate-900 shadow-sm"
          : "border-transparent bg-slate-100 text-slate-400"
      )}
    >
      {color ? (
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: on ? color : "#cbd5e1" }}
        />
      ) : null}
      {children}
      {typeof count === "number" ? (
        <span className="text-slate-400">{count}</span>
      ) : null}
    </button>
  );
}

export function MarkersMap({
  parcels,
  substations,
  center,
  height = 640,
  trackedApns = [],
  substationNames = [],
  farms = [],
  teamMembers = [],
  showFarmLayer: showFarmLayerDefault = false,
  readOnlyMap = false,
  highlightFarmId,
}: {
  parcels: MapMarker[];
  substations: MapMarker[];
  center: { lat: number; lng: number };
  height?: number;
  trackedApns?: string[];
  substationNames?: string[];
  farms?: Farm[];
  teamMembers?: TeamMember[];
  /** When true, farm boundaries are visible by default */
  showFarmLayer?: boolean;
  /** Hide drawing controls (farm detail preview) */
  readOnlyMap?: boolean;
  highlightFarmId?: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const [showParcels, setShowParcels] = useState(true);
  const [showSubs, setShowSubs] = useState(true);
  const [onlyNoContact, setOnlyNoContact] = useState(false);
  const [showParcelLines, setShowParcelLines] = useState(false);
  const [showFarms, setShowFarms] = useState(showFarmLayerDefault || readOnlyMap);
  const [farmWizardStep, setFarmWizardStep] = useState<"idle" | "drawing" | "review">(
    "idle"
  );
  const [farmSetupOpen, setFarmSetupOpen] = useState(false);
  const [farmDraftMeta, setFarmDraftMeta] = useState<FarmDraftMeta | null>(null);
  const [pendingBoundary, setPendingBoundary] = useState<FarmBoundary | null>(null);
  const [savingFarm, setSavingFarm] = useState(false);
  const [drawVertexCount, setDrawVertexCount] = useState(0);
  const finishDrawingRef = useRef<() => void>(() => undefined);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [localFarms, setLocalFarms] = useState<Farm[]>(farms);
  const [selected, setSelected] = useState<MapMarker | null>(null);

  // Parcel selection (from the Clark County boundaries layer)
  const [parcel, setParcel] = useState<SelectedParcel | null>(null);
  const [llc, setLlc] = useState("");
  const [expSub, setExpSub] = useState("");
  const [savingSite, setSavingSite] = useState(false);

  const trackedSet = useMemo(
    () => new Set(trackedApns.map((a) => normalizeApn(a))),
    [trackedApns]
  );
  const onSelectParcel = useCallback((p: SelectedParcel) => {
    setSelected(null);
    setSelectedFarm(null);
    setParcel(p);
    setLlc("");
    setExpSub("");
  }, []);

  const onFarmBoundaryComplete = useCallback((boundary: FarmBoundary) => {
    setPendingBoundary(boundary);
    setFarmWizardStep("review");
  }, []);

  const cancelFarmWizard = useCallback(() => {
    setFarmWizardStep("idle");
    setFarmDraftMeta(null);
    setPendingBoundary(null);
    setFarmSetupOpen(false);
  }, []);

  const discardFarmDrawing = useCallback(() => {
    setPendingBoundary(null);
    setFarmWizardStep("drawing");
  }, []);

  const refreshLocalFarms = useCallback(() => {
    fetch("/api/farms")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.items)) setLocalFarms(data.items);
      })
      .catch(() => undefined);
  }, []);

  async function saveFarm() {
    if (!farmDraftMeta || !pendingBoundary) return;
    setSavingFarm(true);
    try {
      const res = await fetch("/api/farms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: farmDraftMeta.name,
          assignedTo: farmDraftMeta.assignedTo,
          substationOfInterest: farmDraftMeta.substationOfInterest,
          boundary: pendingBoundary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save farm");
      toast.success(
        `Farm saved with ${data.farm?.members?.length ?? 0} parcel(s)`,
        data.farm?.id
          ? {
              action: {
                label: "View farm",
                onClick: () => {
                  window.location.href = `/farms/${encodeURIComponent(data.farm.id)}`;
                },
              },
            }
          : undefined
      );
      cancelFarmWizard();
      refreshLocalFarms();
      setShowFarms(true);
      setShowParcelLines(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save farm");
    } finally {
      setSavingFarm(false);
    }
  }

  function startFarmDrawing(meta: FarmDraftMeta) {
    setFarmDraftMeta(meta);
    setFarmWizardStep("drawing");
    setShowFarms(true);
    setShowParcelLines(true);
    setPendingBoundary(null);
    setDrawVertexCount(0);
  }

  const onSelectFarm = useCallback((farm: Farm) => {
    setSelected(null);
    setParcel(null);
    setSelectedFarm(farm);
  }, []);

  useEffect(() => {
    setLocalFarms(farms);
  }, [farms]);

  async function addSite(input: {
    apn: string;
    lat: number;
    lng: number;
    address?: string;
    expectedSubstation?: string;
    ownerLlc?: string;
  }): Promise<boolean> {
    if (!input.apn) {
      toast.error("No APN for this parcel");
      return false;
    }
    setSavingSite(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "site",
          apn: input.apn,
          name: input.address?.trim() || `APN ${input.apn}`,
          address: input.address?.trim() || "",
          latitude: String(input.lat),
          longitude: String(input.lng),
          expectedSubstation: (input.expectedSubstation || "").trim(),
          notes: (input.ownerLlc || "").trim() ? `Owner/LLC: ${input.ownerLlc!.trim()}` : "",
          justification: "Added from map",
          priority: "Medium",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Added to Sites of Interest");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      return false;
    } finally {
      setSavingSite(false);
    }
  }

  async function addSiteFromParcel() {
    if (!parcel) return;
    const ok = await addSite({
      apn: parcel.apn,
      lat: parcel.lat,
      lng: parcel.lng,
      expectedSubstation: expSub,
      ownerLlc: llc,
    });
    if (ok) setParcel(null);
  }

  async function addSiteFromMarker(m: MapMarker) {
    // Marker subtitle is "address · substation" — use its parts as hints.
    const parts = (m.subtitle || "").split(" · ");
    const ok = await addSite({
      apn: m.id,
      lat: m.lat,
      lng: m.lng,
      address: parts[0] || "",
      expectedSubstation: parts.length > 1 ? parts[parts.length - 1] : "",
    });
    if (ok) setSelected(null);
  }

  const visible = useMemo(() => {
    const list: MapMarker[] = [];
    if (showParcels) {
      for (const m of parcels) {
        if (onlyNoContact && !m.needsContact) continue;
        list.push(m);
      }
    }
    if (showSubs) list.push(...substations);
    return destack(list);
  }, [parcels, substations, showParcels, showSubs, onlyNoContact]);

  const bounds = useMemo(() => {
    const pts = [...parcels, ...substations];
    if (!pts.length) return null;
    let north = -90;
    let south = 90;
    let east = -180;
    let west = 180;
    for (const p of pts) {
      north = Math.max(north, p.lat);
      south = Math.min(south, p.lat);
      east = Math.max(east, p.lng);
      west = Math.min(west, p.lng);
    }
    return { north, south, east, west };
  }, [parcels, substations]);

  const noContactCount = parcels.filter((p) => p.needsContact).length;

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
        <MapPin className="h-6 w-6 text-slate-400" />
        <p className="font-medium text-slate-700">Map key not configured</p>
        <p>
          Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable the
          interactive marker map.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          on={showParcels}
          onClick={() => setShowParcels((v) => !v)}
          color={COLORS.parcel}
          count={parcels.length}
        >
          Parcels
        </Toggle>
        <Toggle
          on={showSubs}
          onClick={() => setShowSubs((v) => !v)}
          color={COLORS.substation}
          count={substations.length}
        >
          Substations
        </Toggle>
        <Toggle
          on={onlyNoContact}
          onClick={() => setOnlyNoContact((v) => !v)}
          color={COLORS.needsContact}
          count={noContactCount}
        >
          Needs contact only
        </Toggle>
        <Toggle
          on={showParcelLines}
          onClick={() => setShowParcelLines((v) => !v)}
          color={COLORS.worked}
        >
          Parcel lines
        </Toggle>
        {!readOnlyMap ? (
          <Toggle
            on={showFarms}
            onClick={() => setShowFarms((v) => !v)}
            color="#e11d48"
            count={localFarms.length}
          >
            Farms
          </Toggle>
        ) : null}
        {farmWizardStep === "drawing" ? (
          <span className="text-xs text-rose-600">
            Drawing <strong>{farmDraftMeta?.name}</strong> — click lot corners on
            the map, then <strong>Finish shape</strong> below
          </span>
        ) : farmWizardStep === "review" ? (
          <span className="text-xs text-emerald-700 font-medium">
            Shape complete — click <strong>Save farm</strong> below
          </span>
        ) : showParcelLines ? (
          <span className="text-xs text-slate-400">
            Zoom in, then click a parcel to add it to a farm or interest list.
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS.worked }}
            />
            Worked
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS.needsContact }}
            />
            Needs contact
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS.parcel }}
            />
            Has contact
          </span>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-xl border border-slate-200"
        style={{ height }}
      >
        <div className="absolute inset-0">
          <APIProvider apiKey={apiKey}>
            <GoogleMap
              defaultCenter={center}
              defaultZoom={11}
              defaultBounds={bounds ?? undefined}
              gestureHandling="greedy"
              disableDefaultUI={false}
              mapTypeControl
              streetViewControl={false}
              zoomControl={false}
              style={{ width: "100%", height: "100%" }}
            >
              <ParcelsLayer
                enabled={showParcelLines}
                interactive={farmWizardStep === "idle"}
                trackedSet={trackedSet}
                onSelect={onSelectParcel}
              />
              <FarmsLayer
                farms={localFarms}
                enabled={showFarms || readOnlyMap}
                highlightFarmId={highlightFarmId}
                onSelect={onSelectFarm}
              />
              <DraftFarmPolygon
                boundary={
                  farmWizardStep === "review" ? pendingBoundary : null
                }
              />
              {!readOnlyMap ? (
                <FarmDrawingTool
                  active={farmWizardStep === "drawing"}
                  onComplete={onFarmBoundaryComplete}
                  onFinishReady={(finish) => {
                    finishDrawingRef.current = finish;
                  }}
                  onVertexCountChange={setDrawVertexCount}
                />
              ) : null}
              <MapZoomControls />
              <AutoZoomForParcelLines
                active={
                  showParcelLines &&
                  (farmWizardStep === "drawing" || farmWizardStep === "review")
                }
              />
            {visible.map((m) => (
              <Marker
                key={`${m.kind}-${m.id}`}
                position={{ lat: m.lat, lng: m.lng }}
                title={m.title}
                onClick={() => setSelected(m)}
                zIndex={m.kind === "substation" ? 1000 : 1}
                icon={{
                  url:
                    m.kind === "substation"
                      ? squareIcon(COLORS.substation, 15)
                      : circleIcon(parcelColor(m), 6),
                }}
              />
            ))}

            {selected ? (
              <InfoWindow
                position={{ lat: selected.lat, lng: selected.lng }}
                onCloseClick={() => setSelected(null)}
                pixelOffset={[0, -8]}
              >
                <div className="max-w-[240px] space-y-1 p-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          selected.kind === "substation"
                            ? COLORS.substation
                            : parcelColor(selected),
                      }}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {selected.kind === "substation" ? "Substation" : "Parcel"}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {selected.title}
                  </p>
                  {selected.subtitle ? (
                    <p className="text-xs text-slate-600">{selected.subtitle}</p>
                  ) : null}
                  {selected.href ? (
                    <a
                      href={selected.href}
                      className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                    >
                      Open{" "}
                      {selected.kind === "substation" ? "substation" : "lead"}{" "}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                  {selected.kind === "parcel" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => addSiteFromMarker(selected)}
                        disabled={savingSite}
                        className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded bg-slate-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {savingSite ? "Adding…" : "Add to interest list"}
                      </button>
                      <AddToFarmPicker apn={selected.id} farms={localFarms} />
                    </>
                  ) : null}
                </div>
              </InfoWindow>
            ) : null}

            {parcel ? (
              <InfoWindow
                position={{ lat: parcel.lat, lng: parcel.lng }}
                onCloseClick={() => setParcel(null)}
                pixelOffset={[0, -4]}
              >
                <div className="w-[260px] space-y-2 p-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: COLORS.worked }}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Parcel
                    </span>
                    {parcel.tracked ? (
                      <span className="rounded bg-emerald-50 px-1 text-[10px] font-medium text-emerald-700">
                        In our system
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    APN {parcel.apn}
                    {parcel.acres ? (
                      <span className="font-normal text-slate-500">
                        {" "}
                        · {parcel.acres} ac
                      </span>
                    ) : null}
                  </p>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {parcel.tracked ? (
                      <a
                        href={`/lead/${encodeURIComponent(parcel.apn)}`}
                        className="font-medium text-sky-700 hover:underline"
                      >
                        Open our record
                      </a>
                    ) : null}
                    <a
                      href={clarkGismoUrl(parcel.apn) || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-slate-600 hover:underline"
                    >
                      GISMO (owner + deeds) <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={clarkAssessorUrl(parcel.apn) || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-slate-600 hover:underline"
                    >
                      Assessor <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href="https://recorderecomm.clarkcountynv.gov/AcclaimWeb/Search/SearchTypeParcel"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-slate-600 hover:underline"
                    >
                      Recorder deeds <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="space-y-1.5 border-t border-slate-100 pt-2">
                    {parcel.tracked ? (
                      <p className="text-[11px] text-slate-500">
                        Already in our system — you can still add it to the interest list.
                      </p>
                    ) : null}
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      placeholder="Owner / LLC (optional)"
                      value={llc}
                      onChange={(e) => setLlc(e.target.value)}
                    />
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      placeholder="Expected substation (optional)"
                      list="map-sub-names"
                      value={expSub}
                      onChange={(e) => setExpSub(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={addSiteFromParcel}
                      disabled={savingSite}
                      className="inline-flex w-full items-center justify-center gap-1 rounded bg-slate-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {savingSite ? "Adding…" : "Add to interest list"}
                    </button>
                    <AddToFarmPicker
                      apn={parcel.apn}
                      farms={localFarms}
                    />
                  </div>
                </div>
              </InfoWindow>
            ) : null}

            {selectedFarm ? (
              <InfoWindow
                position={{
                  lat: selectedFarm.boundary.coordinates[0][0][1],
                  lng: selectedFarm.boundary.coordinates[0][0][0],
                }}
                onCloseClick={() => setSelectedFarm(null)}
                pixelOffset={[0, -4]}
              >
                <div className="max-w-[240px] space-y-1 p-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: selectedFarm.color }}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Farm
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedFarm.name}
                  </p>
                  <p className="text-xs text-slate-600">
                    {selectedFarm.assignedTo} · {selectedFarm.members.length} parcel
                    {selectedFarm.members.length === 1 ? "" : "s"}
                  </p>
                  {selectedFarm.substationOfInterest ? (
                    <p className="text-xs text-slate-500">
                      {selectedFarm.substationOfInterest}
                    </p>
                  ) : null}
                  <a
                    href={`/farms/${encodeURIComponent(selectedFarm.id)}`}
                    className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                  >
                    Open farm <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </InfoWindow>
            ) : null}
          </GoogleMap>
        </APIProvider>
        </div>

        {!readOnlyMap ? (
          <div className="pointer-events-none absolute inset-0 z-30">
            <button
              type="button"
              onClick={() => {
                if (farmWizardStep === "idle") setFarmSetupOpen(true);
              }}
              disabled={farmWizardStep !== "idle"}
              className={cn(
                "pointer-events-auto absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-lg border shadow-md transition",
                farmWizardStep !== "idle"
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              )}
              title="Draw a new farm territory"
            >
              <Pencil className="h-5 w-5" />
            </button>

            {farmWizardStep === "drawing" && farmDraftMeta ? (
              <div
                className="pointer-events-auto absolute bottom-3 left-3 right-14 rounded-lg border border-rose-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {farmDraftMeta.name}
                </p>
                <p className="text-xs text-slate-500">
                  {drawVertexCount} point{drawVertexCount === 1 ? "" : "s"} placed
                  · parcel lines stay on while you draw
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => finishDrawingRef.current()}
                    disabled={drawVertexCount < 3}
                    className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    Finish shape
                  </button>
                  <button
                    type="button"
                    onClick={cancelFarmWizard}
                    className="rounded-md px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {farmWizardStep === "review" && farmDraftMeta && pendingBoundary ? (
              <div
                className="pointer-events-auto absolute bottom-3 left-3 right-14 rounded-lg border border-emerald-200 bg-white p-3 shadow-lg"
              >
                <p className="text-sm font-semibold text-slate-900">
                  Ready to save: {farmDraftMeta.name}
                </p>
                <p className="text-xs text-slate-500">
                  {farmDraftMeta.substationOfInterest || "No substation"} ·{" "}
                  {farmDraftMeta.assignedTo}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveFarm}
                    disabled={savingFarm}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingFarm ? "Saving…" : "Save farm"}
                  </button>
                  <button
                    type="button"
                    onClick={discardFarmDrawing}
                    disabled={savingFarm}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Redraw
                  </button>
                  <button
                    type="button"
                    onClick={cancelFarmWizard}
                    disabled={savingFarm}
                    className="rounded-md px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {!readOnlyMap ? (
        <FarmSetupDialog
          open={farmSetupOpen}
          onOpenChange={setFarmSetupOpen}
          teamMembers={teamMembers}
          substationNames={substationNames}
          initialValues={farmDraftMeta}
          onStartDrawing={startFarmDrawing}
        />
      ) : null}
      <datalist id="map-sub-names">
        {substationNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}
