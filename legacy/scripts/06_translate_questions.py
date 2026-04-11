"""
為題庫（questions-part5/6/7.json）補上繁體中文翻譯。

支援兩個翻譯引擎：
    --engine gemini    (品質好，但 Gemini 免費額度吃滿就 429，預設)
    --engine mymemory  (MyMemory Translation API，免註冊，5000 次/日，慢但穩)

為每道題新增欄位：
    - question_zh         題目中文
    - options_zh          選項中文（陣列，與 options 一一對應）
    - passage_zh          Part 6/7 的文章中文（同一 passage 只翻一次快取共用）

使用：
    python scripts/06_translate_questions.py --part all
    python scripts/06_translate_questions.py --part all --engine mymemory
    python scripts/06_translate_questions.py --part 5 --limit 10

已翻譯的題目預設會跳過。加 --force 才會覆蓋現有翻譯。
中斷可以直接重跑（預設會 skip 已翻譯的）。每翻 5 題會 flush 一次 JSON。

記得翻完要重跑 `python scripts/bundle_data.py` 才會更新 data/data.js。
"""
import argparse
import json
import time
import sys
from pathlib import Path

import requests

# Windows 中文系統的 stdout 需要強制 UTF-8
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from _common import DATA_DIR, load_config, load_json, save_json


PROMPT = """You are a professional English→Traditional Chinese (Taiwan) translator for TOEIC test materials.

Translate the following TOEIC question into Traditional Chinese (繁體中文,台灣用語).
Requirements:
- Translate the question sentence naturally.
- Translate each option into a short, accurate phrase.
- If a passage is provided, translate it too (keep line breaks).
- Use Taiwan business vocabulary. Do NOT use Simplified Chinese.
- Return ONLY a valid JSON object with the exact keys shown below. No markdown, no code fences, no extra commentary.

Input:
{input_json}

Output schema:
{{
  "question_zh": "...",
  "options_zh": ["...", "...", "...", "..."]{passage_field}
}}
"""


def is_text(v):
    return isinstance(v, str) and v.strip() != ""


def build_prompt(q):
    payload = {
        "question": q.get("question", ""),
        "options": q.get("options", []),
    }
    if q.get("passage"):
        payload["passage"] = q["passage"]
        passage_field = ',\n  "passage_zh": "..."'
    else:
        passage_field = ""
    return PROMPT.format(
        input_json=json.dumps(payload, ensure_ascii=False, indent=2),
        passage_field=passage_field,
    )


def call_gemini(config, prompt, retries=2):
    url = f"{config['gemini_endpoint']}/{config['gemini_model']}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": config["gemini_api_key"],
    }
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
        },
    }
    for attempt in range(retries + 1):
        try:
            r = requests.post(url, headers=headers, json=body, timeout=90)
            if r.status_code == 200:
                return r.json()["candidates"][0]["content"]["parts"][0]["text"]
            # 429 / 503 額度或流量問題 → 退避重試
            if r.status_code in (429, 503):
                wait = 5 * (attempt + 1)
                print(f"  ! {r.status_code} rate/quota limit, {wait}s 後重試…")
                time.sleep(wait)
                continue
            print(f"  ✗ Gemini {r.status_code}: {r.text[:200]}")
            return None
        except Exception as e:
            print(f"  ✗ 例外：{e}")
            if attempt < retries:
                time.sleep(2 ** attempt)
    return None


def mymemory_translate(text, retries=2):
    """MyMemory Translation API — en → zh-TW,免註冊免金鑰,每個 IP 每天 5000 次。"""
    if not text or not text.strip():
        return ""
    url = "https://api.mymemory.translated.net/get"
    params = {"q": text.strip()[:500], "langpair": "en|zh-TW"}
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, params=params, timeout=30)
            if r.status_code == 200:
                data = r.json()
                rd = data.get("responseData") or {}
                out = (rd.get("translatedText") or "").strip()
                # 若 API 回一個 rate-limit 標記字串,當作失敗
                if out and not out.lower().startswith("please") and "quota" not in out.lower():
                    return out
            if r.status_code in (429, 503):
                time.sleep(3 * (attempt + 1))
                continue
        except Exception as e:
            print(f"  ✗ MyMemory 例外:{e}")
            if attempt < retries:
                time.sleep(2 ** attempt)
    return ""


def translate_with_mymemory(q):
    """回傳 {question_zh, options_zh, passage_zh?}。失敗的欄位留空字串。"""
    out = {
        "question_zh": mymemory_translate(q.get("question", "")),
        "options_zh": [mymemory_translate(o) for o in q.get("options", [])],
    }
    if q.get("passage"):
        # passage 可能超過 500 字,分段翻譯
        passage = q["passage"]
        parts = []
        chunk = ""
        for line in passage.split("\n"):
            if len(chunk) + len(line) + 1 > 480 and chunk:
                parts.append(chunk)
                chunk = line
            else:
                chunk = (chunk + "\n" + line) if chunk else line
        if chunk:
            parts.append(chunk)
        translated = [mymemory_translate(p) for p in parts]
        out["passage_zh"] = "\n".join(translated)
    return out


