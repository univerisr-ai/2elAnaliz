import type { CatalogFilterState, CatalogSortOption, CatalogSourceFilter, GpuBrand, ProductType } from "../types/listing";
import { CATALOG_SORT_OPTIONS, GPU_BRAND } from "../types/listing";
import "./CatalogFilterBar.css";

interface CatalogFilterBarProps {
  readonly filters: CatalogFilterState;
  readonly onFilterChange: (filters: CatalogFilterState) => void;
  readonly onReset?: () => void;
  readonly productType?: ProductType;
}

const DEFAULT_FILTERS: CatalogFilterState = {
  search: "",
  brand: "all",
  source: "all",
  minPrice: 0,
  maxPrice: 100000,
  sortBy: CATALOG_SORT_OPTIONS.BUYABLE_DESC,
};

const SOURCE_OPTIONS: ReadonlyArray<{ readonly value: CatalogSourceFilter; readonly label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "sahibinden", label: "Sahibinden" },
  { value: "letgo", label: "Letgo" },
  { value: "dolap", label: "Dolap" },
  { value: "donanimhaber", label: "Donanım Haber" },
  { value: "external", label: "Harici · Forum" },
  { value: "pecid", label: "GPU Pusula" },
];

export function CatalogFilterBar({ filters, onFilterChange, onReset, productType = "gpu" }: CatalogFilterBarProps) {
  function update<K extends keyof CatalogFilterState>(key: K, value: CatalogFilterState[K]) {
    onFilterChange({ ...filters, [key]: value });
  }

  function parseNumber(value: string, fallback: number): number {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  const brandOptions: ReadonlyArray<{ readonly value: GpuBrand | "all"; readonly label: string }> =
    productType === "gpu"
      ? [
          { value: "all", label: "Tümü" },
          { value: GPU_BRAND.NVIDIA, label: "NVIDIA" },
          { value: GPU_BRAND.AMD, label: "AMD" },
          { value: GPU_BRAND.INTEL, label: "Intel" },
        ]
      : [
          { value: "all", label: "Tümü" },
          { value: GPU_BRAND.AMD, label: "AMD" },
          { value: GPU_BRAND.INTEL, label: "Intel" },
        ];

  const searchPlaceholder =
    productType === "cpu"
      ? "model, şehir, başlık… (ör: Ryzen 5 5600X)"
      : "model, şehir, başlık… (ör: RTX 3070)";

  return (
    <section className="catalog-filter" aria-label="Urun katalog filtreleri">
      <div className="catalog-filter__section">
        <label className="catalog-filter__micro" htmlFor="catalog-filter-search">
          Ara
        </label>
        <input
          id="catalog-filter-search"
          type="text"
          className="catalog-filter__search"
          placeholder={searchPlaceholder}
          value={filters.search}
          onChange={(event) => update("search", event.target.value)}
        />
      </div>

      <div className="catalog-filter__section">
        <span className="catalog-filter__micro" id="catalog-filter-brand-label">
          Marka
        </span>
        <div className="catalog-filter__segments" role="group" aria-labelledby="catalog-filter-brand-label">
          {brandOptions.map((option) => {
            const isActive = filters.brand === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`catalog-filter__segment${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                onClick={() => update("brand", option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="catalog-filter__section">
        <span className="catalog-filter__micro" id="catalog-filter-source-label">
          Kaynak
        </span>
        <div className="catalog-filter__sources" role="group" aria-labelledby="catalog-filter-source-label">
          {SOURCE_OPTIONS.map((option) => {
            const isActive = filters.source === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`catalog-filter__source${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                onClick={() => update("source", option.value)}
              >
                <span className="catalog-filter__source-box" data-source={option.value} aria-hidden="true">
                  {isActive ? (
                    <svg width="9" height="8" viewBox="0 0 9 8">
                      <path d="M1 4 L3.4 6.4 L8 1.4" stroke="#FFFFFF" strokeWidth="1.8" fill="none" />
                    </svg>
                  ) : null}
                </span>
                <span className="catalog-filter__source-label">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="catalog-filter__section">
        <span className="catalog-filter__micro" id="catalog-filter-price-label">
          Fiyat · TL
        </span>
        <div className="catalog-filter__price" role="group" aria-labelledby="catalog-filter-price-label">
          <input
            type="number"
            inputMode="numeric"
            className="catalog-filter__price-input"
            placeholder="Min"
            aria-label="Minimum fiyat"
            value={filters.minPrice || ""}
            onChange={(event) => update("minPrice", parseNumber(event.target.value, 0))}
          />
          <span className="catalog-filter__price-dash" aria-hidden="true">
            —
          </span>
          <input
            type="number"
            inputMode="numeric"
            className="catalog-filter__price-input"
            placeholder="Maks"
            aria-label="Maksimum fiyat"
            value={filters.maxPrice === 100000 ? "" : filters.maxPrice}
            onChange={(event) => update("maxPrice", parseNumber(event.target.value, 100000))}
          />
        </div>
      </div>

      <div className="catalog-filter__section">
        <label className="catalog-filter__micro" htmlFor="catalog-filter-sort">
          Alınabilirlik
        </label>
        <select
          id="catalog-filter-sort"
          className="catalog-filter__sort"
          value={filters.sortBy}
          onChange={(event) => update("sortBy", event.target.value as CatalogSortOption)}
        >
          <option value={CATALOG_SORT_OPTIONS.BUYABLE_DESC}>Alınabilir</option>
          <option value={CATALOG_SORT_OPTIONS.LATEST}>En yeni akış</option>
          <option value={CATALOG_SORT_OPTIONS.PRICE_ASC}>En ucuz</option>
          <option value={CATALOG_SORT_OPTIONS.PRICE_DESC}>En pahalı</option>
          <option value={CATALOG_SORT_OPTIONS.TITLE_ASC}>Ada göre</option>
        </select>
      </div>

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
        Sıfırla
      </button>
    </section>
  );
}
