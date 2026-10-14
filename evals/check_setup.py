"""Phase 0 sanity check: is Python right, and can we see the API key?

Prints only whether the key exists — never the key itself.
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()  # reads evals/.env into environment variables

print(f"Python {sys.version.split()[0]}")
key = os.getenv("OPENAI_API_KEY", "")
if key.startswith("sk-") and key != "sk-...":
    print("OPENAI_API_KEY found ✓")
else:
    print("OPENAI_API_KEY missing — copy .env.example to .env and paste your key")
