import { NavLink } from "react-router-dom";

export function NavBar({
  desktopLinks,
  mobileLinks,
  collapsed = false,
  onToggleCollapse,
}) {
  return (
    <>
      <aside className="st-side-nav" aria-label="左側導覽列">
        <div className="side-brand">
          <div className="side-brand-mark" aria-hidden="true">
            <span className="material-symbols-outlined">school</span>
          </div>
          {!collapsed && (
            <div>
              <h2>多益衝刺</h2>
              <p className="muted">90 天挑戰 · 875</p>
            </div>
          )}
        </div>

        <div className="side-links">
          {desktopLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
              title={collapsed ? link.label : undefined}
            >
              <span className="material-symbols-outlined side-link-icon">{link.icon}</span>
              {!collapsed && <span className="side-link-label">{link.label}</span>}
            </NavLink>
          ))}
        </div>

        <button type="button" className="sidebar-toggle" onClick={onToggleCollapse}>
          <span className="material-symbols-outlined">swap_horiz</span>
          {!collapsed && <span>收合側欄</span>}
        </button>
      </aside>

      <nav className="st-nav" aria-label="手機底部導覽列">
        {mobileLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `st-nav-link ${isActive ? "active" : ""}`}
          >
            <span className="material-symbols-outlined st-nav-icon" aria-hidden="true">
              {link.icon}
            </span>
            <span className="st-nav-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
