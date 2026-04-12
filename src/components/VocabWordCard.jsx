import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export default function VocabWordCard({
  word,
  isBookmarked = false,
  onToggleBookmark,
  onSpeak,
  onMarkMastered,
}) {
  return (
    <Card className="vocab-card">
      <div className="row between">
        <div>
          <h3>{word.word}</h3>
          <p className="muted">{word.partOfSpeech || "-"} · {(word.source || []).join("/") || "-"}</p>
        </div>
        <button
          type="button"
          className={`star-btn ${isBookmarked ? "active" : ""}`}
          onClick={() => onToggleBookmark?.(word)}
          disabled={!onToggleBookmark}
        >
          {isBookmarked ? "★" : "☆"}
        </button>
      </div>

      <p><strong>中譯：</strong>{word.translation || "（待補）"}</p>
      {word.phonetic ? <p className="muted">音標：{word.phonetic}</p> : null}
      {word.definition ? <p className="muted">{word.definition}</p> : null}
      {word.example ? <p className="muted">例句：{word.example}</p> : null}

      <div className="row wrap">
        <Button variant="ghost" onClick={() => onSpeak?.(word)} disabled={!onSpeak}>🔊 發音</Button>
        <Button variant="secondary" onClick={() => onMarkMastered?.(word)} disabled={!onMarkMastered}>熟練 +1</Button>
      </div>
    </Card>
  );
}
