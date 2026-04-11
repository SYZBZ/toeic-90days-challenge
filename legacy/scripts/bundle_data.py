"""
把 data/*.json 打包成單一的 data/data.js，讓瀏覽器可以用 <script src> 直接載入，
就不用跑 Live Server 也不用開 HTTP server 了 — 雙擊 index.html 就能用。

使用：
    python scripts/bundle_data.py
"""
import json
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from _common import DATA_DIR

# 鍵名 → 檔名（app.js 的 loadJSON 用 'vocabulary.json' 等字串查詢）
BUNDLE = {
    "vocabulary.json": "vocabulary.json",
    "study-plan.json": "study-plan.json",
    "grammar.json": "grammar.json",
    "questions-part5.json": "questions-part5.json",
    "questions-part6.json": "questions-part6.json",
    "questions-part7.json": "questions-part7.json",
}


def main():
    bundle = {}
    total_bytes = 0
    for key, fname in BUNDLE.items():
        p = DATA_DIR / fname
        if not p.exists():
            print(f"  ✗ 找不到 {p}，略過")
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        bundle[key] = data
        size = p.stat().st_size
        total_bytes += size
        print(f"  ✓ {fname}: {size:,} bytes")

    out_path = DATA_DIR / "data.js"
    # 用 ensure_ascii=False 保留中文原樣，檔案會小一點
    js_content = (
        "// 自動產生的資料打包檔 — 由 scripts/bundle_data.py 生成\n"
        "// 讓雙擊 index.html (file://) 就能使用，不用跑 HTTP server\n"
        "// 如果要更新，重跑：python scripts/bundle_data.py\n"
        "window.BUNDLED_DATA = "
        + json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    out_path.write_text(js_content, encoding="utf-8")
    out_size = out_path.stat().st_size
    print(f"\n✓ 輸出：{out_path}")
    print(f"  檔案大小：{out_size:,} bytes ({out_size / 1024:.1f} KB)")
    print(f"  原始 JSON 總和：{total_bytes:,} bytes")


if __name__ == "__main__":
    main()
