"""
用 Gemini API 生成 TOEIC Part 5 / 6 / 7 練習題。

使用：
    python scripts/04_generate_questions.py --part 5 --count 50
    python scripts/04_generate_questions.py --part all        # 一次生成三種

輸出：
    data/questions-part5.json
    data/questions-part6.json
    data/questions-part7.json
"""
import argparse
import json
import time
import uuid
import sys
import requests

# Windows 中文系統的 stdout 需要強制 UTF-8
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from _common import DATA_DIR, load_config, load_json, save_json

PROMPTS = {
    5: """You are a TOEIC exam question writer. Generate {n} ORIGINAL TOEIC Part 5 questions (single-sentence fill-in-the-blank).

Requirements:
- Business/workplace context
- Difficulty: TOEIC 800+ level
- Test grammar, vocabulary, or word forms
- Each question has exactly 4 options (A/B/C/D), only 1 correct
- Provide explanation in Traditional Chinese

Output STRICT JSON ONLY (no markdown, no code fences, no extra text):
{{
  "questions": [
    {{
      "question": "The new policy will take effect ____ next Monday.",
      "options": ["at", "in", "on", "by"],
      "answer": 2,
      "explanation": "日期前用 on (next Monday)"
    }}
  ]
}}

Generate {n} questions now. Return ONLY the JSON object, nothing else.""",

    6: """You are a TOEIC exam question writer. Generate {n} ORIGINAL TOEIC Part 6 passages. Each passage is a short business text (email, memo, notice) of 60-100 words with EXACTLY 4 blanks.

Requirements:
- Realistic business/workplace context
- Difficulty: TOEIC 800+ level
- 4 blanks per passage; each blank has 4 options (A/B/C/D); only 1 correct
- Mix grammar, vocabulary, and sentence insertion questions
- Explanations in Traditional Chinese

Output STRICT JSON ONLY:
{{
  "passages": [
    {{
      "passage": "Dear team,\\n\\nWe are pleased to ______ (1) that our quarterly sales ...",
      "blanks": [
        {{
          "num": 1,
          "options": ["announce", "announcing", "announced", "announcement"],
          "answer": 0,
          "explanation": "pleased to + V 原形"
        }}
      ]
    }}
  ]
}}

Generate {n} passages now. Return ONLY the JSON object.""",

    7: """You are a TOEIC exam question writer. Generate {n} ORIGINAL TOEIC Part 7 reading comprehension sets. Each set has a short business passage (80-150 words) followed by 2-3 multiple-choice questions.

Requirements:
- Realistic business contexts: emails, notices, articles, schedules
- Difficulty: TOEIC 800+ level
- Each question has 4 options (A/B/C/D), only 1 correct
- Include inference, detail, main idea type questions
- Explanations in Traditional Chinese

Output STRICT JSON ONLY:
{{
  "sets": [
    {{
      "passage": "Subject: Office Renovation\\n\\nDear staff,\\n\\nPlease note that our office...",
      "questions": [
        {{
          "question": "What is the main purpose of the memo?",
          "options": [
            "To announce a new employee",
            "To inform about office renovation",
            "To request a budget",
            "To cancel a meeting"
          ],
          "answer": 1,
          "explanation": "第一段主題句提到 Office Renovation。"
        }}
      ]
    }}
  ]
}}

Generate {n} sets now. Return ONLY the JSON object.""",
}

def call_gemini(config, prompt, retries=2):
    url = f"{config['gemini_endpoint']}/{config['gemini_model']}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": config["gemini_api_key"],
    }
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.9,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        }
    }
    for attempt in range(retries + 1):
        try:
            r = requests.post(url, headers=headers, json=body, timeout=120)
            if r.status_code == 200:
                data = r.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return text
            else:
                print(f"  ✗ Gemini API {r.status_code}: {r.text[:300]}")
        except Exception as e:
            print(f"  ✗ 例外：{e}")
        if attempt < retries:
            time.sleep(2 ** attempt)
    return None

