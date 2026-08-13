# TrainOS Architecture

## High-level flow

```text
React/Vite frontend
→ Django REST Framework
→ domain apps and services
→ SQLite local database
```

The React client uses the Django JSON API with session authentication and CSRF protection. Django owns persistence, validation, import/export commands, and domain analytics.

## Backend domains

- `users` stores user-scoped `TrainingPreferences` and the data-safety management commands.
- `journal` records daily check-in history.
- `running` stores manual and TCX-imported activities, import-batch metadata, and running analytics.
- `gym` manages shared and user-owned exercises, references, templates, sessions, sets, active-workout state, and gym analytics.
- `climbing` manages sessions, attempts, projects, and climbing analytics.

## Important relationships

- `TrainingPreferences` is one user-scoped profile row.
- Check-ins are user-owned history records.
- `RunActivity` can reference an `ImportBatch`.
- Exercises are either shared global records or user-owned records; exercise references are user-scoped.
- Gym sessions contain sets; workout templates contain ordered exercise items; an active workout retains current progress.
- Climbing sessions contain attempts, and attempts can link to a climbing project.

## Derived data

Home, Training Brief, Weekly Review, and running/gym/climbing analytics are derived views of source records and preferences. They are not independent canonical portable datasets.

## Data safety and portability

`backup_trainos` creates an integrity-checked SQLite recovery snapshot. `export_trainos_data` creates a user-scoped portable representation with canonical schema-v1 `data.json` and convenience CSV files. `import_trainos_data` validates that canonical JSON, remaps source IDs to target IDs, and restores it transactionally into an empty training profile after an automatic SQLite backup.
