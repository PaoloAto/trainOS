import os

os.environ.setdefault("DATABASE_ENGINE", "postgres")

from .base import *  # noqa: F403

DEBUG = False
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True