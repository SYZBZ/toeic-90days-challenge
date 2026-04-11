"""
產生 90 天學習計畫：把所有單字依「TSL 優先、常用度」排序，平均拆進 90 天。

輸出：data/study-plan.json

使用：
    python scripts/03_generate_plan.py [--days 90]
"""
import argparse
from _common import DATA_DIR, load_json, save_json

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=90)
    args = parser.parse_args()

    vocab_path = DATA_DIR / "vocabulary.json"
    vocab = load_json(vocab_path)
    if not vocab or "words" not in vocab:
        print("✗ 找不到 vocabulary.json。請先執行 01 與 02 腳本。")
        return

    words = vocab["words"]

    # TSL 優先
    def priority(w):
        src = w.get("source", [])
        if "TSL" in src and "NGSL" in src: return 0  # 兩個都有的最高頻，最優先
        if "TSL" in src: return 1
        return 2

    sorted_words = sorted(words, key=priority)
    total = len(sorted_words)
    per_day = max(1, total // args.days)

    days = []
    idx = 0
    for d in range(args.days):
        chunk = sorted_words[idx : idx + per_day]
        if d == args.days - 1:
            chunk = sorted_words[idx:]  # 最後一天吃掉所有剩的
        days.append({
            "day": d + 1,
            "newWords": [w["id"] for w in chunk],
        })
        idx += per_day

    plan = {
        "targetDays": args.days,
        "totalWords": total,
        "wordsPerDay": per_day,
        "days": days,
    }
    save_json(DATA_DIR / "study-plan.json", plan)
    print(f"✓ 產生 {args.days} 天計畫")
    print(f"  每天約 {per_day} 字，總共 {total} 字")
    print(f"  輸出：{DATA_DIR / 'study-plan.json'}")
    print("\n下一步：python scripts/04_generate_questions.py")

if __name__ == "__main__":
    main()
