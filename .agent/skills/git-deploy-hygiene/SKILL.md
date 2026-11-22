---
name: git-deploy-hygiene
description: Maintains repository cleanliness, secure dependency management, cloud database URL normalization, and safe multi-branch deployment workflows (main vs deploy/neon-koyeb-vercel). Apply when modifying dependencies, Dockerfiles, deployment configs, environment settings, or Git branches.
---

# Git & Deployment Hygiene Rules

When managing dependencies, build configs, environment variables, or Git branches, enforce these rules:

## 1. Repository & Dependency Cleanliness
- **No heavy binaries or massive demo fixtures in source:** Never commit `.zip` installers, local `.db`/`.sql` dumps, or 80k+ row demo JSON files into `src/` or `public/`. Keep `.gitignore` and `.dockerignore` strict; generate demo data exclusively via backend CLI scripts (`python -m app.cli.seed_demo`).
- **Frontend dependency hygiene:** Keep `vite`, `@vitejs/*`, and `@types/*` strictly in `devDependencies`. Never install or use vulnerable `xlsx@0.18.5` on the frontend.
- **No hardcoded hosts:** Frontend API and SSE clients must use relative `/api/...` paths by default (with optional `VITE_API_URL` override only for local dev). Never hardcode `localhost:8000` in production bundles.

## 2. Cloud & Database Configuration (`BaseSettings`)
- Validate required secrets (`DATABASE_URL`, `SECRET_KEY`) on startup (fail-fast).
- Automatically normalize `DATABASE_URL` for `asyncpg`: convert `postgres://` or `postgresql://` prefixes to `postgresql+asyncpg://`, and translate `sslmode=require` to `ssl=require` (required for Neon.tech and cloud Postgres).
- Ensure `Dockerfile` / `entrypoint.sh` runs `alembic upgrade head` before launching `uvicorn` with `--proxy-headers --forwarded-allow-ips="*"`.

## 3. Branch Isolation (`main` vs `deploy/neon-koyeb-vercel`)
- Never pollute `main` with hosting-specific hacks (like hardcoded Koyeb rewrite domains in `vercel.json`). Keep platform-specific overrides isolated in `deploy/neon-koyeb-vercel` and always verify `git status` and current branch before committing.
