export function Banner({ children, tone = "info" }) {
  return <p className={`st-banner st-banner-${tone}`} role="status">{children}</p>;
}
