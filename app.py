"""Hugging Face entrypoint; keep the portable trainer as the source of truth."""
import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).parent / "Modelmaker-repair" / "app.py"), run_name="__main__")
