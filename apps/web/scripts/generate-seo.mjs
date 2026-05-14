import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

const DEFAULT_SITE_URL = "https://www.gpupusula.shop";
const rawSiteUrl = process.env.VITE_SITE_URL || process.env.SITE_URL || DEFAULT_SITE_URL;
const siteUrl = rawSiteUrl.replace(/\/+$/g, "");

const staticPaths = [
  { pathname: "/", priority: "1.0", changefreq: "hourly" },
  { pathname: "/marketplace", priority: "0.9", changefreq: "hourly" },
  { pathname: "/sat", priority: "0.6", changefreq: "weekly" },
  { pathname: "/hakkimizda", priority: "0.6", changefreq: "monthly" },
];
const modelSlugs = [
  "rtx-5090",
  "rtx-5080",
  "rtx-5080-16-gb",
  "rtx-5070",
  "rtx-5070-16-gb",
  "rtx-5070-12-gb",
  "rtx-5060",
  "rtx-5060-ti",
  "rtx-4090",
  "rtx-4080",
  "rtx-4070",
  "rtx-4060",
  "rtx-3090",
  "rtx-3080",
  "rtx-3070",
  "rtx-3060",
  "rtx-3060-12-gb",
  "gtx-1660-super",
  "gtx-1650",
  "gtx-1080-ti",
  "gtx-1060-6-gb",
  "gtx-960",
  "gtx-960-4-gb",
  "rx-7900-xtx",
  "rx-7800-xt",
  "rx-7700-xt",
  "rx-7600",
  "rx-6900-xt",
  "rx-6800-xt",
  "rx-6700-xt",
  "rx-6600",
  "rx-580-8-gb",
  "intel-arc-a770",
  "intel-arc-a750",
];
const excludedModelSlugs = new Set(["rtx-507"]);

function normalizeGpuText(value) {
  return String(value || "")
    .replace(/[_/]+/g, " ")
    .replace(/[İı]/g, "I")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function slugifyModelLabel(label) {
  return String(label || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractModelLabel(listing) {
  const text = normalizeGpuText(`${listing?.model || ""} ${listing?.title || ""}`);
  const vramMatch = text.match(/\b(2|3|4|6|8|10|11|12|16|20|24|32|48)\s*(?:GB|GDDR|G\b)/i);
  const vram = vramMatch?.[1] ? `${vramMatch[1]} GB` : "";
  const patterns = [
    /\bRTX\s*-?\s*(\d{3,4})\s*(TI\s*SUPER|TI|SUPER)?\b/i,
    /\bGTX\s*-?\s*(\d{3,4})\s*(TI|SUPER)?\b/i,
    /\bRX\s*-?\s*(\d{3,4})\s*(XTX|XT|GRE)?\b/i,
    /\bINTEL\s+ARC\s+([AB]\d{3})\b/i,
    /\bARC\s+([AB]\d{3})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    if (pattern.source.includes("INTEL") || pattern.source.includes("ARC")) {
      return ["Intel Arc", match[1], vram].filter(Boolean).join(" ");
    }

    const prefix = match[0].startsWith("RX") ? "RX" : match[0].startsWith("GTX") ? "GTX" : "RTX";
    return [prefix, match[1], match[2]?.replace(/\s+/g, " "), vram].filter(Boolean).join(" ");
  }

  return normalizeGpuText(listing?.model || "");
}

async function readCatalogModelSlugs() {
  const catalogPath = path.resolve(__dirname, "../../api/src/data/catalog-cache.json");
  try {
    const raw = await import("node:fs/promises").then((fs) => fs.readFile(catalogPath, "utf8"));
    const listings = JSON.parse(raw);
    if (!Array.isArray(listings)) return [];

    return Array.from(
      new Set(
        listings
          .map(extractModelLabel)
          .map(slugifyModelLabel)
          .filter(Boolean),
      ),
    ).slice(0, 120);
  } catch {
    return [];
  }
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildUrl({ pathname, priority, changefreq = "daily" }) {
  const lastmod = new Date().toISOString();
  return [
    "  <url>",
    `    <loc>${escapeXml(`${siteUrl}${pathname}`)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].join("\n");
}

await mkdir(publicDir, { recursive: true });

const dynamicModelSlugs = await readCatalogModelSlugs();
const allModelSlugs = Array.from(new Set([...dynamicModelSlugs, ...modelSlugs])).filter(
  (slug) => !excludedModelSlugs.has(slug),
);

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  ...staticPaths.map(buildUrl),
  ...allModelSlugs.map((slug) => buildUrl({ pathname: `/model/${slug}`, priority: "0.7", changefreq: "daily" })),
].join("\n")}
</urlset>
`;

await writeFile(path.join(publicDir, "robots.txt"), robots, "utf8");
await writeFile(path.join(publicDir, "sitemap.xml"), sitemap, "utf8");

console.log(`[seo] robots.txt ve sitemap.xml hazirlandi: ${siteUrl}`);
