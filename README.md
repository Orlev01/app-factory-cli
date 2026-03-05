# app-factory-cli

A Node.js CLI that provisions full-stack apps from a GitHub template in a single command. Each `create` run spins up a Neon Postgres database, a private GitHub repo, a Vercel project with environment variables, and a local clone — all wired together automatically.

## Prerequisites

| Tool | Purpose |
|---|---|
| Node.js ≥ 18 | Runtime |
| pnpm | Package manager (used by CLI and provisioned apps) |
| `gh` CLI | GitHub operations (auth, repo create/delete) |
| `git` | Cloning, committing, pushing |
| `vercel` CLI (optional) | Required only for `appfactory logs` |

Authenticate the GitHub CLI before running `init`:

```bash
gh auth login
```

## Installation

```bash
cd app-factory-cli
pnpm install
pnpm build
npm link   # or: node dist/index.js
```

After linking, the `appfactory` binary is available globally.

## Quick Start

```bash
# 1. Configure credentials (one-time setup)
appfactory init

# 2. Provision a new app
appfactory create my-app

# 3. List all provisioned apps
appfactory list
```

## Commands

### `appfactory init`

Interactive setup wizard. Validates all credentials against their APIs before saving.

Saved to `~/.appfactory/config.json` (mode 0600).

**Prompts:**
- GitHub org or username
- Template repo (`org/repo` format)
- Directory where apps will be cloned
- Neon API key
- Vercel token + optional team ID
- Resend API key
- Email from address

---

### `appfactory create [name] [--from <app>]`

Provisions a complete new app in 10 steps with automatic rollback on any failure.

**Steps:**
1. Clone template repo (shallow) and reinitialize git — or copy from `--from` app
2. Install dependencies (`pnpm install`)
3. Create Neon Postgres project (returns connection URI)
4. Generate `AUTH_SECRET` (`crypto.randomBytes(32)`)
5. Write `.env.local` (localhost URLs for local dev)
6. Push DB schema via `pnpm db:push` if the template defines that script
7. Create private GitHub repo
8. Push initial commit to GitHub
9. Create Vercel project linked to GitHub repo + set all env vars
10. Wait up to 3 minutes for first deployment; if the real URL differs from assumed, updates `AUTH_URL` / `NEXT_PUBLIC_APP_URL` and triggers a redeploy

**Rollback order on failure:** Vercel → GitHub → Neon → local directory

**App record** saved to `~/.appfactory/apps.json`:

