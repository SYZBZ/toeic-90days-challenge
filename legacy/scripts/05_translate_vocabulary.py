"""
用 MyMemory Translation API 為 vocabulary.json 內的每個單字補上繁體中文翻譯。

MyMemory 是免費、無需金鑰的翻譯 API，每天 5000 次查詢額度。
免費版加上 email 參數可提升到 50000 次/日。

使用：
    python scripts/05_translate_vocabulary.py          # 第一次
    python scripts/05_translate_vocabulary.py --resume # 續跑只翻還沒翻的
    python scripts/05_translate_vocabulary.py --limit 100  # 測試用

輸出：覆寫 data/vocabulary.json，為每個 word 加上 translation 欄位。
"""
import argparse
import sys
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

# Windows 中文系統 stdout 強制 UTF-8
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from _common import DATA_DIR, load_json, save_json

API_URL = "https://api.mymemory.translated.net/get"


def translate_one(word, retries=2):
    """呼叫 MyMemory API 翻譯單字到繁體中文。"""
    params = {
        "q": word,
        "langpair": "en|zh-TW",
    }
    for attempt in range(retries + 1):
        try:
            r = requests.get(API_URL, params=params, timeout=15)
            if r.status_code == 200:
                data = r.json()
                if data.get("responseStatus") == 200 or data.get("responseStatus") == "200":
                    t = data.get("responseData", {}).get("translatedText", "")
                    # MyMemory 有時會回傳跟原文一樣的大寫（代表沒翻到）
                    if t and t.lower() != word.lower():
                        # 取第一個意思（MyMemory 常用逗號分隔多義）
                        parts = [p.strip() for p in t.replace("，", ",").split(",")]
                        parts = [p for p in parts if p and not p.isascii()]
                        if parts:
                            # 最多保留 2 個意思
                            return " / ".join(parts[:2])
                    return ""
                elif data.get("responseStatus") == 429:
                    print(f"    配額用盡，停止", flush=True)
                    return None  # 回 None 表示配額用盡
            elif r.status_code == 429:
                print(f"    429 rate limit, 等 5 秒", flush=True)
                time.sleep(5)
                continue
        except Exception as e:
            if attempt == retries:
                print(f"    ✗ {word}: {e}", flush=True)
        if attempt < retries:
            time.sleep(1)
    return ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", action="store_true", help="只翻還沒翻的")
    parser.add_argument("--limit", type=int, default=0, help="只處理前 N 字")
    parser.add_argument("--workers", type=int, default=8, help="並行數（預設 8）")
    args = parser.parse_args()

    vocab_path = DATA_DIR / "vocabulary.json"
    if not vocab_path.exists():
        print("✗ 找不到 data/vocabulary.json")
        sys.exit(1)

    vocab = load_json(vocab_path, {})
    words = vocab.get("words", [])
    if not words:
        print("✗ vocabulary.json 是空的")
        sys.exit(1)

    if args.resume:
        todo = [w for w in words if not w.get("translation")]
    else:
        todo = list(words)

    if args.limit > 0:
        todo = todo[: args.limit]

    print(f"  總單字：{len(words)}")
    print(f"  待翻譯：{len(todo)}")
    if not todo:
        print("✓ 全部已有翻譯")
        return

    done = 0
    ok = 0
    miss = 0
    quota_dead = False

    def worker(w):
        nonlocal quota_dead
        if quota_dead:
            return (w, None)
        result = translate_one(w["word"])
        if result is None:
            quota_dead = True
        return (w, result)

    try:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(worker, w): w for w in todo}
            for fut in as_completed(futures):
                w, t = fut.result()
                done += 1
                if t:
                    w["translation"] = t
                    ok += 1
                else:
                    miss += 1
                if done % 50 == 0 or done == len(todo):
                    print(f"  進度 {done}/{len(todo)}  ✓{ok}  ✗{miss}", flush=True)
                    save_json(vocab_path, vocab)  # 定期存檔
                if quota_dead:
                    print("  配額用盡，提前中止，已翻譯的內容已存檔", flush=True)
                    break
    finally:
        save_json(vocab_path, vocab)

    print(f"\n✓ 完成。成功 {ok}，失敗/跳過 {miss}")
    print(f"  輸出：{vocab_path}")
    if miss > 0:
        print(f"  想續跑：python scripts/05_translate_vocabulary.py --resume")


if __name__ == "__main__":
    main()
