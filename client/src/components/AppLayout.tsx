import React, { useContext, useState, useEffect } from "react";
import { LanguageContext } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  userEmail?: string | null;
  onGoogleLogin?: () => void;
  onLogout?: () => void;
  isGoogleReady?: boolean;
  fullWidthContent?: boolean;
}

const NAV_ITEMS = [
  { id: "main", icon: "📹", labelKey: "sidebarVideoUploader" },
  { id: "slideshow", icon: "🎬", labelKey: "sidebarSlideshow" },
  { id: "admin", icon: "⚙️", labelKey: "sidebarAdmin" },
  { id: "terms", icon: "📄", labelKey: "sidebarTerms" },
];

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  currentPage,
  onNavigate,
  userEmail,
  onGoogleLogin,
  onLogout,
  isGoogleReady = true,
  fullWidthContent = false,
}) => {
  const { t } = useContext(LanguageContext);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) setSidebarOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNav = (pageId: string) => {
    onNavigate(pageId);
    if (!isDesktop) setSidebarOpen(false);
  };

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {sidebarOpen && !isDesktop && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`app-sidebar ${isDesktop ? "sidebar-desktop" : ""} ${sidebarOpen ? "sidebar-open" : ""}`}>
        {/* Sidebar Header */}
        <div className="sidebar-header">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663317876169/nN7fRv522pr6qmVvUdeAQB/cpv-favicon-mm647eWJko9itpHnxyFRzi.png"
            alt="CPV"
            className="sidebar-logo"
          />
          <div className="sidebar-brand">
            <span className="sidebar-brand-title">CPV Uploader</span>
            <span className="sidebar-brand-subtitle">Meta CPAS Tools</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${currentPage === item.id ? "active" : ""}`}
              onClick={() => handleNav(item.id)}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-lang">
            <LanguageSwitcher />
          </div>
          {userEmail ? (
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-email" title={userEmail}>{userEmail}</span>
                <button onClick={onLogout} className="sidebar-logout-btn">
                  {t("logout")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onGoogleLogin}
              disabled={!isGoogleReady}
              className="sidebar-login-btn"
            >
              <span className="sidebar-nav-icon">G</span>
              <span>{isGoogleReady ? t("loginWithGoogle") : t("initializing")}</span>
            </button>
          )}
          <div className="sidebar-powered">
            {t("poweredBy")}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="app-main">
        {/* Mobile Top Bar */}
        {!isDesktop && (
          <div className="mobile-topbar">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="mobile-topbar-title">
              {NAV_ITEMS.find((i) => i.id === currentPage)?.icon}{" "}
              {t(NAV_ITEMS.find((i) => i.id === currentPage)?.labelKey || "")}
            </span>
            <div style={{ width: 40 }} />
          </div>
        )}
        <div className={`app-content${fullWidthContent ? ' app-content--full-width' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
};
