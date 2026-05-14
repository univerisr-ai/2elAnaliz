import "./Footer.css";

export function Footer() {
  return (
    <footer className="footer" id="site-footer">
      <div className="footer__panel container">
        <p className="footer__text">
          <span className="footer__brand">GPU Pusula</span> · 2. el ekran kartı ve ikinci el GPU ilanlarını daha okunabilir, daha hızlı ve daha güven odaklı incelemek için tasarlanmış sade bir katalog arayüzü.
        </p>
        <p className="footer__disclaimer">
          İlanlar bilgilendirme amaçlı gösterilir; fiyat ve stok durumu zaman içinde değişebilir.
        </p>
      </div>
    </footer>
  );
}
