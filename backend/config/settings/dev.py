from .base import *  # noqa: F403

DEBUG = True
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")  # noqa: F405

# Phase 1 and early MVP development use SQLite by default so the app runs
# locally without Docker or PostgreSQL permissions.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BACKEND_DIR / "db.sqlite3",  # noqa: F405
    }
}