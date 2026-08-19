"use client";

import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import type { Farm, SaveMeta } from "@/lib/types";

export function FarmsPageClient({
  initialFarms,
  initialMeta,
  teamNames,
}: {
  initialFarms: Farm[];
  initialMeta: SaveMeta;
  teamNames: string[];
}) {
  const allNames = Array.from(
    new Set([...teamNames, ...initialFarms.map((f) => f.assignedTo)].filter(Boolean))
  ).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Farms
          </h1>
          <p className="text-sm text-slate-500">
            {initialFarms.length} farm territory
            {initialFarms.length === 1 ? "" : "ies"} · draw new ones on the{" "}
            <Link href="/map" className="text-sky-700 hover:underline">Map</Link>.
          </p>
        </div>
        <Link
          href="/map"
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <MapPin className="h-4 w-4" />
          Build a farm
        </Link>
      </div>

      {initialFarms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
          <Users className="mx-auto mb-2 h-8 w-8 text-slate-400" />
          <p className="font-medium text-slate-700">No farms yet</p>
          <p className="mt-1">
            Open the map, tap the <strong>pen</strong>, label the farm, then draw its boundary.
          </p>
        </div>
      ) : null}

      {allNames.map((name) => {
        const farms = initialFarms.filter((f) => f.assignedTo === name);
        return (
          <section key={name} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Users className="h-4 w-4 text-slate-400" />
              {name}
              <span className="text-slate-400">({farms.length})</span>
            </h2>
            {farms.length === 0 ? (
              <p className="text-sm text-slate-400">No farms assigned.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {farms.map((farm) => (
                  <Link
                    key={farm.id}
                    href={`/farms/${encodeURIComponent(farm.id)}`}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: farm.color }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {farm.name}
                        </p>
                        {farm.substationOfInterest ? (
                          <p className="text-xs text-slate-500 truncate">
                            {farm.substationOfInterest}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">
                          {farm.members.length} parcel
                          {farm.members.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {initialMeta.source ? (
        <p className="text-xs text-slate-400">
          Data source: {initialMeta.source}
          {initialMeta.lastSavedAt
            ? ` · saved ${new Date(initialMeta.lastSavedAt).toLocaleString()}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
