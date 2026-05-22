import fs from "node:fs";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const DEFAULT_SITE_URL = "https://www.gpupusula.shop";
const rawSiteUrl = process.env.VITE_SITE_URL || process.env.SITE_URL || DEFAULT_SITE_URL;
const SITE_URL = rawSiteUrl.replace(/\/+$/g, "") === "https://gpupusula.shop"
  ? DEFAULT_SITE_URL
  : rawSiteUrl.replace(/\/+$/g, "");
const indexPath = path.join(DIST_DIR, "index.html");
const sitemapPath = path.join(DIST_DIR, "sitemap.xml");

if (!fs.existsSync(indexPath)) {
  throw new Error("dist/index.html bulunamadi.");
}

const indexHtml = fs.readFileSync(indexPath, "utf8");
const sitemapXml = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, "utf8") : "";
const routes = new Set(["marketplace", "marketplace/cpu", "sat", "ilan-ekle/link", "ilan-ekle/manuel", "giris", "kayit", "hakkimizda", "ilan"]);

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^(rtx|gtx|rx|arc|intel|ti|gb|xt|xtx|gre)$/i.test(part)) return part.toUpperCase();
      return part;
    })
    .join(" ")
    .replace(/\b(\d+)\s+GB\b/gi, "$1 GB")
    .replace(/^INTEL ARC/i, "Intel Arc")
    .trim();
}

function getRouteMeta(route) {
  const cleanRoute = String(route || "").replace(/^\/+|\/+$/g, "");
  const pathName = cleanRoute ? `/${cleanRoute}` : "/";

  if (!cleanRoute) {
    return {
      title: "İkinci El Ekran Kartı Fiyatları ve GPU İlanları | GPU Pusula",
      description:
        "GPU Pusula ile ikinci el ekran kartı fiyatlarını, RTX, GTX, RX ve Intel Arc GPU ilanlarını alınabilirlik skoru ve güncel piyasa referansıyla karşılaştır.",
      canonical: `${SITE_URL}/`,
    };
  }

  if (cleanRoute === "marketplace") {
    return {
      title: "İkinci El Ekran Kartı İlanları ve Fiyatları | GPU Pusula",
      description:
        "Güncel ikinci el ekran kartı ilanlarını model, fiyat, konum ve alınabilirlik skoruyla filtrele. RTX, GTX, RX ve Intel Arc GPU seçeneklerini karşılaştır.",
      canonical: `${SITE_URL}/marketplace`,
    };
  }

  if (cleanRoute === "marketplace/cpu") {
    return {
      title: "CPU Kataloğu Hazırlanıyor | GPU Pusula",
      description:
        "GPU Pusula CPU bölümü hazırlık aşamasındadır. İşlemci ilanları için model eşleştirme, fiyat referansı ve kalite filtresi yayına alınmadan önce hazırlanıyor.",
      canonical: `${SITE_URL}/marketplace/cpu`,
      robots: "noindex, nofollow",
    };
  }

  if (cleanRoute === "sat" || cleanRoute === "ilan-ekle/link") {
    return {
      title: "İlan Linki Gönder | GPU Pusula",
      description: "İkinci el ekran kartı ilan linkini GPU Pusula inceleme kuyruğuna gönder ve durumunu hesabından takip et.",
      canonical: `${SITE_URL}/ilan-ekle/link`,
    };
  }

  if (cleanRoute === "ilan-ekle/manuel") {
    return {
      title: "Manuel Ekran Kartı İlanı Gönder | GPU Pusula",
      description: "Ekran kartı ilanını fotoğraf, fiyat ve açıklama bilgileriyle manuel olarak GPU Pusula inceleme kuyruğuna gönder.",
      canonical: `${SITE_URL}/ilan-ekle/manuel`,
    };
  }

  if (cleanRoute === "giris") {
    return {
      title: "Giriş Yap | GPU Pusula",
      description: "GPU Pusula hesabına giriş yap ve gönderdiğin ekran kartı ilanlarını takip et.",
      canonical: `${SITE_URL}/giris`,
    };
  }

  if (cleanRoute === "kayit") {
    return {
      title: "Kayıt Ol | GPU Pusula",
      description: "GPU Pusula hesabı oluştur, ekran kartı ilanı gönder ve yayın sürecini takip et.",
      canonical: `${SITE_URL}/kayit`,
    };
  }

  if (cleanRoute === "hakkimizda") {
    return {
      title: "GPU Pusula Nedir? İkinci El GPU Rehberi",
      description: "GPU Pusula'nın ikinci el ekran kartı ilanlarını nasıl topladığını, fiyat ve risk sinyallerini nasıl gösterdiğini öğren.",
      canonical: `${SITE_URL}/hakkimizda`,
    };
  }

  if (cleanRoute.startsWith("model/")) {
    const modelName = titleFromSlug(cleanRoute.slice("model/".length));
    return {
      title: `${modelName} İkinci El Ekran Kartı Fiyatları | GPU Pusula`,
      description: `${modelName} ikinci el ekran kartı ilanlarını fiyat, konum ve alınabilirlik skoruyla karşılaştır. Güncel GPU Pusula kataloğunda temiz fırsatları incele.`,
      canonical: `${SITE_URL}${pathName}`,
    };
  }

  return {
    title: "İkinci El Ekran Kartı İlanları | GPU Pusula",
    description: "İkinci el GPU ilanlarını model, fiyat ve alınabilirlik skoruyla incele.",
    canonical: `${SITE_URL}${pathName}`,
  };
}

function buildJsonLd(meta) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: meta.title,
    url: meta.canonical,
    inLanguage: "tr-TR",
    description: meta.description,
    isPartOf: {
      "@type": "WebSite",
      name: "GPU Pusula",
      url: `${SITE_URL}/`,
    },
  });
}

function applyRouteMeta(html, route) {
  const meta = getRouteMeta(route);
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const canonical = escapeHtml(meta.canonical);
  const robots = escapeHtml(meta.robots || "index, follow, max-image-preview:large");
  const jsonLd = buildJsonLd(meta).replace(/</g, "\\u003c");

  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${robots}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`)
    .replace(
      /<script id="site-jsonld" type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script id="site-jsonld" type="application/ld+json">${jsonLd}</script>`,
    );
}

for (const route of routes) {
  const routeDir = path.join(DIST_DIR, route);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "index.html"), applyRouteMeta(indexHtml, route));
}

fs.writeFileSync(indexPath, applyRouteMeta(indexHtml, ""));
fs.writeFileSync(path.join(DIST_DIR, "404.html"), applyRouteMeta(indexHtml, ""));
console.log(`[routes] ${routes.size} statik SPA rotasi hazirlandi.`);
