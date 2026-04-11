"""共用函式：讀取設定檔、路徑、簡易 HTTP。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
CONFIG_PATH = ROOT / "config.local.json"

def ensure_dirs():
    DATA_DIR.mkdir(exist_ok=True)
    RAW_DIR.mkdir(exist_ok=True)

def load_config():
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"找不到 config.local.json（位置：{CONFIG_PATH}）")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, obj):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def load_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
