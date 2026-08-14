import { describe, expect, test } from "bun:test";
import {
  extractAvailableMw,
  extractNve,
  heavyScenarioValues,
  rejectedMwValues,
} from "@/lib/nve-extract";
import { applyResponse, mergeFeeders, rollupAvailableMw } from "@/lib/pipeline";
import type { PipelineResponse, PipelineSubstation } from "@/lib/types";

// The "teaching" email: 5 MW is viable on-site (300 ft), 8 MW needs an extra
// feeder + 1.2 miles of trenching (we don't want it). Power is from Tam, not
// the Sahara site address.
const SAHARA_EMAIL = `Hi, Preston.

We reviewed:

Parcel: 16208103001, 3325 W Sahara Ave.
Power: 5 MW and 8 MW
ISD: Q3 2027

For 5 MVA: 2 feeders from Tam substation.
TA1205: 2 MVA: Install a switch at [1], 300 feet of trenching at same location to intercept existing cable. Install any additional switches as required. Serve from source at [1].
TA1210: 3 MVA: install any switches as required. Serve from source at [2].
This could be energized within NVE's standard construction timeframe. This is spreadsheet worthy.

8 MVA: above, additional feeder, and 1.2 miles of trenching, etc.

Thank you,
Chad Jacks | NV Energy`;

function pull(over: Partial<PipelineResponse>): PipelineResponse {
  return {
    id: Math.random().toString(36).slice(2),
    subject: "",
    date: "",
    from: "",
    text: "",
    mwAvailable: null,
    peakDemand: "",
    isdDate: "",
    feeders: [],
    trenchingFt: null,
    longLeadItems: [],
    images: [],
    sourceFile: "",
    ...over,
  };
}

function base(): PipelineSubstation {
  return {
    id: "x",
    kind: "substation",
    name: "Test",
    address: "",
    latitude: "",
    longitude: "",
    status: "confirmed",
    submittedBy: "",
    dateAdded: "",
    justification: "",
    priority: "Medium",
    assignedEe: "",
    dateStudySubmittedToNve: "",
    nveResponseRaw: "",
    mwAvailable: null,
    peakDemand: "",
    feeders: [],
    trenchingFt: null,
    isdDate: "",
    longLeadItems: [],
    longLeadPresent: false,
    compositeScore: null,
    dateResponseReceived: "",
    notes: "",
    responses: [],
    images: [],
    createdAt: "",
    updatedAt: "",
  };
}

describe("extractAvailableMw", () => {
  test("reads a single labeled Power line", () => {
    expect(extractAvailableMw("APN: 1\nPower: 10 MW\nfeeders...")).toBe(10);
  });

  test("takes the MAX scenario on one line, not the sum", () => {
    expect(extractAvailableMw("Peak Demand: 2MW and 4MW")).toBe(4);
    expect(extractAvailableMw("Peak Demands: 10 MW and 20 MW")).toBe(20);
  });

  test("drops scenarios NVE explicitly rejected (transmission study / no review)", () => {
    const t =
      "Peak Demand: 10, 20, 50 MVA ATTENTION: A transmission study would be required for 50 MVA load addition. Thus, no review for 50 MVA, below.";
    expect(rejectedMwValues(t).has(50)).toBe(true);
    expect(extractAvailableMw(t)).toBe(20);
  });

  test("ignores stray numbers with no serviceable label (subjects, signatures, equipment)", () => {
    expect(extractAvailableMw("Subject: RE: Power request - 4424 Polaris")).toBeNull();
    expect(
      extractAvailableMw("the 40 MW is 10 pages long. Quick 40 MW rundown: 4 feeders")
    ).toBeNull();
    expect(extractAvailableMw("a 40 MVA transformer with a 3 year lead time")).toBeNull();
  });
});

describe("viable-scenario selection (Sahara / Tam teaching email)", () => {
  test("drops the heavy option: 5 MW and 8 MW -> 5 (8 needs extra feeder + miles)", () => {
    expect(heavyScenarioValues(SAHARA_EMAIL).has(8)).toBe(true);
    expect(extractAvailableMw(SAHARA_EMAIL)).toBe(5);
  });

  test("attributes power to Tam substation (feeders), not the Sahara site", () => {
    const nve = extractNve(SAHARA_EMAIL);
    expect(nve.substation).toBe("Tam");
    expect(nve.feeders.map((f) => f.id)).toContain("TA-1205");
    expect(nve.feeders.map((f) => f.id)).toContain("TA-1210");
  });

  test("captures only the viable 300 ft trench, not the 1.2 mile option", () => {
    expect(extractNve(SAHARA_EMAIL).trenchingFt).toBe(300);
  });

  test("mwAvailable is 5 and notes explain the 8 MW exclusion", () => {
    const nve = extractNve(SAHARA_EMAIL);
    expect(nve.mwAvailable).toBe(5);
    expect(nve.notes).toMatch(/Excluded 8 MW/);
  });

  test("a lone stated value is kept even if trenching is mentioned", () => {
    expect(extractAvailableMw("Power: 8 MW\n8 MVA: 1.2 miles of trenching")).toBe(8);
  });
});

describe("rollupAvailableMw — never double counts", () => {
  test("two requests from the same substation take the MAX, not the sum", () => {
    const rs = [pull({ mwAvailable: 10 }), pull({ mwAvailable: 20 })];
    expect(rollupAvailableMw(rs, null)).toBe(20); // not 30
  });

  test("null pulls do not zero out a known value", () => {
    const rs = [pull({ mwAvailable: 10 }), pull({ mwAvailable: null })];
    expect(rollupAvailableMw(rs, null)).toBe(10);
  });
});

describe("applyResponse — capacity guardrails", () => {
  test("adding a second overlapping request does not inflate MW", () => {
    let rec = applyResponse(base(), pull({ mwAvailable: 10, feeders: [{ id: "HI-1228", mva: 5 }] }));
    rec = applyResponse(rec, pull({ mwAvailable: 20, feeders: [{ id: "HI-1228", mva: 5 }] }));
    expect(rec.mwAvailable).toBe(20); // max(10,20), not 30
    // the shared feeder is counted once
    expect(rec.feeders.filter((f) => f.id === "HI-1228")).toHaveLength(1);
  });
});

describe("mergeFeeders", () => {
  test("dedupes by id and keeps the largest known MVA", () => {
    const merged = mergeFeeders(
      [{ id: "POL-1201", mva: 5 }],
      [{ id: "POL-1201", mva: 8 }, { id: "POL-1205", mva: null }]
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((f) => f.id === "POL-1201")?.mva).toBe(8);
  });
});
