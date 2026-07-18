import { useRef, useState } from "react";
import { Bell, Compass, Moon, Search, Sun, UserCircle } from "lucide-react";
import "./Header.css";

type ThemeName = "light" | "dark";

function readInitialTheme(): ThemeName {
  if (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark") {
    return "dark";
  }
  return "light";
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#131318" : "#f6f8fc");
  try {
    localStorage.setItem("gp-theme", theme);
  } catch {
    // Gizli modda tercih kalıcı olmayabilir; tema yine de uygulanır.
  }
}

type PageView = "home" | "catalog" | "cpu" | "submit-link" | "submit-manual" | "signin" | "signup" | "admin" | "about";
type AuthIntent = "signin" | "signup";

export interface HeaderNotification {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly timeLabel: string;
  readonly kind: "published" | "comment" | "alert" | "review";
}

interface HeaderProps {
  readonly activePage: PageView;
  readonly onNavigate: (page: PageView) => void;
  readonly listingCount: number;
  readonly lastUpdated: string;
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly onSearchSubmit: () => void;
  readonly isSignedIn: boolean;
  readonly accountLabel: string | null;
  readonly isAdmin: boolean;
  readonly onAuthNavigate: (intent: AuthIntent) => void;
  readonly notifications: readonly HeaderNotification[];
  readonly isNotificationPanelOpen: boolean;
  readonly onToggleNotifications: () => void;
  readonly onNotificationSelect: () => void;
  readonly onOpenPortfolio?: () => void;
  readonly portfolioCount?: number;
}

const NAV_ITEMS: Array<{ key: PageView; label: string; adminOnly?: boolean }> = [
  { key: "home", label: "Ana Sayfa" },
  { key: "catalog", label: "Marketplace" },
  { key: "submit-link", label: "Sat" },
  { key: "admin", label: "Yönetim", adminOnly: true },
  { key: "about", label: "Hakkımızda" },
];

function isNavItemActive(itemKey: PageView, activePage: PageView): boolean {
  if (itemKey === activePage) {
    return true;
  }

  if (itemKey === "catalog" && activePage === "cpu") {
    return true;
  }

  return itemKey === "submit-link" && (activePage === "submit-manual" || activePage === "signin" || activePage === "signup");
}

/* Pusula ibresi: her sayfanın bir "kerterizi" var; gezinmede ibre tam tur atıp
   yeni yöne kilitlenir. */
const PAGE_BEARINGS: Record<PageView, number> = {
  home: 0,
  catalog: 60,
  cpu: 120,
  "submit-link": 180,
  "submit-manual": 180,
  signin: 220,
  signup: 220,
  admin: 300,
  about: 260,
};

function formatSyncLabel(lastUpdated: string): string {
  const timeMatch = lastUpdated.match(/(\d{1,2}[:.]\d{2})(?::\d{2})?\s*$/);
  return timeMatch ? timeMatch[1].replace(".", ":") : lastUpdated;
}

