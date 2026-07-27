from django.contrib import admin
from django.urls import include, path

from .views import csrf_view, health_view, login_view, logout_view, me_view

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_view, name="api-health"),
    path("api/auth/csrf/", csrf_view, name="api-auth-csrf"),
    path("api/auth/login/", login_view, name="api-auth-login"),
    path("api/auth/logout/", logout_view, name="api-auth-logout"),
    path("api/auth/me/", me_view, name="api-auth-me"),
    path("api/preferences/", include("users.urls")),
    path("api/journal/", include("journal.urls")),
    path("api/running/", include("running.urls")),
    path("api/gym/", include("gym.urls")),
    path("api/climbing/", include("climbing.urls")),
]
