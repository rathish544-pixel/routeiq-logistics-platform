import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.security import require_user
from app.database import check_database, init_db
from app.services.websocket_manager import ws_manager
from app.routes.order import router as order_router
from app.routes.driver import router as driver_router
from app.routes.assignment import router as assignment_router
from app.routes.optimizer import router as optimization_router
from app.routes.tracking import router as tracking_router
from app.routes.dynamic_routing import router as dynamic_routing_router
from app.routes.delay_detection import router as delay_detection_router
from app.routes.analytics import router as analytics_router
from app.routes.settings import router as settings_router
from app.routes.auth import router as auth_router
from app.services.redis_client import check_redis
from app.services.simulator import simulate_driver_movement

# REST routers whose every endpoint requires a verified session.
PROTECTED_ROUTERS = [
    order_router,
    driver_router,
    assignment_router,
    optimization_router,
    dynamic_routing_router,
    delay_detection_router,
    analytics_router,
    settings_router,
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("routeiq")

# Started-at marker used by /diagnostics for uptime reporting.
BOOTED_AT = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Verify database schema (idempotent; creates missing tables)
    try:
        init_db()
        logger.info("Database ready (env=%s).", settings.ENVIRONMENT)
    except Exception:
        logger.exception("Database initialization failed — continuing with degraded services.")

    if settings.ENVIRONMENT.lower() == "test":
        logger.info("Simulator disabled (test environment)")
        yield
        return

    simulator_task = asyncio.create_task(simulate_driver_movement())
    logger.info("Driver movement simulator started")

    yield

    simulator_task.cancel()
    try:
        await simulator_task
    except asyncio.CancelledError:
        pass
    logger.info("Driver movement simulator stopped")


async def request_logging(request: Request, call_next):
    """Structured request log: method, path, status, duration."""
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Request failed: %s %s", request.method, request.url.path)
        raise
    duration_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "req method=%s path=%s status=%d duration_ms=%.1f",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


app = FastAPI(
    title="RouteIQ — Real-Time Logistics Optimization Platform",
    version=settings.VERSION,
    lifespan=lifespan,
)

app.middleware("http")(request_logging)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Never leak stack traces to API consumers."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error. Please retry or contact operations support.",
        },
    )


for protected_router in PROTECTED_ROUTERS:
    app.include_router(protected_router, dependencies=[Depends(require_user)])

app.include_router(tracking_router)
app.include_router(auth_router)


@app.get("/")
def root():
    return {
        "message": "RouteIQ Logistics Optimization Platform API",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "status": "running",
    }


@app.get("/health")
def health():
    """Liveness + readiness: database and Redis connectivity."""
    db_ok = check_database()
    redis_ok = check_redis()

    status = "healthy" if (db_ok and redis_ok) else "degraded"
    return {
        "status": status,
        "environment": settings.ENVIRONMENT,
        "version": settings.VERSION,
        "database": "connected" if db_ok else "disconnected",
        "redis": "connected" if redis_ok else "unavailable",
    }


@app.get("/diagnostics", dependencies=[Depends(require_user)])
def diagnostics():
    """Authenticated service diagnostics for production troubleshooting."""
    db_ok = check_database()
    redis_ok = check_redis()
    uptime_seconds = int(time.time() - BOOTED_AT)
    return {
        "service": "routeiq-api",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "status": "healthy" if (db_ok and redis_ok) else "degraded",
        "uptime_seconds": uptime_seconds,
        "started_at": datetime.fromtimestamp(BOOTED_AT, tz=timezone.utc).isoformat(),
        "now": datetime.now(timezone.utc).isoformat(),
        "database": {"status": "connected" if db_ok else "disconnected"},
        "redis": {"status": "connected" if redis_ok else "fallback-memory"},
        "websocket_clients": len(ws_manager.active_connections),
    }