# TrainOS

TrainOS is a private, mobile-first training companion for running, gym, and climbing.

[![CI](https://github.com/PaoloAto/trainOS/actions/workflows/ci.yml/badge.svg)](https://github.com/PaoloAto/trainOS/actions/workflows/ci.yml)

The goal is to become a personal command center that answers:

> What did I train, how am I progressing, and what should I focus on next?

---

## What TrainOS Is

TrainOS helps one athlete answer what they trained, how they are progressing, and what to focus on next. It is a local-first Django and React application with session authentication and a SQLite-first development workflow.

## Current Status

TrainOS has completed its core training MVP and Phase 9A data-safety and portability foundation.

## Features

### Home and Training Brief

- Training overview with readiness/check-in context, recent activity, weekly balance, deterministic Training Brief, and quick actions.

### Goals, preferences, and check-ins

- Per-user running, gym, and climbing goals and weekly targets.
- Daily check-ins for sleep, mood, energy, soreness, stress, body weight, and notes, with history.

### Running

- Manual run logging, TCX file import, run history, weekly sessions/distance, and pace/distance/consistency trends.

### Gym

- Shared and user-owned exercises, references and notes, templates, sessions, sets, and resumable active workouts.
- Muscle-coverage and training analytics.

### Climbing

- Bouldering and top-rope sessions, attempts, grades, styles, results, projects, project history, and progression analytics.

### Weekly Review

- Goal progress, highlights, attention areas, and actionable next steps.

---

## Technology Stack

### Backend

- Django 5.2+
- Django REST Framework
- SQLite for local development
- Optional PostgreSQL setup for later phases
- Django session auth + CSRF

### Frontend

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn-style UI primitives
- Framer Motion
- Recharts
- date-fns
- lucide-react

---

## Architecture

The React/Vite frontend calls Django REST Framework domain APIs backed by SQLite. Domain apps own source records, while Home, Training Brief, Weekly Review, and analytics derive their results from those records and preferences. See [Architecture](docs/ARCHITECTURE.md) for data relationships and safety flows.

## Repository Structure

```text
backend/   Django project, domain apps, management commands, and tests
frontend/  React/Vite application and Vitest tests
docs/      Concise technical documentation
```

---

## Requirements

- Python 3.10 or newer  
  Python 3.13 is currently used locally.
- Node.js 20 or newer
- npm
- Docker Desktop is optional and only needed later for PostgreSQL testing

---

## Quickstart

### 1. Create a local environment file

From the project root:

```powershell
Copy-Item .env.example .env
```

### 2. Start the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 3. Start the frontend

In a second terminal from the project root:

```powershell
cd frontend
npm ci
npm run dev
```

---

## Testing and Verification

Backend:

```powershell
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py test
python -m compileall .
```

Frontend:

```powershell
cd frontend
npm ci
npm run lint
npm test
npm run build
```

These commands mirror the GitHub Actions quality gates.

## Continuous Integration

GitHub Actions runs independent backend and frontend jobs for pushes and pull requests targeting `main`, and can also be run manually. It uses clean Python 3.13 and Node 20 environments, lockfile-based frontend installation, migration-drift detection, fresh SQLite migrations, backend tests, linting, Vitest, and production builds.

---

## Data Safety and Portability

### Local SQLite Backup

Create a full local SQLite recovery backup from the backend directory:

```powershell
cd backend
python manage.py backup_trainos
python manage.py backup_trainos --output-dir "<path>"
```

Backups are complete raw SQLite database copies, including the local application data needed for recovery. Backup folders and portable exports contain personal training data; store them securely.

To restore a known-good raw SQLite backup manually:

1. Stop Django. Never replace the active SQLite database while Django is running.
2. Preserve the current database first.
3. Choose a known-good backup and confirm both metadata integrity checks are `ok`.
4. Replace the configured SQLite database with the backup's `db.sqlite3`.
5. Run `python manage.py check` and `python manage.py migrate --check`.
6. Restart the application.

### Portable Data Export

Create a user-scoped ZIP with canonical versioned JSON and human-readable CSV files:

```powershell
cd backend
python manage.py export_trainos_data --user <user>
python manage.py export_trainos_data --user <user> --output-dir "<path>"
```

Portable export is for user-scoped data portability; local SQLite backup is for full local recovery. Schema-v1 `data.json` is canonical; CSV files are convenience and human-readable only, not a restore source. Uploaded activity-file bytes are not included.

### Portable Import / Restore

Validate a portable export before making any changes (the default is a zero-write dry run):

```powershell
cd backend
python manage.py import_trainos_data --file "<zip>" --user <user>
```

Apply a validated import explicitly:

```powershell
python manage.py import_trainos_data --file "<zip>" --user <user> --apply
```

Apply creates an automatic, integrity-checked full SQLite backup first. The target user must have no existing training history; an existing preferences row may be synchronized. Source database IDs are remapped to new target records. Shared exercises are reused only when their identity matches exactly; otherwise TrainOS creates a private target-user copy.

Restore reads only canonical `data.json`, never CSV convenience files. Activity-file attachments are not restored because their bytes are not included in portable exports. Merge and overwrite/replace restore are not implemented, and automatic pre-import backup currently supports SQLite only. Keep both export ZIPs and automatic backups secure.

## Current Limitations

- No merge or overwrite portable restore mode.
- Imported activity attachments are metadata only; their original file bytes are not restored.
- SQLite is the supported automatic backup path.
- No cloud sync, social features, payments, native mobile app, or deployment workflow.

## Roadmap

The next work should build on the stable MVP, portability safeguards, and CI foundation without expanding data ownership or restore semantics prematurely.
