"""
一鍵題庫流程：產題 -> 翻譯 -> 打包。

使用：
    python scripts/07_question_pipeline.py --part all --count 40 --append --force-translate
"""
import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def run_cmd(cmd):
    print("\n$", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--part", default="all", help="5 / 6 / 7 / all")
    parser.add_argument("--count", type=int, default=40, help="產題數量（每個 Part）")
    parser.add_argument("--append", action="store_true", help="產題時追加到既有題庫")
    parser.add_argument("--force-translate", action="store_true", help="翻譯時強制覆蓋現有翻譯")
    parser.add_argument("--engine", default="gemini", choices=["gemini", "mymemory"],
                        help="翻譯主引擎")
    parser.add_argument("--fallback-engine", default="mymemory", choices=["none", "mymemory"],
                        help="翻譯後備引擎")
    parser.add_argument("--report", default="data/translation-report.json",
                        help="翻譯覆蓋報告輸出路徑")
    parser.add_argument("--translate-limit", type=int, default=0,
                        help="限制本次最多翻幾題（0=不限）")
    args = parser.parse_args()

    py = sys.executable

    gen_cmd = [
        py, "scripts/04_generate_questions.py",
        "--part", args.part,
        "--count", str(args.count),
    ]
    if args.append:
        gen_cmd.append("--append")
    run_cmd(gen_cmd)

    tr_cmd = [
        py, "scripts/06_translate_questions.py",
        "--part", args.part,
        "--engine", args.engine,
        "--fallback-engine", args.fallback_engine,
        "--require-complete",
        "--report", args.report,
    ]
    if args.force_translate:
        tr_cmd.append("--force")
    if args.translate_limit > 0:
        tr_cmd.extend(["--limit", str(args.translate_limit)])
    run_cmd(tr_cmd)

    run_cmd([py, "scripts/bundle_data.py"])

    print("\n✅ Pipeline 完成：題庫已更新、翻譯完整性已檢查、data/data.js 已打包。", flush=True)
    print(f"翻譯覆蓋報告：{args.report}", flush=True)


if __name__ == "__main__":
    main()
