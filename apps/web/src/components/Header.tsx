import { Bell, Moon, Search, Sun, UserCircle } from "lucide-react";
import "./Header.css";

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
  readonly isThemePreview: boolean;
  readonly onToggleThemePreview: () => void;
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
  isThemePreview,
  onToggleThemePreview,
}: HeaderProps) {
  const notificationCount = notifications.length;
  const isCpuPage = activePage === "cpu";

  return (
    <header className="header" id="site-header">
      <div className="header__inner">
        <button type="button" className="header__brand" onClick={() => onNavigate("home")}>
          <h1 className="header__title">GPU Pusula</h1>
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

        <div className="header__tools">
          <form
            className="header__search"
            title={`${listingCount.toLocaleString("tr-TR")} ilan · ${lastUpdated}`}
            onSubmit={(event) => {
              event.preventDefault();
              onSearchSubmit();
            }}
          >
            <Search size={18} />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={isCpuPage ? "İşlemci ara..." : "Ekran kartı ara..."}
              aria-label={isCpuPage ? "Katalogda işlemci ara" : "Katalogda ekran kartı ara"}
            />
          </form>

          <button
            type="button"
            className={`header__icon-btn header__icon-btn--theme ${isThemePreview ? "is-active" : ""}`}
            aria-label={isThemePreview ? "Açık temaya dön" : "Koyu temayı önizle"}
            title={isThemePreview ? "Açık temaya dön" : "Koyu temayı önizle"}
            onClick={onToggleThemePreview}
          >
            {isThemePreview ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="header__notifications">
            <button
              type="button"
              className={`header__icon-btn header__icon-btn--notify ${isNotificationPanelOpen ? "is-active" : ""}`}
              aria-label="Bildirimler"
              aria-expanded={isNotificationPanelOpen}
              onClick={onToggleNotifications}
            >
              <Bell size={20} />
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

          {isSignedIn ? (
            <button type="button" className="header__account-chip" aria-label="Hesap" onClick={() => onNavigate("submit-link")}>
              <UserCircle size={18} />
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
