import type { CatalogFilterState, CatalogSortOption, CatalogSourceFilter, GpuBrand } from "../types/listing";
import { CATALOG_SORT_OPTIONS, GPU_BRAND } from "../types/listing";
import { RotateCcw, Search } from "lucide-react";
import "./CatalogFilterBar.css";

interface CatalogFilterBarProps {
  readonly filters: CatalogFilterState;
  readonly onFilterChange: (filters: CatalogFilterState) => void;
  readonly onReset?: () => void;
}

const DEFAULT_FILTERS: CatalogFilterState = {
  search: "",
  brand: "all",
  source: "all",
  minPrice: 0,
  maxPrice: 100000,
  sortBy: CATALOG_SORT_OPTIONS.BUYABLE_DESC,
};

export function CatalogFilterBar({ filters, onFilterChange, onReset }: CatalogFilterBarProps) {
  function update<K extends keyof CatalogFilterState>(key: K, value: CatalogFilterState[K]) {
    onFilterChange({ ...filters, [key]: value });
  }

  function parseNumber(value: string, fallback: number): number {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  return (
    <section className="catalog-filter" aria-label="Urun katalog filtreleri">
      <div className="catalog-filter__wrapper">
        <div className="catalog-filter__search">
          <Search size={18} className="catalog-filter__search-icon" />
          <input
            type="text"
            className="catalog-filter__search-input"
            placeholder="Model veya şehir ara... (ör: RTX 3070, RX 6800, İstanbul)"
            value={filters.search}
            onChange={(event) => update("search", event.target.value)}
          />
        </div>

        <div className="catalog-filter__controls">
          <select
            className="catalog-filter__select"
            value={filters.brand}
            onChange={(event) => update("brand", event.target.value as GpuBrand | "all")}
          >
            <option value="all">Tüm markalar</option>
            <option value={GPU_BRAND.NVIDIA}>NVIDIA</option>
            <option value={GPU_BRAND.AMD}>AMD</option>
            <option value={GPU_BRAND.INTEL}>Intel</option>
          </select>

          <select
            className="catalog-filter__select"
            value={filters.source}
            aria-label="Mağaza seç"
            onChange={(event) => update("source", event.target.value as CatalogSourceFilter)}
          >
            <option value="all">Tüm mağazalar</option>
            <option value="sahibinden">Sahibinden</option>
            <option value="letgo">Letgo</option>
            <option value="dolap">Dolap</option>
            <option value="donanimhaber">Donanım Haber</option>
            <option value="facebook">Facebook</option>
            <option value="external">Diğer ikinci el mağazalar</option>
            <option value="pecid">GPU Pusula</option>
          </select>

          <input
            type="number"
            className="catalog-filter__input"
            placeholder="Min ₺"
            value={filters.minPrice || ""}
            onChange={(event) => update("minPrice", parseNumber(event.target.value, 0))}
          />

          <input
            type="number"
            className="catalog-filter__input"
            placeholder="Max ₺"
            value={filters.maxPrice === 100000 ? "" : filters.maxPrice}
            onChange={(event) => update("maxPrice", parseNumber(event.target.value, 100000))}
          />

          <select
            className="catalog-filter__select"
            value={filters.sortBy}
            onChange={(event) => update("sortBy", event.target.value as CatalogSortOption)}
          >
            <option value={CATALOG_SORT_OPTIONS.BUYABLE_DESC}>Alınabilir</option>
            <option value={CATALOG_SORT_OPTIONS.LATEST}>En yeni akış</option>
            <option value={CATALOG_SORT_OPTIONS.PRICE_ASC}>En ucuz</option>
            <option value={CATALOG_SORT_OPTIONS.PRICE_DESC}>En pahalı</option>
            <option value={CATALOG_SORT_OPTIONS.TITLE_ASC}>Ada göre</option>
          </select>

          <button
            type="button"
            className="catalog-filter__reset"
            onClick={() => {
              if (onReset) {
                onReset();
                return;
              }

              onFilterChange(DEFAULT_FILTERS);
            }}
          >
            <RotateCcw size={14} />
            <span>Sıfırla</span>
          </button>
        </div>
      </div>
    </section>
  );
}
