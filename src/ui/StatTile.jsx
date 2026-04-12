import { Card } from "./Card";

export function StatTile({ title, value, hint }) {
  return (
    <Card className="stat-tile">
      <p className="stat-title">{title}</p>
      <p className="stat-value">{value}</p>
      {hint ? <p className="muted">{hint}</p> : null}
    </Card>
  );
}
