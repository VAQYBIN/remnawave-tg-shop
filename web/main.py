from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from config.settings import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings = get_settings()
    app.state.settings = settings
    app.state.redis = Redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
    yield
    # Shutdown
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

    return app


app = create_app()
