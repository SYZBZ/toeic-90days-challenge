export function InputField({ label, id, className = "", ...props }) {
  const inputId = id || props.name || label;

  return (
    <label className={`field-wrap ${className}`.trim()} htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input id={inputId} className="field-input" {...props} />
    </label>
  );
}
