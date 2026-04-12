import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchBookmarkIds, removeBookmark, reviewSrsWord, setBookmark } from "../lib/firestoreService";
import { loadVocabulary } from "../lib/localData";
import { speakEnglishWord } from "../lib/speech";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InputField } from "../ui/InputField";

const PAGE_SIZE = 30;

export default function VocabularyPage() {
  const { user } = useAuth();
  const [allWords, setAllWords] = useState([]);
  const [bookmarkIds, setBookmarkIds] = useState(new Set());
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [speechMessage, setSpeechMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const [words, bIds] = await Promise.all([
        loadVocabulary(),
        user?.uid ? fetchBookmarkIds(user.uid) : Promise.resolve(new Set()),
      ]);

      if (!active) return;
      setAllWords(words);
      setBookmarkIds(bIds);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allWords.filter((word) => {
      if (sourceFilter === "tsl" && !word.source?.includes("TSL")) return false;
      if (sourceFilter === "ngsl" && !word.source?.includes("NGSL")) return false;
      if (sourceFilter === "bookmark" && !bookmarkIds.has(word.id)) return false;

      if (!q) return true;
      return [word.word, word.translation, word.definition, word.example]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(q));
    });
  }, [allWords, bookmarkIds, query, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, sourceFilter]);

  async function toggleBookmark(word) {
    if (!user?.uid) return;

    if (bookmarkIds.has(word.id)) {
      await removeBookmark(user.uid, word.id);
      setBookmarkIds((prev) => {
        const next = new Set(prev);
        next.delete(word.id);
        return next;
      });
    } else {
      await setBookmark(user.uid, word);
      setBookmarkIds((prev) => new Set(prev).add(word.id));
    }
  }

  async function markMastered(word) {
    if (!user?.uid) return;
    await reviewSrsWord(user.uid, word, 2);
  }

  function speakWord(word) {
    const result = speakEnglishWord(word?.word, { lang: "en-US", rate: 0.92 });
    if (!result.ok) {
      setSpeechMessage(result.message);
      return;
    }
    setSpeechMessage(`正在播放：${word.word}`);
  }

  if (loading) return <Card>載入單字庫中...</Card>;

  return (
    <div className="stack-lg">
      <section className="hero-panel compact">
        <p className="eyebrow">VOCABULARY</p>
        <h2>單字庫</h2>
        <p className="muted">共 {allWords.length} 筆，支援搜尋、來源篩選、收藏與 SRS 熟練標記。</p>
      </section>

      <Card>
        <div className="row wrap">
          <InputField
            label="搜尋"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="輸入單字、中文或定義"
            className="grow-input"
          />

          <label className="field-wrap">
            <span className="field-label">篩選</span>
            <select className="field-input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="all">全部</option>
              <option value="tsl">TSL</option>
              <option value="ngsl">NGSL</option>
              <option value="bookmark">僅收藏</option>
            </select>
          </label>
        </div>

        <div className="row wrap">
          <Link className="link-btn" to="/review">去單字複習</Link>
          <Link className="link-btn ghost-link" to="/vocab-game">玩單字遊戲</Link>
          <p className="muted">結果：{filtered.length} 筆</p>
        </div>
      </Card>

      {speechMessage && <Banner>{speechMessage}</Banner>}

      <div className="stack-sm">
        {pageData.map((word) => {
          const isBookmarked = bookmarkIds.has(word.id);
          return (
            <Card key={word.id} className="vocab-card">
              <div className="row between">
                <div>
                  <h3>{word.word}</h3>
                  <p className="muted">{word.partOfSpeech || "-"} · {(word.source || []).join("/") || "-"}</p>
                </div>
                <button type="button" className={`star-btn ${isBookmarked ? "active" : ""}`} onClick={() => toggleBookmark(word)}>
                  {isBookmarked ? "★" : "☆"}
                </button>
              </div>

              <p><strong>中譯：</strong>{word.translation || "（待補）"}</p>
              {word.phonetic ? <p className="muted">音標：{word.phonetic}</p> : null}
              {word.definition ? <p className="muted">{word.definition}</p> : null}
              {word.example ? <p className="muted">例句：{word.example}</p> : null}

              <div className="row wrap">
                <Button variant="ghost" onClick={() => speakWord(word)}>🔊 發音</Button>
                <Button variant="secondary" onClick={() => markMastered(word)}>熟練 +1</Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div className="row between">
          <Button variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>上一頁</Button>
          <span>第 {page} / {totalPages} 頁</span>
          <Button variant="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>下一頁</Button>
        </div>
      </Card>
    </div>
  );
}
