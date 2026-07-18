import type { GpuListing } from "../types/listing";
import "./Ticker.css";

interface TickerProps {
  readonly items: readonly GpuListing[];
  readonly onSelect: (item: GpuListing, element: HTMLElement) => void;
}

function formatTickerPrice(value: number): string {
  return `${value.toLocaleString("tr-TR")} TL`;
}

export function Ticker({ items, onSelect }: TickerProps) {
  if (items.length === 0) {
    return null;
  }

  const loopItems = [...items, ...items];

  return (
    <div className="ticker" role="marquee" aria-label="Fırsat bandı">
      <span className="ticker__label">
        <span className="ticker__dot" aria-hidden="true" />
        Fırsat Bandı
      </span>
      <div className="ticker__viewport">
        <div className="ticker__track">
          {loopItems.map((item, index) => (
            <button
              type="button"
              className="ticker__item"
              key={`${item.id}-${index}`}
              tabIndex={index >= items.length ? -1 : 0}
              aria-hidden={index >= items.length}
              onClick={(event) => onSelect(item, event.currentTarget)}
            >
              <strong>{item.model}</strong>
              <span className="ticker__price">{formatTickerPrice(item.price)}</span>
              <span className={`ticker__delta ${item.discountPercent > 0 ? "is-down" : "is-up"}`}>
                {item.discountPercent > 0 ? `%-${item.discountPercent} ▼` : `%+${Math.abs(item.discountPercent)} ▲`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
