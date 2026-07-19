"""FastAPI backend, controller-service-repository layout.

Layers (each sub-package's docstring states its single responsibility):
routers -> services -> repositories, with schemas as the wire contract and
models as the persistence entities. Dependencies point inward only — a router
never touches the database, a repository never sees HTTP.
"""
