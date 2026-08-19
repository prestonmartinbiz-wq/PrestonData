import { describe, expect, test } from "bun:test";
import {
  computeFarmMembers,
  farmBbox,
  leadCentroidInFarm,
  mergeFarmMembers,
} from "@/lib/farms";
import type { FarmBoundary, FarmMember, Lead } from "@/lib/types";

const BOUNDARY: FarmBoundary = {
  type: "Polygon",
  coordinates: [
    [
      [-115.2, 36.1],
      [-115.19, 36.1],
      [-115.19, 36.11],
      [-115.2, 36.11],
      [-115.2, 36.1],
    ],
  ],
};

describe("farm membership", () => {
  test("parcel inside boundary is a member", () => {
    const members = computeFarmMembers(BOUNDARY, [
      {
        type: "Feature",
        properties: { APN: "13919615010" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-115.195, 36.105],
              [-115.194, 36.105],
              [-115.194, 36.106],
              [-115.195, 36.106],
              [-115.195, 36.105],
            ],
          ],
        },
      },
    ]);
    expect(members.length).toBe(1);
    expect(members[0].apn).toBe("13919615010");
    expect(members[0].addedVia).toBe("polygon");
  });

  test("parcel outside boundary is excluded", () => {
    const members = computeFarmMembers(BOUNDARY, [
      {
        type: "Feature",
        properties: { APN: "99999999999" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-115.5, 36.5],
              [-115.49, 36.5],
              [-115.49, 36.51],
              [-115.5, 36.51],
              [-115.5, 36.5],
            ],
          ],
        },
      },
    ]);
    expect(members.length).toBe(0);
  });

  test("lead centroid inside polygon", () => {
    const lead: Lead = {
      apn: "1",
      propertyAddress: "",
      ownerEntity: "",
      decisionMaker: "",
      title: "",
      phone: "",
      email: "",
      altPhone: "",
      phones: "",
      mailingAddress: "",
      confidence: "",
      sources: "",
      notes: "",
      status: "",
      assignedTo: "",
      latitude: "36.105",
      longitude: "-115.195",
      lastCalledAt: "",
      lastOutcome: "",
      nextCallbackAt: "",
      callCount: "",
      needsSkipTrace: "",
    };
    expect(leadCentroidInFarm(BOUNDARY, lead)).toBe(true);
  });

  test("merge keeps manual members on boundary redraw", () => {
    const existing: FarmMember[] = [
      { apn: "111", addedVia: "manual", addedAt: "2026-01-01" },
      { apn: "222", addedVia: "polygon", addedAt: "2026-01-01" },
    ];
    const fromPolygon: FarmMember[] = [
      { apn: "333", addedVia: "polygon", addedAt: "2026-02-01" },
    ];
    const merged = mergeFarmMembers(existing, fromPolygon);
    expect(merged.map((m) => m.apn)).toEqual(["111", "333"]);
  });

  test("farmBbox returns finite extents", () => {
    const [w, s, e, n] = farmBbox(BOUNDARY);
    expect(w).toBeLessThan(e);
    expect(s).toBeLessThan(n);
  });
});