export function Header({
  activePage,
  onNavigate,
  listingCount,
  lastUpdated,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  isSignedIn,
  accountLabel,
  isAdmin,
  onAuthNavigate,
  notifications,
  isNotificationPanelOpen,
  onToggleNotifications,
  onNotificationSelect,
  onOpenPortfolio,
  portfolioCount = 0,
}: HeaderProps) {
  const notificationCount = notifications.length;
  const isCpuPage = activePage === "cpu";

  const [theme, setTheme] = useState<ThemeName>(readInitialTheme);
  function toggleTheme() {
    const next: ThemeName = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  const needleTurns = useRef(0);
  const needlePrevPage = useRef(activePage);
  if (needlePrevPage.current !== activePage) {
    needleTurns.current += 1;
    needlePrevPage.current = activePage;
  }
  const needleDeg = needleTurns.current * 360 + PAGE_BEARINGS[activePage];

  return (
    <header className="header" id="site-header">
      <div className="header__inner">
        <button type="button" className="header__brand" onClick={() => onNavigate("home")}>
          <span className="header__brand-mark" aria-hidden="true" style={{ "--needle-deg": `${needleDeg}deg` } as React.CSSProperties}>
            <Compass size={16} />
          </span>
          <span className="header__brand-copy">
            <h1 className="header__title">GPU Pusula</h1>
            <small>Açık Seans · Fiyat İstihbaratı</small>
          </span>
        </button>

        <nav className="header__nav" aria-label="Ana gezinme">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <button
              key={item.key}
              type="button"
              className={`header__nav-link header__nav-link--${item.key} ${isNavItemActive(item.key, activePage) ? "is-active" : ""}`}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="header__segment" role="group" aria-label="Pazar seçimi">
          <button type="button" aria-pressed={!isCpuPage} data-active={!isCpuPage} onClick={() => onNavigate("catalog")}>
            GPU
          </button>
          <button type="button" aria-pressed={isCpuPage} data-active={isCpuPage} onClick={() => onNavigate("cpu")}>
            CPU
          </button>
        </div>

        <div className="header__tools">
          <form
            className="header__search"
            title={`${listingCount.toLocaleString("tr-TR")} ilan · ${lastUpdated}`}
            onSubmit={(event) => {
              event.preventDefault();
              onSearchSubmit();
            }}
          >
            <Search size={15} />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={isCpuPage ? "Ara: işlemci, şehir…" : "Ara: model, şehir…"}
              aria-label={isCpuPage ? "Katalogda işlemci ara" : "Katalogda ekran kartı ara"}
            />
            <kbd aria-hidden="true">⌘K</kbd>
          </form>

          <span className="header__sync" title={`Son güncelleme: ${lastUpdated}`}>
            <span className="header__sync-dot" aria-hidden="true" />
            Son senkron {formatSyncLabel(lastUpdated)}
          </span>

          <button
            type="button"
            className="header__icon-btn header__icon-btn--theme"
            aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
            title={theme === "dark" ? "Açık tema" : "Koyu tema"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="header__notifications">
            <button
              type="button"
              className={`header__icon-btn header__icon-btn--notify ${isNotificationPanelOpen ? "is-active" : ""}`}
              aria-label="Bildirimler"
              aria-expanded={isNotificationPanelOpen}
              onClick={onToggleNotifications}
            >
              <Bell size={16} />
              {notificationCount > 0 ? <span aria-hidden="true" /> : null}
            </button>

            {isNotificationPanelOpen ? (
              <section className="header__notification-panel" aria-label="Bildirimler">
                <div className="header__notification-head">
                  <strong>Bildirimler</strong>
                  <span>{notificationCount > 0 ? `${notificationCount} yeni` : "Temiz"}</span>
                </div>

                {notificationCount > 0 ? (
                  <div className="header__notification-list">
                    {notifications.map((notification) => (
                      <button
                        type="button"
                        className={`header__notification-item header__notification-item--${notification.kind}`}
                        key={notification.id}
                        onClick={onNotificationSelect}
                      >
                        <span>{notification.title}</span>
                        <strong>{notification.detail}</strong>
                        <small>{notification.timeLabel}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="header__notification-empty">
                    {isSignedIn ? "Yayın veya yorum bildirimi yok." : "Bildirimleri görmek için giriş yap."}
                  </div>
                )}

                <button type="button" className="header__notification-action" onClick={onNotificationSelect}>
                  {isSignedIn ? "Hesabımdaki ilanlara git" : "Giriş / kayıt ekranına git"}
                </button>
              </section>
            ) : null}
          </div>

          {onOpenPortfolio ? (
            <button type="button" className="header__portfolio" onClick={onOpenPortfolio}>
              Portföyüm
              {portfolioCount > 0 ? <strong>{portfolioCount}</strong> : null}
            </button>
          ) : null}

          {isSignedIn ? (
            <button type="button" className="header__account-chip" aria-label="Hesap" onClick={() => onNavigate("submit-link")}>
              <UserCircle size={15} />
              <span>{accountLabel ?? "Hesabım"}</span>
            </button>
          ) : (
            <div className="header__auth-actions" aria-label="Oturum işlemleri">
              <button type="button" className="header__auth-link" onClick={() => onAuthNavigate("signin")}>
                Giriş yap
              </button>
              <button type="button" className="header__auth-primary" onClick={() => onAuthNavigate("signup")}>
                Kayıt ol
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