```json
{
  "name": "my-app",
  "url": "https://my-app.vercel.app",
  "githubRepo": "my-org/my-app",
  "neonProjectId": "...",
  "vercelProjectId": "...",
  "localPath": "/path/to/apps/my-app",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

**`--from <source>`** copies an existing app's local files instead of cloning the template. Database schema is copied; data is not migrated.

---

### `appfactory list`

Prints a table of all provisioned apps with their URLs and creation dates.

---

### `appfactory destroy <name>`

Permanently tears down all resources for an app. Requires typing the app name to confirm.

**Deletes in parallel:**
- Vercel project
- Neon project
- GitHub repo
- Local directory

Partial failures are reported; the registry entry is always removed.

---

### `appfactory open <name> [target]`

Opens an app resource in the browser. Defaults to `url`.

| Target | Opens |
|---|---|
| `url` | Live deployment URL |
| `github` | GitHub repository |
| `vercel` | Vercel project dashboard |
| `neon` | Neon console for the project |
| `local` | Local directory (Finder/Explorer) |

---

### `appfactory env <name> <action> [args...]`

Manages environment variables on Vercel directly.

| Action | Usage | Description |
|---|---|---|
| `list` | `env <app> list` | Show all vars (key, targets, type) |
| `get` | `env <app> get KEY` | Decrypt and print a single var |
| `set` | `env <app> set KEY=VALUE [...]` | Create or update one or more vars |
| `remove` | `env <app> remove KEY` | Delete a var |
| `push` | `env <app> push <file>` | Push all vars from an env file |
| `pull` | `env <app> pull <file>` | Pull all vars (decrypted) to a file |

After `set`, `remove`, and `push`, prompts to trigger a redeployment.

New vars created via `set` / `push` default to `production + preview`, type `encrypted`.

---

### `appfactory status <name> [--quick]`

Checks the health of all services for an app.

**Full check (default):** runs three checks in parallel:
- **Site** — HTTP HEAD request to the deployment URL (status code + response time)
- **Deployment** — Latest Vercel deployment state and commit message
- **Database** — Neon project state and region
- **GitHub** — Repo accessibility, default branch, open PRs, last push

**`--quick`** — only the HTTP HEAD check (fastest).

---

### `appfactory logs <name>`

Tails Vercel deployment logs in real time using the `vercel` CLI. Requires `vercel` to be installed globally.

---

## Configuration

Config is stored at `~/.appfactory/config.json` (chmod 0600, dir chmod 0700).

```json
{
  "neonApiKey": "...",
  "vercelToken": "...",
  "resendApiKey": "...",
  "githubOrg": "my-org",
  "templateRepo": "my-org/my-template",
  "appsDirectory": "/Users/me/projects",
  "emailFrom": "noreply@myapp.com",
  "vercelTeamId": "team_..."
}
```

`vercelTeamId` is optional (personal accounts omit it).

The app registry is at `~/.appfactory/apps.json`.

---

## Project Structure

```
src/
  index.ts                  # CLI entry point (Commander program)
  types.ts                  # AppFactoryConfig, AppRecord, AppsRegistry
  commands/
    init.ts                 # Setup wizard
    create.ts               # 10-step provisioning with rollback
    destroy.ts              # Tear down all resources
    list.ts                 # Table of provisioned apps
    open.ts                 # Open resource in browser
    env.ts                  # Vercel env var management
    status.ts               # Health check (site, Vercel, Neon, GitHub)
    logs.ts                 # Tail Vercel logs via vercel CLI
  lib/
    config.ts               # Read/write ~/.appfactory/config.json
    registry.ts             # Read/write ~/.appfactory/apps.json
    logger.ts               # Chalk + ora spinners (stepStart/stepSuccess/stepFail)
    validation.ts           # App name regex (kebab-case, 3-50 chars)
    env-parser.ts           # Parse .env files; format env file output
    env-writer.ts           # Generate and write .env.local for new apps
  services/
    github.ts               # gh CLI wrapper (create, delete, push, getRepoInfo)
    neon.ts                 # Neon REST API (create, delete, getStatus)
    vercel.ts               # Vercel REST API (project, env vars, deployments, redeploy)
    resend.ts               # Resend API key validation
    template.ts             # Git clone, git init, pnpm install
```

---

## Build & Development

```bash
pnpm install       # Install dependencies
pnpm build         # Compile TypeScript to dist/
pnpm dev           # Run from source with tsx (no build needed)
```

---

## Environment Variables Set on Vercel

When `create` runs, these variables are set on both `production` and `preview` targets:

| Variable | Type | Value |
|---|---|---|
| `DATABASE_URL` | encrypted | Neon connection URI |
| `AUTH_SECRET` | encrypted | 32-byte random base64 |
| `AUTH_URL` | plain | `https://<name>.vercel.app` (updated after first deploy) |
| `RESEND_API_KEY` | encrypted | From config |
| `EMAIL_FROM` | plain | From config |
| `NEXT_PUBLIC_APP_NAME` | plain | Title-cased app name |
| `NEXT_PUBLIC_APP_URL` | plain | `https://<name>.vercel.app` (updated after first deploy) |

The local `.env.local` uses `http://localhost:3000` for `AUTH_URL` and `NEXT_PUBLIC_APP_URL`.

---

## Notes for Agents

- All GitHub operations go through the `gh` CLI — no GitHub token in config; the CLI handles auth.
- GitHub repos are created as **private**.
- Vercel projects are linked to GitHub at creation time. Vercel auto-deploys on every push to `main`.
- The `waitForDeployment` poller queries for `state=READY` deployments every 5 seconds, timeout 3 minutes.
- If the first deployment URL differs from `https://<name>.vercel.app`, the CLI updates `AUTH_URL` and `NEXT_PUBLIC_APP_URL` and triggers a redeploy so `NEXT_PUBLIC_*` variables are embedded correctly in the static build.
- App name validation: kebab-case only, 3–50 characters, regex `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`.
