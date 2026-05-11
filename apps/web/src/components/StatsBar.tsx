/** StatsBar — Hizli katalog istatistik gostergeleri */

import type { GpuListing } from "../types/listing";
import { ShieldCheck, TrendingDown, Flame, Package } from "lucide-react";
import { useState } from "react";
import "./StatsBar.css";

interface StatsBarProps {
  readonly listings: readonly GpuListing[];
}

export function StatsBar({ listings }: StatsBarProps) {
  const [now] = useState(() => Date.now());
  const totalListings = listings.length;
  const dealCount = listings.filter((l) => l.discountPercent >= 10).length;

  const avgDiscount =
    listings.length > 0
      ? Math.round(listings.reduce((sum, l) => sum + l.discountPercent, 0) / listings.length)
      : 0;

  const avgConfidence =
    listings.length > 0
      ? Math.round(listings.reduce((sum, l) => sum + l.confidencePercent, 0) / listings.length)
      : 0;

  const freshCount = listings.filter((l) => {
    const listedAt = new Date(l.listedAt).getTime();
    if (Number.isNaN(listedAt)) {
      return false;
    }

    return now - listedAt < 1000 * 60 * 60 * 24 * 3;
  }).length;

  return (
    <section className="stats-bar container" aria-label="Katalog istatistikleri">
      <div className="stats-bar__grid">
        <div className="stats-bar__card">
          <div className="stats-bar__icon stats-bar__icon--primary">
            <Package size={17} />
          </div>
          <div className="stats-bar__value">{totalListings}</div>
          <div className="stats-bar__label">Toplam ilan</div>
          <div className="stats-bar__hint">Aktif taranan kayıt</div>
        </div>

        <div className="stats-bar__card">
          <div className="stats-bar__icon stats-bar__icon--orange">
            <Flame size={17} />
          </div>
          <div className="stats-bar__value">{dealCount}</div>
          <div className="stats-bar__label">Fırsat ilanı</div>
          <div className="stats-bar__hint">İndirim avantajı güçlü</div>
        </div>

        <div className="stats-bar__card">
          <div className="stats-bar__icon stats-bar__icon--blue">
            <TrendingDown size={17} />
          </div>
          <div className="stats-bar__value">%{avgDiscount}</div>
          <div className="stats-bar__label">Ort. indirim</div>
          <div className="stats-bar__hint">{freshCount} ilan son 72 saatte</div>
        </div>

        <div className="stats-bar__card">
          <div className="stats-bar__icon stats-bar__icon--pink">
            <ShieldCheck size={17} />
          </div>
          <div className="stats-bar__value">%{avgConfidence}</div>
          <div className="stats-bar__label">Ort. güven</div>
          <div className="stats-bar__hint">İlan güven skoru</div>
        </div>
      </div>
    </section>
  );
}
