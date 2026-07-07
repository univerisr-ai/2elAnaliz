import "./Footer.css";

const FOOTER_LINKS: Array<{ href: string; label: string }> = [
  { href: "/marketplace", label: "GPU Pazarı" },
  { href: "/marketplace/cpu", label: "CPU Pazarı" },
  { href: "/ilan-ekle", label: "İlan Ekle" },
  { href: "/hakkimizda", label: "Hakkımızda" },
];

function formatColophonDate(): string {
  return new Date()
    .toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })
    .toLocaleUpperCase("tr-TR");
}

export function Footer() {
  return (
    <footer className="footer" id="site-footer">
      <div className="footer__panel container">
        <div className="footer__colophon">
          <span>{formatColophonDate()} · Seans her 6 saatte yenilenir</span>
          <span className="footer__sources">Veri: Sahibinden · Letgo · Dolap · DonanımHaber</span>
          <span>GPU Pusula — Açık Seans</span>
        </div>

        <div className="footer__bottom">
          <p className="footer__disclaimer">
            İlanlar bilgilendirme amaçlı gösterilir; fiyat ve stok durumu zaman içinde değişebilir.
          </p>
          <nav className="footer__links" aria-label="Alt gezinme">
            {FOOTER_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