def parse_json(text):
    if not text:
        return None
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
        print(f"  原始 (前 300 字)：{text[:300]}")
        return None


def already_translated(q):
    return question_complete(q)


def question_complete(q):
    question_ok = is_text(q.get("question_zh"))
    opts = q.get("options", [])
    opts_zh = q.get("options_zh") if isinstance(q.get("options_zh"), list) else []
    options_ok = len(opts_zh) == len(opts) and all(is_text(o) for o in opts_zh)
    passage_ok = True if not q.get("passage") else is_text(q.get("passage_zh"))
    return question_ok and options_ok and passage_ok


def question_missing_fields(q):
    missing = []
    if not is_text(q.get("question_zh")):
        missing.append("question_zh")
    opts = q.get("options", [])
    opts_zh = q.get("options_zh") if isinstance(q.get("options_zh"), list) else []
    if not (len(opts_zh) == len(opts) and all(is_text(o) for o in opts_zh)):
        missing.append("options_zh")
    if q.get("passage") and not is_text(q.get("passage_zh")):
        missing.append("passage_zh")
    return missing


def compute_part_coverage(part, path, questions):
    total = len(questions)
    question_zh_ready = 0
    options_zh_ready = 0
    passage_zh_ready = 0
    complete = 0
    missing_items = []

    for q in questions:
        q_ok = is_text(q.get("question_zh"))
        opts = q.get("options", [])
        opts_zh = q.get("options_zh") if isinstance(q.get("options_zh"), list) else []
        o_ok = len(opts_zh) == len(opts) and all(is_text(o) for o in opts_zh)
        p_ok = True if not q.get("passage") else is_text(q.get("passage_zh"))

        if q_ok:
            question_zh_ready += 1
        if o_ok:
            options_zh_ready += 1
        if p_ok:
            passage_zh_ready += 1

        if q_ok and o_ok and p_ok:
            complete += 1
        else:
            missing_items.append({
                "id": q.get("id", "?"),
                "missing": question_missing_fields(q),
            })

    return {
        "part": int(part),
        "path": str(path),
        "total": total,
        "complete": complete,
        "missing": total - complete,
        "question_zh_ready": question_zh_ready,
        "options_zh_ready": options_zh_ready,
        "passage_zh_ready": passage_zh_ready,
        "missing_items": missing_items,
    }


def apply_result_to_question(q, result, passage_cache):
    if not isinstance(result, dict):
        return

    q_zh = result.get("question_zh")
    if is_text(q_zh):
        q["question_zh"] = q_zh.strip()

    opts_zh = result.get("options_zh")
    if isinstance(opts_zh, list):
        cleaned = [str(o).strip() for o in opts_zh]
        if len(cleaned) == len(q.get("options", [])) and all(is_text(o) for o in cleaned):
            q["options_zh"] = cleaned

    if q.get("passage"):
        p_zh = result.get("passage_zh")
        if is_text(p_zh):
            q["passage_zh"] = p_zh.strip()
            passage_cache[q["passage"]] = q["passage_zh"]
        elif q["passage"] in passage_cache and is_text(passage_cache[q["passage"]]):
            q["passage_zh"] = passage_cache[q["passage"]]


def translate_with_gemini(config, q):
    prompt = build_prompt(q)
    text = call_gemini(config, prompt)
    return parse_json(text)


def translate_with_engine(engine, config, q, passage_cache):
    if engine == "gemini":
        return translate_with_gemini(config, q)
    if engine == "mymemory":
        if q.get("passage") and q["passage"] in passage_cache:
            q["passage_zh"] = passage_cache[q["passage"]]
        r = translate_with_mymemory(q)
        return r if r.get("question_zh") else None
    return None


