"""The domain exception base, and the one place a domain error's HTTP status is
decided.

Before this existed, every router handler wrapped its service call in a
try/except whose entire body was "this exception class means this status code".
That mapping was written out ~36 times across four routers, and repeated per
route rather than per exception: ``UserNotFoundError`` -> 404 appeared eight
times, ``OnboardingRequiredError`` -> 403 five times. It had already drifted —
the 429 built by hand in the IGDB and genres routers omitted the ``Retry-After``
header that the shared write guard sets.

The status code is a fixed property of the error, not of the route that raised
it, so it lives on the exception. ``register_error_handlers`` installs a single
handler; Starlette resolves handlers by walking the exception's MRO, so every
subclass below is covered by the one registration.

Adding a domain error now means giving it a status here, and nothing else: a new
route cannot forget to map it, which is the failure the old shape invited.
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class DomainError(Exception):
    """Base for errors that describe a rejected request rather than a bug.

    ``status_code`` is a class attribute so most subclasses set it in one line.
    Where the status depends on the instance (see ``UsernameError``, which is a
    conflict when a name is taken and unprocessable when it is malformed), the
    subclass assigns ``self.status_code`` in ``__init__`` and shadows it.
    """

    status_code: int = status.HTTP_400_BAD_REQUEST

    def headers(self) -> dict[str, str] | None:
        """Extra response headers. Only rate limiting uses this, for Retry-After."""
        return None


def register_error_handlers(app: FastAPI) -> None:
    """Install the single DomainError -> JSONResponse handler."""

    async def handle_domain_error(_request: Request, exc: Exception) -> JSONResponse:
        # Narrowed by registration: Starlette only routes DomainError here. The
        # signature stays `Exception` because that is what the framework's
        # handler protocol declares.
        assert isinstance(exc, DomainError)
        return JSONResponse(
            status_code=exc.status_code,
            # Same body shape FastAPI's own HTTPException produces, so clients
            # (and src/lib/meApi.ts, which reads `detail`) see no difference.
            content={"detail": str(exc)},
            headers=exc.headers(),
        )

    app.add_exception_handler(DomainError, handle_domain_error)
