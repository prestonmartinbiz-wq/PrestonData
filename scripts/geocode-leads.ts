/**
 * One-time (idempotent) enrichment: geocode every lead that is missing
 * coordinates but has a usable property address, and write lat/lng back into
 * data/leads.csv using the app's canonical CSV serialization.
 *
 * Run with: bun run scripts/geocode-leads.ts
 */
import { promises as fs } from "fs";
import path from "path";
import { leadsToCsv, parseLeadsCsv } from "@/lib/csv";
import { geocodeAddress, hasCoords, sleep } from "@/lib/geocode";

const LEADS = path.join(process.cwd(), "data", "leads.csv");

async function main() {
  const csv = await fs.readFile(LEADS, "utf-8");
  const leads = parseLeadsCsv(csv);

  const pending = leads.filter(
    (l) => !hasCoords(l.latitude, l.longitude) && (l.propertyAddress || "").trim()
  );
  console.log(
    `Leads: ${leads.length} · already geocoded: ${
      leads.filter((l) => hasCoords(l.latitude, l.longitude)).length
    } · to geocode: ${pending.length}`
  );

  // Tiered fallbacks for addresses Nominatim can't resolve at house-number
  // precision (e.g. brand-new subdivisions): try the street, then the ZIP.
  const tiers = (addr: string): string[] => {
    const out = [addr];
    const street = addr.replace(/^\s*\d+\s+/, ""); // drop leading house number
    if (street !== addr) out.push(street);
    const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(addr)?.[1];
    if (zip) out.push(`${zip}, USA`);
    return out;
  };

  let ok = 0;
  let miss = 0;
  for (let i = 0; i < pending.length; i++) {
    const lead = pending[i];
    // Prefer the property address; the mailing/RA address is usually elsewhere.
    let hit = null as Awaited<ReturnType<typeof geocodeAddress>>;
    for (const q of tiers(lead.propertyAddress)) {
      hit = await geocodeAddress(q);
      if (hit) break;
      await sleep(1100);
    }
    if (hit) {
      lead.latitude = String(hit.lat);
      lead.longitude = String(hit.lng);
      ok++;
      console.log(
        `  [${i + 1}/${pending.length}] ${lead.apn} -> ${hit.lat.toFixed(
          5
        )},${hit.lng.toFixed(5)}  (${lead.propertyAddress})`
      );
    } else {
      miss++;
      console.log(
        `  [${i + 1}/${pending.length}] ${lead.apn} -> NO MATCH  (${lead.propertyAddress})`
      );
    }
    // Respect Nominatim's ~1 req/sec policy.
    await sleep(1100);
  }

  await fs.writeFile(LEADS, leadsToCsv(leads) + "\n", "utf-8");
  console.log(`Done. geocoded=${ok} missed=${miss}. Wrote ${LEADS}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