def translate_file(part, config, engine, fallback_engine, force, limit):
    path = DATA_DIR / f"questions-part{part}.json"
    if not path.exists():
        print(f"跳過 Part {part}:檔案不存在 ({path})")
        return None

    data = load_json(path)
    questions = data.get("questions", [])
    total = len(questions)
    if total == 0:
        print(f"Part {part} 沒有題目。")
        return {
            "part": int(part),
            "path": str(path),
            "total": 0,
            "complete": 0,
            "missing": 0,
            "question_zh_ready": 0,
            "options_zh_ready": 0,
            "passage_zh_ready": 0,
            "missing_items": [],
            "translated": 0,
            "skipped": 0,
            "failed": 0,
            "fallback_used": 0,
        }

    # passage 快取:同文章只翻一次
    passage_cache = {}
    for q in questions:
        if q.get("passage") and q.get("passage_zh"):
            passage_cache[q["passage"]] = q["passage_zh"]

    done = 0
    skipped = 0
    failed = 0
    fallback_used = 0

    for idx, q in enumerate(questions):
        if limit and done >= limit:
            break

        if not force and already_translated(q):
            skipped += 1
            continue

        print(f"[Part {part}] {idx + 1}/{total} 翻譯中… ({q.get('id','?')}) [{engine}]", flush=True)

        engines = [engine]
        if fallback_engine != "none" and fallback_engine not in engines:
            engines.append(fallback_engine)

        translated = False
        for eng in engines:
            result = translate_with_engine(eng, config, q, passage_cache)
            if not result:
                continue

            apply_result_to_question(q, result, passage_cache)
            if question_complete(q):
                if eng != engine:
                    fallback_used += 1
                    print(f"  ↳ fallback 成功（{eng}）", flush=True)
                done += 1
                translated = True
                break

            print(f"  ! {eng} 回傳不完整，嘗試下一個引擎…", flush=True)

        if not translated:
            failed += 1
            miss = ",".join(question_missing_fields(q))
            print(f"  ✗ 翻譯失敗或不完整，缺少: {miss}", flush=True)
            time.sleep(1)
            continue

        if done % 5 == 0:
            save_json(path, data)
            print(f"  💾 已存 (Part {part}: +{done} 題新翻譯)", flush=True)

        time.sleep(0.3 if engine == "mymemory" else 0.5)

    save_json(path, data)
    coverage = compute_part_coverage(part, path, questions)
    coverage.update({
        "translated": done,
        "skipped": skipped,
        "failed": failed,
        "fallback_used": fallback_used,
    })
    print(
        f"\n✓ Part {part} 完成:翻譯 {done} 題,跳過(已有翻譯) {skipped} 題,失敗 {failed} 題, fallback {fallback_used} 次",
        flush=True,
    )
    print(
        f"  覆蓋率: {coverage['complete']}/{coverage['total']} 完整翻譯, 缺漏 {coverage['missing']}",
        flush=True,
    )
    return coverage


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--part", default="all", help="5 / 6 / 7 / all")
    parser.add_argument("--engine", default="gemini", choices=["gemini", "mymemory"],
                        help="gemini (品質好,但有 quota) / mymemory (免註冊,較穩)")
    parser.add_argument("--fallback-engine", default="none", choices=["none", "mymemory"],
                        help="主引擎失敗或回傳不完整時使用的後備引擎")
    parser.add_argument("--resume", action="store_true", help="(預設行為)跳過已翻譯的題目")
    parser.add_argument("--force", action="store_true", help="重新翻譯(會覆蓋現有翻譯)")
    parser.add_argument("--limit", type=int, default=0, help="限制本次最多翻幾題(0=不限)")
    parser.add_argument("--require-complete", action="store_true",
                        help="翻譯後若仍有缺漏欄位，回傳非 0 exit code")
    parser.add_argument("--report", default="", help="將覆蓋率報告輸出為 JSON 檔案")
    args = parser.parse_args()

    config = load_config() if args.engine == "gemini" else {}
    print(f"翻譯引擎:{args.engine}", flush=True)
    if args.fallback_engine != "none":
        print(f"後備引擎:{args.fallback_engine}", flush=True)

    parts = [5, 6, 7] if args.part == "all" else [int(args.part)]
    part_reports = []
    for p in parts:
        print(f"\n========== 翻譯 Part {p} ==========", flush=True)
        coverage = translate_file(
            p,
            config,
            args.engine,
            args.fallback_engine,
            args.force,
            args.limit,
        )
        if coverage:
            part_reports.append(coverage)

    total_questions = sum(r["total"] for r in part_reports)
    total_complete = sum(r["complete"] for r in part_reports)
    total_missing = sum(r["missing"] for r in part_reports)
    print(
        f"\n翻譯覆蓋總結: 完整 {total_complete}/{total_questions}，總缺漏 {total_missing}",
        flush=True,
    )

    if args.report:
        report_path = Path(args.report)
        report = {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "engine": args.engine,
            "fallback_engine": args.fallback_engine,
            "parts": part_reports,
            "overall": {
                "total": total_questions,
                "complete": total_complete,
                "missing": total_missing,
            },
        }
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✓ 已輸出覆蓋報告: {report_path}", flush=True)

    if args.require_complete and total_missing > 0:
        print("\n✗ require-complete 檢查失敗：仍有題目缺少翻譯欄位。", flush=True)
        for r in part_reports:
            if r["missing"] > 0:
                sample = ", ".join(i["id"] for i in r["missing_items"][:10])
                print(f"  Part {r['part']} 缺漏 {r['missing']} 題；樣本: {sample}", flush=True)
        sys.exit(1)

    print("\n全部完成。記得再跑一次:", flush=True)
    print("    python scripts/bundle_data.py", flush=True)
    print("才會更新 data/data.js,雙擊 HTML 才會看到新翻譯。", flush=True)


if __name__ == "__main__":
    main()
