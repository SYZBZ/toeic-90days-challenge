"""
下載 TOEIC Service List (TSL) 與 New General Service List (NGSL) 的原始字表。

資料來源：https://github.com/koba-ninkigumi/ngsl （CC BY-SA 4.0 授權）
  - TSL-1.1_en.csv  : 1200+ 多益高頻字（含簡易定義）
  - NGSL-1.01.csv   : 2800 日常高頻字

使用：
    python scripts/01_download_wordlists.py
"""
import sys
import csv
import io
import requests

# Windows 中文系統的 stdout 需要強制 UTF-8 才能印非 ASCII
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from _common import ensure_dirs, RAW_DIR, save_json

TSL_URL = "https://raw.githubusercontent.com/koba-ninkigumi/ngsl/master/TSL-1.1_en.csv"
NGSL_URL = "https://raw.githubusercontent.com/koba-ninkigumi/ngsl/master/NGSL-1.01.csv"

def download(url, label):
    print(f"  下載：{label}")
    print(f"    {url}")
    r = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    print(f"    -> {len(r.text)} bytes")
    return r.text

def parse_tsl(text):
    """TSL CSV 有欄位 'TSL Word', 'TSL Definition'"""
    result = []
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    for row in reader:
        if not row or not row[0]:
            continue
        word = row[0].strip().lower()
        definition = row[1].strip() if len(row) > 1 else ""
        if word and all(c.isalpha() or c == "-" or c == " " for c in word):
            result.append({"word": word, "fallback_def": definition})
    return result

def parse_ngsl(text):
    """NGSL CSV 沒有 header，第一欄就是 headword，其餘是變化形"""
    result = []
    reader = csv.reader(io.StringIO(text))
    for row in reader:
        if not row or not row[0]:
            continue
        word = row[0].strip().lower()
        if word and all(c.isalpha() or c == "-" for c in word):
            result.append({"word": word})
    return result

def main():
    ensure_dirs()

    print("[1/2] TSL")
    try:
        tsl_text = download(TSL_URL, "TOEIC Service List")
        (RAW_DIR / "tsl.csv").write_text(tsl_text, encoding="utf-8")
        tsl_words = parse_tsl(tsl_text)
    except Exception as e:
        print(f"    失敗：{e}")
        tsl_words = []
    print(f"    TSL: {len(tsl_words)} 字")

    print("\n[2/2] NGSL")
    try:
        ngsl_text = download(NGSL_URL, "New General Service List")
        (RAW_DIR / "ngsl.csv").write_text(ngsl_text, encoding="utf-8")
        ngsl_words = parse_ngsl(ngsl_text)
    except Exception as e:
        print(f"    失敗：{e}")
        ngsl_words = []
    print(f"    NGSL: {len(ngsl_words)} 字")

    if not tsl_words and not ngsl_words:
        print("\n[x] 兩份字表都下載失敗，請檢查網路連線。")
        sys.exit(1)

    # 合併，TSL 優先
    by_word = {}
    for w in tsl_words:
        by_word[w["word"]] = {
            "word": w["word"],
            "source": ["TSL"],
            "fallback_def": w.get("fallback_def", ""),
        }
    for w in ngsl_words:
        if w["word"] in by_word:
            by_word[w["word"]]["source"].append("NGSL")
        else:
            by_word[w["word"]] = {
                "word": w["word"],
                "source": ["NGSL"],
                "fallback_def": "",
            }

    combined = list(by_word.values())
    save_json(RAW_DIR / "combined_words.json", combined)
    print(f"\n[OK] 合併完成：共 {len(combined)} 字")
    print(f"     輸出：{RAW_DIR / 'combined_words.json'}")
    print("\n下一步：python scripts/02_enrich_vocabulary.py")

if __name__ == "__main__":
    main()
