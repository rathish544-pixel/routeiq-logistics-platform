import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

logger = logging.getLogger(__name__)

DATABASE_URL = settings.DATABASE_URL

# connect_args only relevant for SQLite; harmless for Postgres
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()

# Import models so all tables register with Base.metadata
from app.models import (  # noqa: E402,F401
    Driver,
    Order,
    Route,
    RouteOrder,
    DriverLocation,
    SystemAlert,
    OptimizationRun,
    AppSetting,
)


# Foreign-key / hot-path indexes that speed up route & driver lookups.
# Managed here (idempotently) so both fresh and pre-existing schemas benefit.
HOT_PATH_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_routes_driver_id ON routes (driver_id)",
    "CREATE INDEX IF NOT EXISTS ix_route_orders_route_id ON route_orders (route_id)",
    "CREATE INDEX IF NOT EXISTS ix_route_orders_order_id ON route_orders (order_id)",
    "CREATE INDEX IF NOT EXISTS ix_driver_locations_driver_id ON driver_locations (driver_id)",
    "CREATE INDEX IF NOT EXISTS ix_driver_locations_recorded_at ON driver_locations (recorded_at)",
    "CREATE INDEX IF NOT EXISTS ix_orders_assigned_driver_id ON orders (assigned_driver_id)",
    "CREATE INDEX IF NOT EXISTS ix_orders_route_id ON orders (route_id)",
    "CREATE INDEX IF NOT EXISTS ix_orders_status ON orders (status)",
]


def init_db() -> None:
    """Idempotently create missing tables + hot-path indexes.

    In production with Supabase this runs harmlessly when the schema
    already exists; a proper migration tool can supersede it later.
    """
    try:
        inspector = inspect(engine)
        existing = set(inspector.get_table_names())
        missing = set(Base.metadata.tables.keys()) - existing
        if missing:
            logger.info("Creating missing tables: %s", sorted(missing))
            Base.metadata.create_all(bind=engine)
        else:
            logger.info("Database schema verified (%d tables present).", len(existing))

        # Ensure hot-path indexes exist (harmless if already present)
        with engine.begin() as connection:
            for statement in HOT_PATH_INDEXES:
                connection.execute(text(statement))
    except Exception as e:  # pragma: no cover
        logger.error("Database schema check failed: %s", e)
        raise


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database() -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False