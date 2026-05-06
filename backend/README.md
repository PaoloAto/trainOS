# TrainOS Backend

Django 5.2 backend for TrainOS.

## Requirements

Django 5.2 requires Python 3.10 or newer. Python 3.13 is currently used locally.

## Local Development Database

Phase 1, Phase 2, and early MVP development use SQLite by default. The database file is created at:

```text
backend/db.sqlite3
```

No Docker or PostgreSQL service is required for local development.

## Install

Windows PowerShell:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## Migrations

```powershell
python manage.py makemigrations
python manage.py migrate
```

## Create Superuser

```powershell
python manage.py createsuperuser
```

## Run Server

```powershell
python manage.py runserver
```

The backend runs at:

```text
http://127.0.0.1:8000
```

## Verify Health Endpoint

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health/
```

Expected response:

```json
{"status":"ok"}
```

## API

- `GET /api/health/`
- `GET /api/auth/csrf/`
- `POST /api/auth/login/`
- `POST /api/auth/logout/`
- `GET /api/auth/me/`
- `GET/POST /api/journal/check-ins/`
- `GET/PATCH /api/journal/check-ins/today/`
- `GET/POST /api/running/runs/`
- `GET /api/gym/muscle-groups/`
- `GET/POST /api/gym/exercises/`
- `GET/POST /api/gym/sessions/`
- `GET/POST /api/climbing/sessions/`
- `GET/POST /api/climbing/projects/`

## PostgreSQL Later

PostgreSQL remains available for later phases. To opt in, set one of these in `.env`:

```env
DATABASE_ENGINE=postgres
USE_POSTGRES=True
```

Then provide either `DATABASE_URL` or the individual `POSTGRES_*` variables.