def parse_json(text):
    if not text:
        return None
    # 去掉 markdown code fence
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```")[1]
        if t.startswith("json"):
            t = t[4:]
        t = t.strip("` \n")
    try:
        return json.loads(t)
    except Exception as e:
        print(f"  JSON 解析失敗：{e}")
        print(f"  原始內容前 500 字：{text[:500]}")
        return None

def flatten_part5(raw):
    """Part 5: 已經是 {questions: [...]} 結構"""
    out = []
    for q in (raw or {}).get("questions", []):
        q_id = "p5_" + uuid.uuid4().hex[:8]
        out.append({
            "id": q_id,
            "type": "part5",
            "question": q.get("question", ""),
            "options": q.get("options", []),
            "answer": int(q.get("answer", 0)),
            "explanation": q.get("explanation", ""),
        })
    return out

def flatten_part6(raw):
    """Part 6: 每個 passage 展開為多題，共享 passage。"""
    out = []
    for p in (raw or {}).get("passages", []):
        passage = p.get("passage", "")
        for b in p.get("blanks", []):
            q_id = "p6_" + uuid.uuid4().hex[:8]
            num = b.get("num", "")
            out.append({
                "id": q_id,
                "type": "part6",
                "passage": passage,
                "question": f"空格 ({num})",
                "options": b.get("options", []),
                "answer": int(b.get("answer", 0)),
                "explanation": b.get("explanation", ""),
            })
    return out

def flatten_part7(raw):
    out = []
    for s in (raw or {}).get("sets", []):
        passage = s.get("passage", "")
        for q in s.get("questions", []):
            q_id = "p7_" + uuid.uuid4().hex[:8]
            out.append({
                "id": q_id,
                "type": "part7",
                "passage": passage,
                "question": q.get("question", ""),
                "options": q.get("options", []),
                "answer": int(q.get("answer", 0)),
                "explanation": q.get("explanation", ""),
            })
    return out

def generate_part(config, part, target_count):
    # 一次請 10 題，累積到目標
    batch = 10 if part == 5 else (5 if part == 6 else 3)
    all_q = []
    rounds = max(1, (target_count + batch - 1) // batch)
    print(f"  → Part {part}: 計畫 {rounds} 批 × {batch}")
    for i in range(rounds):
        prompt = PROMPTS[part].format(n=batch)
        print(f"  第 {i+1}/{rounds} 批…")
        text = call_gemini(config, prompt)
        raw = parse_json(text)
        if part == 5:
            items = flatten_part5(raw)
        elif part == 6:
            items = flatten_part6(raw)
        else:
            items = flatten_part7(raw)
        print(f"    ✓ 取得 {len(items)} 題")
        all_q.extend(items)
        if len(all_q) >= target_count:
            break
        time.sleep(1)
    return all_q[:target_count] if target_count > 0 else all_q

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--part", default="all", help="5 / 6 / 7 / all")
    parser.add_argument("--count", type=int, default=30, help="每個 Part 的題數")
    parser.add_argument("--append", action="store_true", help="追加到現有題庫")
    args = parser.parse_args()

    config = load_config()
    parts = [5, 6, 7] if args.part == "all" else [int(args.part)]

    for part in parts:
        print(f"\n========== 生成 Part {part} ==========")
        out_path = DATA_DIR / f"questions-part{part}.json"
        existing = []
        if args.append and out_path.exists():
            existing = load_json(out_path, {}).get("questions", [])
            print(f"  現有 {len(existing)} 題")

        new_q = generate_part(config, part, args.count)
        all_q = existing + new_q
        save_json(out_path, {"part": part, "questions": all_q})
        print(f"✓ 寫入 {out_path}（共 {len(all_q)} 題）")

    print("\n全部完成。開啟 index.html 即可使用。")

if __name__ == "__main__":
    main()
