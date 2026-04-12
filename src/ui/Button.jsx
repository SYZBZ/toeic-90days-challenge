export function Button({
  children,
  variant = "primary",
  fullWidth = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`st-btn st-btn-${variant} ${fullWidth ? "full-width" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
