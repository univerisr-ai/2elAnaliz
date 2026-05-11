/** FilterBar — Arama ve filtre paneli */

import type { FilterState, SortOption, GpuBrand } from "../types/listing";
import { SORT_OPTIONS, GPU_BRAND } from "../types/listing";
import { Search, RotateCcw, SlidersHorizontal } from "lucide-react";
import "./FilterBar.css";

interface FilterBarProps {
  readonly filters: FilterState;
  readonly onFilterChange: (filters: FilterState) => void;
  readonly resultCount: number;
  readonly totalCount: number;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  brand: "all",
  minPrice: 0,
  maxPrice: 100000,
  minConfidence: 0,
  sortBy: SORT_OPTIONS.DISCOUNT_DESC,
};

export function FilterBar({ filters, onFilterChange, resultCount, totalCount }: FilterBarProps) {
  function handleSearchChange(value: string) {
    onFilterChange({ ...filters, search: value });
  }

  function handleBrandChange(value: string) {
    onFilterChange({
      ...filters,
      brand: value as GpuBrand | "all",
    });
  }

  function handleSortChange(value: string) {
    onFilterChange({ ...filters, sortBy: value as SortOption });
  }

  function handleMinPriceChange(value: string) {
    const parsed = parseInt(value, 10);
    onFilterChange({ ...filters, minPrice: isNaN(parsed) ? 0 : parsed });
  }

  function handleMaxPriceChange(value: string) {
    const parsed = parseInt(value, 10);
    onFilterChange({
      ...filters,
      maxPrice: isNaN(parsed) ? 100000 : parsed,
    });
  }

  function handleMinConfidenceChange(value: string) {
    const parsed = parseInt(value, 10);
    onFilterChange({ ...filters, minConfidence: isNaN(parsed) ? 0 : parsed });
  }

  function handleReset() {
    onFilterChange(DEFAULT_FILTERS);
  }

  return (
    <section className="filter-bar container" id="catalog-panel" aria-label="Filtreler">
      <div className="filter-bar__wrapper">
        <div className="filter-bar__topline">
          <div>
            <span className="filter-bar__eyebrow">İlan paneli</span>
            <h3>Filtreler, sonuç sayısı ve sıralama tek satır mantığında hazır.</h3>
          </div>
          <div className="filter-bar__status">
            <SlidersHorizontal size={15} />
            <span>
              {resultCount} / {totalCount} ilan gösteriliyor
            </span>
          </div>
        </div>

        <div className="filter-bar__search-row">
          <Search size={18} className="filter-bar__search-icon" />
          <input
            id="search-input"
            type="text"
            className="filter-bar__search-input"
            placeholder="GPU ara... Örnek: RTX 4070, RX 7800 XT"
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <div className="filter-bar__control-grid">
          <section className="filter-bar__segment" aria-label="Marka ve sıralama">
            <div className="filter-bar__segment-heading">
              <span className="filter-bar__segment-kicker">Seçim</span>
              <strong>Marka ve sıralama</strong>
            </div>

            <div className="filter-bar__controls filter-bar__controls--two-up">
              <div className="filter-bar__group">
                <span className="filter-bar__label">Marka</span>
                <select
                  id="filter-brand"
                  className="filter-bar__select"
                  value={filters.brand}
                  onChange={(e) => handleBrandChange(e.target.value)}
                >
                  <option value="all">Tüm markalar</option>
                  <option value={GPU_BRAND.NVIDIA}>NVIDIA</option>
                  <option value={GPU_BRAND.AMD}>AMD</option>
                  <option value={GPU_BRAND.INTEL}>Intel</option>
                </select>
              </div>

              <div className="filter-bar__group">
                <span className="filter-bar__label">Sıralama</span>
                <select
                  id="filter-sort"
                  className="filter-bar__select"
                  value={filters.sortBy}
                  onChange={(e) => handleSortChange(e.target.value)}
                >
                  <option value={SORT_OPTIONS.DISCOUNT_DESC}>En yüksek indirim</option>
                  <option value={SORT_OPTIONS.CONFIDENCE_DESC}>En yüksek güven</option>
                  <option value={SORT_OPTIONS.PRICE_ASC}>En ucuz</option>
                  <option value={SORT_OPTIONS.PRICE_DESC}>En pahalı</option>
                </select>
              </div>
            </div>
          </section>

          <section className="filter-bar__segment" aria-label="Fiyat aralığı">
            <div className="filter-bar__segment-heading">
              <span className="filter-bar__segment-kicker">Bütçe</span>
              <strong>Fiyat aralığı</strong>
            </div>

            <div className="filter-bar__controls">
              <div className="filter-bar__group filter-bar__group--range">
                <span className="filter-bar__label">Minimum ve maksimum</span>
                <div className="filter-bar__range-row">
                  <input
                    id="filter-min-price"
                    type="number"
                    className="filter-bar__range-input"
                    placeholder="Min ₺"
                    value={filters.minPrice || ""}
                    onChange={(e) => handleMinPriceChange(e.target.value)}
                  />
                  <input
                    id="filter-max-price"
                    type="number"
                    className="filter-bar__range-input"
                    placeholder="Max ₺"
                    value={filters.maxPrice === 100000 ? "" : filters.maxPrice}
                    onChange={(e) => handleMaxPriceChange(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="filter-bar__segment" aria-label="Güven ve sıfırlama">
            <div className="filter-bar__segment-heading">
              <span className="filter-bar__segment-kicker">Kalite</span>
              <strong>Güven eşiği</strong>
            </div>

            <div className="filter-bar__controls filter-bar__controls--two-up">
              <div className="filter-bar__group">
                <span className="filter-bar__label">Min güven</span>
                <select
                  id="filter-confidence"
                  className="filter-bar__select"
                  value={filters.minConfidence}
                  onChange={(e) => handleMinConfidenceChange(e.target.value)}
                >
                  <option value={0}>Tümü</option>
                  <option value={40}>%40+</option>
                  <option value={60}>%60+</option>
                  <option value={75}>%75+</option>
                  <option value={90}>%90+</option>
                </select>
              </div>

              <div className="filter-bar__group filter-bar__group--reset">
                <span className="filter-bar__label">Paneli temizle</span>
                <button id="filter-reset" className="filter-bar__reset-btn" onClick={handleReset} type="button">
                  <RotateCcw size={14} />
                  <span>Filtreleri sıfırla</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
