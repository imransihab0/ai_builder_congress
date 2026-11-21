import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
load_dotenv(BASE_DIR.parent / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.1")

# bdapps TAP API — set these to switch from simulation to the real sandbox
BDAPPS_APP_ID = os.getenv("BDAPPS_APP_ID", "")
BDAPPS_PASSWORD = os.getenv("BDAPPS_PASSWORD", "")
BDAPPS_BASE_URL = os.getenv("BDAPPS_BASE_URL", "https://developer.bdapps.com")

DATA_DIR = BASE_DIR / "data"
KB_DIR = DATA_DIR / "kb"
CHROMA_DIR = str(BASE_DIR / ".chroma")
DB_PATH = os.getenv("AGRISENSE_DB_PATH") or str(BASE_DIR / "agrisense.sqlite3")
CONVEX_URL = (
    os.getenv("CONVEX_URL") or os.getenv("NEXT_PUBLIC_CONVEX_URL") or ""
).rstrip("/")
CONVEX_DEPLOY_KEY = os.getenv("CONVEX_DEPLOY_KEY", "")

MAX_AGENT_ITERATIONS = 10
