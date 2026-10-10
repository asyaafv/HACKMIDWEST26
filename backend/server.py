"""Compatibility launcher for Gate's TypeScript API; configuration comes from backend/.env."""
from pathlib import Path
import subprocess

if __name__ == "__main__":
    raise SystemExit(subprocess.call(
        ["node", "--env-file-if-exists=.env", "--import", "tsx", "src/main.ts"],
        cwd=Path(__file__).resolve().parent,
    ))
