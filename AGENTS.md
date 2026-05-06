# TrainOS Agent Rules

TrainOS is a solo personal training OS. Keep the product fast, focused, and mobile-first.

## Frontend Design Rules

- Do not hardcode raw hex colors in React components.
- Use Tailwind tokens from `tailwind.config.js` for colors, borders, shadows, and surfaces.
- Use `RingScore` for circular score metrics.
- Use shadcn/ui primitives for dialogs, sheets, forms, buttons, and shared interaction patterns.
- Use Motion/Framer Motion for page and card entrance animations.
- Build mobile-first layouts first, then scale up for larger screens.
- Quick logging must stay under 60 seconds.
- Preserve the dark premium health-app aesthetic: rounded cards, soft borders, subtle glows, and purposeful activity accents.

## Product Boundaries

- Do not add Strava OAuth, Apple Health, Garmin, payments, native mobile, or social features unless explicitly requested for a later phase.
- Do not add training database models before Phase 2.
- Keep views thin and move business logic into services/selectors as the app grows.
