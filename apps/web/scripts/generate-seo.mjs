import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

const DEFAULT_SITE_URL = "https://gpupusula.shop";
const rawSiteUrl = process.env.VITE_SITE_URL || process.env.SITE_URL || DEFAULT_SITE_URL;
const siteUrl = rawSiteUrl.replace(/\/+$/g, "");

const staticPaths = ["/", "/marketplace", "/sat", "/hakkimizda"];
const modelSlugs = [
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

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildUrl(pathname, priority) {
  return `  <url><loc>${escapeXml(`${siteUrl}${pathname}`)}</loc><priority>${priority}</priority></url>`;
}

await mkdir(publicDir, { recursive: true });

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  ...staticPaths.map((pathname, index) => buildUrl(pathname, index === 0 ? "1.0" : "0.8")),
  ...modelSlugs.map((slug) => buildUrl(`/model/${slug}`, "0.7")),
].join("\n")}
</urlset>
`;

await writeFile(path.join(publicDir, "robots.txt"), robots, "utf8");
await writeFile(path.join(publicDir, "sitemap.xml"), sitemap, "utf8");

console.log(`[seo] robots.txt ve sitemap.xml hazirlandi: ${siteUrl}`);
