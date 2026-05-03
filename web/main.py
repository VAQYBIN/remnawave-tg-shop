import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from redis.asyncio import Redis
from config.settings import get_settings

logger = logging.getLogger(__name__)

_CLEANUP_INTERVAL_SECONDS = 10 * 60  # run every 10 minutes


async def _payment_cleanup_loop(session_factory) -> None:
    """Background task: expire stale pending payments every 10 minutes."""
    from core.dal.payment_dal import expire_stale_pending_payments

    while True:
        try:
            await asyncio.sleep(_CLEANUP_INTERVAL_SECONDS)
            async with session_factory() as session:
                count = await expire_stale_pending_payments(session)
                await session.commit()
                if count:
                    logger.info("Payment cleanup: expired %d stale payment(s).", count)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Payment cleanup task error: %s", exc, exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings = get_settings()
    app.state.settings = settings
    app.state.redis = Redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)

    from web.dependencies import _get_session_factory
    cleanup_task = asyncio.create_task(
        _payment_cleanup_loop(_get_session_factory()),
        name="payment-cleanup",
    )
    app.state.cleanup_task = cleanup_task

    yield

    # Shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await app.state.redis.aclose()


def create_app() -> FastAPI:
    settings = get_settings()

    docs_enabled = settings.WEB_DOCS_ENABLED

    app = FastAPI(
        title="Raccoonito Web API",
        version="1.0.0",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
        lifespan=lifespan,
    )

    origins = [o.strip() for o in settings.WEB_CORS_ORIGINS.split(",") if o.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    allowed_origins_set = set(origins)

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        origin = request.headers.get("origin", "")
        cors_headers = {}
        if origin in allowed_origins_set:
            cors_headers["Access-Control-Allow-Origin"] = origin
            cors_headers["Access-Control-Allow-Credentials"] = "true"
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
            headers=cors_headers,
        )

    from web.routers import health
    app.include_router(health.router, prefix="/api")

    from web.auth.router import router as auth_router
    app.include_router(auth_router, prefix="/api")

    from web.routers.profile import router as profile_router
    app.include_router(profile_router, prefix="/api")

    from web.routers.subscription import router as subscription_router
    app.include_router(subscription_router, prefix="/api")

    from web.routers.payment import router as payment_router
    app.include_router(payment_router, prefix="/api")

    from web.routers.promo import router as promo_router
    app.include_router(promo_router, prefix="/api")

    from web.routers.referral import router as referral_router
    app.include_router(referral_router, prefix="/api")

    from web.routers.devices import router as devices_router
    app.include_router(devices_router, prefix="/api")

    from web.routers.news import router as news_router
    app.include_router(news_router, prefix="/api")

    from web.routers.admin import admin_router
    app.include_router(admin_router, prefix="/api")

    from web.routers.config import router as config_router
    app.include_router(config_router, prefix="/api")

    # Static files (logos, favicons)
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    os.makedirs(static_dir, exist_ok=True)
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    return app


app = create_app()
