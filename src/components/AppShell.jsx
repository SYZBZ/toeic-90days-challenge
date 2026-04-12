import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { NavBar } from "../ui/NavBar";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/practice", label: "Test", icon: "quiz" },
  { to: "/review", label: "Study", icon: "menu_book" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export default function AppShell() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <header className="st-topbar">
        <div className="st-topbar-inner">
          <div>
            <p className="eyebrow">THE ETHEREAL PLAYGROUND</p>
            <h1>Playground</h1>
          </div>
          <div className="topbar-right">
            <div className="topbar-chip">
              <span className="chip-icon" aria-hidden="true">🪙</span>
              <strong>1,240</strong>
            </div>
            <div className="topbar-chip">
              <span className="chip-icon" aria-hidden="true">💎</span>
              <strong>42</strong>
            </div>
            <img
              className="topbar-avatar"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCM4XTf6kPTVHMNyL9sf-zlM82S_JLVbq_rM-Llmp7irwjviID7R-U3VtDpY4QKjD6PPl8eZNSQer7l3Vt4O9SbKyCvY8dzjXZfvEBDTPY3cMxuqQWkD9CDE66oU2efgbVywv9jwy7b2ilkeGL6FGD-RECPqfUAayGTZtw5fhRp2lxBMsIdAGldBaPhdOYCDq16IJIewHs0pILa7W6jI95SwEcoD5V32KVjbc0efdGyLRnZJHXTP1T9entDKNJTreD5nNjLu9rn1UE"
              alt="User avatar"
            />
            <p className="muted topbar-email">{user?.email}</p>
          </div>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <NavBar links={links} />
    </div>
  );
}
