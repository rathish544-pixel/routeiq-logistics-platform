"""Launch an arbitrary command as a fully detached daemon (double-fork).

Usage:
    python scripts/daemon_cmd.py -- <command> [args...]

stdout/stderr are appended to /tmp/daemon_cmd.log
"""
import os
import sys


def daemonize() -> None:
    if os.fork() > 0:
        os._exit(0)
    os.setsid()
    if os.fork() > 0:
        os._exit(0)
    devnull = os.open(os.devnull, os.O_RDWR)
    os.dup2(devnull, 0)


def main() -> None:
    if "--" not in sys.argv:
        print("Usage: python scripts/daemon_cmd.py -- <command> [args...]", file=sys.stderr)
        sys.exit(2)
    command = sys.argv[sys.argv.index("--") + 1:]
    if not command:
        sys.exit(2)

    daemonize()

    log_fd = os.open("/tmp/daemon_cmd.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    os.dup2(log_fd, 1)
    os.dup2(log_fd, 2)

    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
