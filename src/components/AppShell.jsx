import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchSummary } from "../lib/firestoreService";
import { NavBar } from "../ui/NavBar";

const desktopLinks = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/progress", label: "進度頁", icon: "monitoring" },
  { to: "/vocabulary", label: "單字庫", icon: "library_books" },
  { to: "/daily-vocab", label: "每日單字", icon: "today" },
  { to: "/review", label: "單字複習", icon: "cycle" },
  { to: "/vocab-game", label: "單字遊戲", icon: "sports_esports" },
  { to: "/practice", label: "考試", icon: "quiz" },
  { to: "/grammar", label: "語法", icon: "menu_book" },
  { to: "/mistakes", label: "錯題本", icon: "error" },
  { to: "/settings", label: "設定", icon: "settings" },
];

const mobileLinks = [
  { to: "/dashboard", label: "首頁", icon: "dashboard" },
  { to: "/vocabulary", label: "單字", icon: "library_books" },
  { to: "/daily-vocab", label: "每日", icon: "today" },
  { to: "/practice", label: "考試", icon: "quiz" },
  { to: "/mistakes", label: "錯題", icon: "error" },
  { to: "/settings", label: "設定", icon: "settings" },
];

function maybeSendReminder(profile) {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  const reminder = profile?.settings?.reminder;
  if (!reminder?.enabled || Notification.permission !== "granted") return;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  if (`${hh}:${mm}` !== reminder.time) return;

  const today = now.toISOString().slice(0, 10);
  const key = `toeic.reminder.sent.${today}`;
  if (localStorage.getItem(key)) return;

  new Notification("TOEIC 90 Days", {
    body: "該回來打卡了，今天完成一回合就很棒。",
    icon: `${import.meta.env.BASE_URL}icons/icon-192.svg`,
  });
  localStorage.setItem(key, "1");
}

export default function AppShell() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("toeic.sidebar.collapsed") === "1");

  useEffect(() => {
    localStorage.setItem("toeic.sidebar.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.uid) return;
      const s = await fetchSummary(user.uid);
      if (!active) return;
      setSummary(s || null);
    }

    load();
    const timer = setInterval(load, 30000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user?.uid, location.pathname]);

  useEffect(() => {
    maybeSendReminder(profile);
    const timer = setInterval(() => maybeSendReminder(profile), 30000);
    return () => clearInterval(timer);
  }, [profile?.settings?.reminder?.enabled, profile?.settings?.reminder?.time]);

  const masteredWords = summary?.masteredWords || 0;
  const streakDays = summary?.streakDays || 0;

  const avatarText = useMemo(() => {
    const email = user?.email || "U";
    return String(email).slice(0, 1).toUpperCase();
  }, [user?.email]);

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <header className="st-topbar">
        <div className="st-topbar-inner">
          <div>
            <p className="eyebrow">TOEIC 90 DAYS CHALLENGE</p>
            <h1>多益衝刺</h1>
          </div>
          <div className="topbar-right">
            <div className="topbar-chip" title="已熟練單字">
              <span className="chip-icon" aria-hidden="true">📘</span>
              <strong>{masteredWords}</strong>
            </div>
            <div className="topbar-chip" title="連續學習天數">
              <span className="chip-icon" aria-hidden="true">🔥</span>
              <strong>{streakDays}</strong>
            </div>
            <div className="topbar-avatar-fallback" aria-hidden="true">{avatarText}</div>
            <p className="muted topbar-email">{user?.email}</p>
          </div>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <NavBar
        desktopLinks={desktopLinks}
        mobileLinks={mobileLinks}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
    </div>
  );
}
