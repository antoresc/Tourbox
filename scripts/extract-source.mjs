// Reads the original static index.html and extracts the SHOWS array and
// DETAILS object into scripts/source-data.json for seeding.
// Usage: node scripts/extract-source.mjs [path-to-index.html]
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2] || "/Users/antoniorescigno/Downloads/index.html";
const html = readFileSync(src, "utf8");

const shows = JSON.parse(html.match(/const SHOWS\s*=\s*(\[[\s\S]*?\]);/)[1]);
const details = JSON.parse(html.match(/let DETAILS\s*=\s*(\{[\s\S]*?\});\s*\n/)[1]);

writeFileSync(
  "scripts/source-data.json",
  JSON.stringify({ shows, details }, null, 2)
);
console.log(
  `extracted ${shows.length} shows, ${Object.keys(details).length} tourbooks`
);
