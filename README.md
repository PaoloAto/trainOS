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
npm install
npm run dev
```

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

Portable export is for user-scoped data portability; local SQLite backup is for full local recovery. Uploaded activity files themselves are not included. Portable `data.json` import/restore is not implemented yet.

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

Restore reads only canonical `data.json`, never CSV convenience files. Activity-file attachments are not restored because their bytes are not included in portable exports. Merge and overwrite/replace restore are not implemented. Keep both export ZIPs and automatic backups secure.
