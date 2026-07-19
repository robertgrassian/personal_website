"""Vercel Python entrypoint.

Vercel loads the module-level ``app`` variable from this file as the ASGI
handler for the ``api/`` serverless function. All application code lives in
the ``app`` package.

Vercel imports this file by path with the bundle root (the repo root,
/var/task) on sys.path — the ``app`` package at api/app is not importable
from there. Locally, uvicorn runs with cwd=api/ so it is. Prepending this
file's own directory covers both without affecting local imports.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.main import create_app

app = create_app()
