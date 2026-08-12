# TrainOS

TrainOS is a private personal training OS for running, gym, and climbing.

The goal is to become a personal command center that answers:

> What did I train, how am I progressing, and what should I focus on next?

---

## Current Scope

Phase 2.6 is implemented.

TrainOS currently includes:

- Core Django models
- Django Admin registration
- Django REST Framework APIs
- SQLite-first local development
- Django session authentication with CSRF
- React/Vite frontend
- Dark mobile-first training app design
- Quick logging for:
  - Daily check-ins
  - Manual runs
  - Gym sessions
  - Exercises
  - Bouldering sessions
  - Top-rope sessions
  - Climbing projects
- Basic Run, Gym, Climb, and Review pages
- Polished desktop shell and quick-log UI

Still intentionally not included:

- Strava upload or OAuth
- Garmin import
- AI calls or prompt builders
- Advanced analytics
- JWT auth
- Celery or Redis
- Native mobile app
- Deployment
- Payments or social features

---

## Stack

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

## Requirements

- Python 3.10 or newer  
  Python 3.13 is currently used locally.
- Node.js 20 or newer
- npm
- Docker Desktop is optional and only needed later for PostgreSQL testing

---

## Quickstart: Run Locally Without Docker

## Portable Data Export

Create a portable ZIP of one user's personal TrainOS training data:

```powershell
python manage.py export_trainos_data --user <user>
python manage.py export_trainos_data --user <user> --output-dir "<path>"
```

The ZIP contains versioned canonical JSON plus human-readable CSV files. Keep it secure: it includes your personal training notes and source metadata. Uploaded activity files themselves are not included in Phase 9A.1. Restore/import is not implemented yet; `data.json` is the canonical format intended for a future restore workflow.

TrainOS uses SQLite by default for local development.

### 1. Create a local environment file

From the project root:

```powershell
Copy-Item .env.example .env
