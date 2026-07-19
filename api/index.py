"""Vercel Python entrypoint.

Vercel loads the module-level ``app`` variable from this file as the ASGI
handler for the ``api/`` serverless function. Keep this file to a single
import + instantiation — all application code lives in the ``app`` package.
"""

from app.main import create_app

app = create_app()
