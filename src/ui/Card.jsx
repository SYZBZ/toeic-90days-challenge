export function Card({ children, className = "", elevated = false }) {
  return <section className={`st-card ${elevated ? "is-elevated" : ""} ${className}`.trim()}>{children}</section>;
}
