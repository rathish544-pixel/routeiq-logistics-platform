"""Launch uvicorn as a fully detached daemon (double-fork + setsid).

Usage:
    python scripts/daemon_uvicorn.py [port]
"""
import os
import sys

PORT = sys.argv[1] if len(sys.argv) > 1 else "8001"
LOG_PATH = "/tmp/routeiq_api.log"
WORKDIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _redirect_to_log():
    fd = os.open(LOG_PATH, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    os.dup2(fd, 0)  # stdin -> log (empty)
    os.dup2(fd, 1)  # stdout -> log
    os.dup2(fd, 2)  # stderr -> log
    os.close(fd)


def main():
    if "DATABASE_URL" not in os.environ:
        os.environ["DATABASE_URL"] = "postgresql://localhost/logistics_db"

    # First fork: leave the tool's process group
    pid = os.fork()
    if pid > 0:
        return  # original caller exits immediately

    os.setsid()

    # Second fork: guarantee we cannot reacquire a controlling terminal
    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)

    os.chdir(WORKDIR)
    _redirect_to_log()
    os.execv(
        sys.executable,
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", PORT],
    )


if __name__ == "__main__":
    main()