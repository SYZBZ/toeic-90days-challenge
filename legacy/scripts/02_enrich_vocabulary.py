"""
對合併後的單字清單，呼叫 Free Dictionary API 補上：
  - 音標 (phonetic)
  - 詞性與定義 (definition)
  - 例句 (example)

輸出：data/vocabulary.json

使用：
    python scripts/02_enrich_vocabulary.py [--limit N]
"""
import sys
import time
import json
import argparse
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Windows 中文系統的 stdout 需要強制 UTF-8
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from _common import ensure_dirs, DATA_DIR, RAW_DIR, load_config, save_json, load_json

def fetch_definition(word, endpoint, retries=2):
    url = f"{endpoint}/{word}"
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, timeout=8)
            if r.status_code == 200:
                data = r.json()
                return data[0] if isinstance(data, list) and data else None
            if r.status_code == 404:
                return None
        except Exception:
            time.sleep(0.5)
    return None

def extract(entry):
    """從 Free Dictionary API 回傳物件抽出我們要的欄位。"""
    if not entry:
        return {"phonetic": "", "definition": "", "example": "", "partOfSpeech": ""}
    phonetic = entry.get("phonetic", "")
    if not phonetic:
        for p in entry.get("phonetics", []):
            if p.get("text"):
                phonetic = p["text"]
                break
    # 取第一個意思
    definition = ""
    example = ""
    pos = ""
    meanings = entry.get("meanings", [])
    if meanings:
        pos = meanings[0].get("partOfSpeech", "")
        defs = meanings[0].get("definitions", [])
        if defs:
            definition = defs[0].get("definition", "")
            example = defs[0].get("example", "") or ""
    return {
        "phonetic": phonetic,
        "definition": definition,
        "example": example,
        "partOfSpeech": pos,
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="只處理前 N 個字（0=全部）")
    parser.add_argument("--resume", action="store_true", help="從上次中斷的地方繼續")
    args = parser.parse_args()

    ensure_dirs()
    config = load_config()
    endpoint = config["dictionary_api"]

    combined_path = RAW_DIR / "combined_words.json"
    if not combined_path.exists():
        print("✗ 找不到 combined_words.json。請先執行 01_download_wordlists.py")
        sys.exit(1)

    combined = load_json(combined_path, [])
    if args.limit > 0:
        combined = combined[:args.limit]

    out_path = DATA_DIR / "vocabulary.json"
    existing = {}
    if args.resume and out_path.exists():
        prev = load_json(out_path, {})
        if prev and "words" in prev:
            for w in prev["words"]:
                existing[w["word"]] = w
            print(f"  續跑：已有 {len(existing)} 筆快取")

    total = len(combined)
    ok = 0
    miss = 0

    # 先把 cache 裡的直接放入
    enriched = []
    todo = []
    for item in combined:
        if item["word"] in existing:
            enriched.append(existing[item["word"]])
        else:
            todo.append(item)
    ok = len(enriched)
    print(f"  待處理：{len(todo)}（已快取 {ok}）")

    def process_one(item):
        word = item["word"]
        entry = fetch_definition(word, endpoint)
        info = extract(entry)
        if not info["definition"] and item.get("fallback_def"):
            info["definition"] = item["fallback_def"]
        return {
            "id": word,
            "word": word,
            "source": item["source"],
            **info,
        }

    done = 0
    results_buf = []
    # 20 條連線平行打 Free Dictionary API
    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = {pool.submit(process_one, it): it for it in todo}
        for fut in as_completed(futures):
            try:
                r = fut.result()
            except Exception as e:
                it = futures[fut]
                r = {"id": it["word"], "word": it["word"], "source": it["source"],
                     "phonetic": "", "definition": it.get("fallback_def", ""), "example": "", "partOfSpeech": ""}
            results_buf.append(r)
            if r["definition"]:
                ok += 1
            else:
                miss += 1
            done += 1
            if done % 50 == 0 or done == len(todo):
                print(f"  進度 {done}/{len(todo)}  ✓{ok}  ✗{miss}", flush=True)
                save_json(out_path, {"words": enriched + results_buf, "version": 1})

    enriched.extend(results_buf)

    save_json(out_path, {"words": enriched, "version": 1})
    print(f"\n✓ 完成。輸出 {out_path}")
    print(f"  成功 {ok}，查無 {miss}，共 {len(enriched)} 字")
    print("\n下一步：python scripts/03_generate_plan.py")

if __name__ == "__main__":
    main()
