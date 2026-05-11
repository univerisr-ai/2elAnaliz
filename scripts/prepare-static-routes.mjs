import fs from "node:fs";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const SITE_URL = "https://gpupusula.shop";
const indexPath = path.join(DIST_DIR, "index.html");
const sitemapPath = path.join(DIST_DIR, "sitemap.xml");

if (!fs.existsSync(indexPath)) {
  throw new Error("dist/index.html bulunamadi.");
}

const indexHtml = fs.readFileSync(indexPath, "utf8");
const sitemapXml = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, "utf8") : "";
const routes = new Set(["marketplace", "sat", "hakkimizda", "ilan"]);

for (const match of sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const rawUrl = match[1] ?? "";
  if (!rawUrl.startsWith(SITE_URL)) {
    continue;
  }

  const route = rawUrl.slice(SITE_URL.length).replace(/^\/+|\/+$/g, "");
  if (route) {
    routes.add(route);
  }
}

for (const route of routes) {
  const routeDir = path.join(DIST_DIR, route);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "index.html"), indexHtml);
}

fs.writeFileSync(path.join(DIST_DIR, "404.html"), indexHtml);
console.log(`[routes] ${routes.size} statik SPA rotasi hazirlandi.`);
