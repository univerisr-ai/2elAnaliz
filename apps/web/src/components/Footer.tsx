import { Compass } from "lucide-react";
import "./Footer.css";

const FOOTER_LINKS: Array<{ href: string; label: string }> = [
  { href: "/marketplace", label: "GPU Pazarı" },
  { href: "/marketplace/cpu", label: "CPU Pazarı" },
  { href: "/ilan-ekle", label: "İlan Ekle" },
  { href: "/hakkimizda", label: "Hakkımızda" },
];

export function Footer() {
  return (
    <footer className="footer" id="site-footer">
      <div className="footer__panel container">
        <div className="footer__top">
          <div className="footer__brand-block">
            <p className="footer__brand">
              <Compass size={18} aria-hidden="true" />
              GPU Pusula
            </p>
            <p className="footer__text">
              2. el ekran kartı ve ikinci el GPU ilanlarını daha okunabilir, daha hızlı ve daha güven odaklı incelemek
              için tasarlanmış sade bir katalog arayüzü.
            </p>
          </div>

          <nav className="footer__links" aria-label="Alt gezinme">
            {FOOTER_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="footer__bottom">
          <p className="footer__disclaimer">
            İlanlar bilgilendirme amaçlı gösterilir; fiyat ve stok durumu zaman içinde değişebilir.
          </p>
          <span className="footer__meta">gpupusula.shop</span>
        </div>
      </div>
    </footer>
  );
}
