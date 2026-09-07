import json
import logging
import threading

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# Fallback in-memory cache when Redis is unreachable (process-local, bounded-ish).
_memory_cache: dict[str, str] = {}
_memory_lock = threading.Lock()

try:
    redis_client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        password=settings.REDIS_PASSWORD,
        decode_responses=True,
        socket_timeout=2,
        socket_connect_timeout=2,
    )
except Exception as e:  # pragma: no cover
    logger.warning(f"Could not initialize Redis client: {e}")
    redis_client = None


def check_redis() -> bool:
    if redis_client is None:
        return False
    try:
        return bool(redis_client.ping())
    except Exception:
        return False


def set_cache(key: str, value: str, ex: int | None = None) -> bool:
    """Set a string value. Falls back to the in-memory cache when Redis is down."""
    try:
        if redis_client is not None:
            redis_client.set(key, value, ex=ex)
            return True
    except Exception as e:
        logger.debug("Redis set failed (%s); using memory fallback", e)
    with _memory_lock:
        _memory_cache[key] = value
    return True


def get_cache(key: str) -> str | None:
    """Get a string value from Redis or the in-memory fallback."""
    try:
        if redis_client is not None:
            val = redis_client.get(key)
            if val is not None:
                return val
    except Exception as e:
        logger.debug("Redis get failed (%s); using memory fallback", e)
    with _memory_lock:
        return _memory_cache.get(key)


def set_json(key: str, payload: dict, ex: int | None = None) -> bool:
    return set_cache(key, json.dumps(payload, default=str), ex=ex)


def get_json(key: str) -> dict | None:
    raw = get_cache(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("Stored value for %s is not valid JSON", key)
        return None


def delete_cache(key: str) -> None:
    try:
        if redis_client is not None:
            redis_client.delete(key)
    except Exception:
        pass
    with _memory_lock:
        _memory_cache.pop(key, None)