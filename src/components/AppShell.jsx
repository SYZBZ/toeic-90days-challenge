import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/dashboard", label: "首頁" },
  { to: "/practice", label: "刷題" },
  { to: "/review", label: "錯題" },
  { to: "/settings", label: "設定" },
];

export default function AppShell() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>TOEIC 90 Days</h1>
          <p className="muted">{user?.email}</p>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="主選單">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
