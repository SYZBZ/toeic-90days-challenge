import { NavLink } from "react-router-dom";

export function NavBar({ links }) {
  return (
    <>
      <aside className="st-side-nav" aria-label="Desktop navigation">
        <div className="side-brand">
          <img
            alt="Mascot"
            className="side-brand-avatar"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBq00z92Ifrl0dhFkbNCmxkv3KI6bN1vqia8yHOzZZsgQT8KNI9xOx5Tb4fyIbByQSxb3z-Y6dq9aI9oKnVIQgdhISXdjLmhm9-DRhQN2VHtDVCDfFdXu68tEeBJ11adgBNajhdXsju5IdDSwKtzDiVkU9e0hdlu25YOFUjC36IMByTc9bvFyfs0po2DgGaZQx8s08Do5GwRSheLx0ZROYDpy6Xc-C1CWNZYIJH_RzxxTx6Skf7Hl20sXZ-gu21Ht7Ua7MrpjLBLE0"
          />
          <div>
            <h2>Playground</h2>
            <p className="muted">Level 12 Scholar</p>
          </div>
        </div>

        <div className="side-links">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              <span className="side-link-icon">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="side-quest">
          <p className="quest-label">DAILY QUEST</p>
          <p>Collect 50 words</p>
        </div>
      </aside>

      <nav className="st-nav" aria-label="Mobile navigation">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `st-nav-link ${isActive ? "active" : ""}`}
          >
            <span className="st-nav-icon" aria-hidden="true">{link.icon}</span>
            <span className="st-nav-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
