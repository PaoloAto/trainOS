from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def health_view(request):
    return Response({"status": "ok"})


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_view(request):
    return Response({"csrfToken": get_token(request)})


@csrf_protect
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get("username")
    password = request.data.get("password")

    if not username or not password:
        return Response(
            {"detail": "Username and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"detail": "Invalid credentials."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    login(request, user)
    return Response(
        {
            "user": {
                "id": user.id,
                "username": user.get_username(),
                "email": user.email,
            }
        }
    )


@csrf_protect
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])
def me_view(request):
    if not request.user.is_authenticated:
        return Response({"authenticated": False, "user": None})

    return Response(
        {
            "authenticated": True,
            "user": {
                "id": request.user.id,
                "username": request.user.get_username(),
                "email": request.user.email,
            },
        }
    )
