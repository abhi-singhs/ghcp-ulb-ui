# Copilot AI Credits · User‑Level Budgets

A fully **client‑side** single‑page app for managing GitHub Copilot **AI Credits**
user‑level budgets (ULB) across an enterprise. It talks **directly** to the
[GitHub Budgets REST API](https://docs.github.com/en/enterprise-cloud@latest/rest/billing/budgets?apiVersion=2026-03-10)
from the browser — there is no backend.

Built with Vite + React + TypeScript and GitHub's own [Primer](https://primer.style) design system.

## What it does

- **Universal ULB** — view, create, and edit the `multi_user_customer`‑scope AI Credits
  budget that applies to every user by default (monthly cap, usage, alerting).
- **Override budgets** — manage per‑user (`user`‑scope) caps that take precedence over the
  universal budget: searchable, paginated table with usage bars and alert status.
- **Add / edit overrides** — single‑user create and edit dialog with validation.
- **Bulk delete** — multi‑select rows (or select‑all on the page) and delete with a
  confirmation step and progress.
- **Bulk upload** — import a **CSV or Excel** file to create/update many overrides at once
  (upsert), with a classified preview (create vs. update vs. error) before applying.
- **Bulk download** — export every override budget to a `username,budget_amount` CSV with one click.
- **Demo mode & Live mode** — explore with seeded mock data, or connect to a real enterprise.
- **Light / dark / system** theme, persisted locally.

## Demo vs. Live

The mode toggle lives in the top‑right of the header.

- **Demo** — Seeded sample data (1 universal budget + 50 overrides) lives entirely in your
  browser's `localStorage`. No network requests are made. Use **Reset demo data** to restore
  the original seed. Great for trying every flow, including bulk upload.
- **Live** — Enter your **enterprise slug** and a **personal access token**, then
  **Test connection**. All calls go straight from your browser to `api.github.com`
  (GitHub's REST API supports CORS).

## Authentication & security (read this for Live mode)

- The token needs the **`manage_billing:enterprise`** scope (classic PAT), or the
  fine‑grained **“Enterprise billing”** permission.
- Because this app is 100% client‑side, **your token is held in the browser**. By default it
  is kept only in memory for the session. If you tick **“Remember token”**, it is saved to
  `localStorage` on your machine — only do this on a trusted device.
- No token or budget data is ever sent anywhere except `api.github.com`. There is no server,
  analytics, or third‑party call.
- All requests send `X‑GitHub‑Api‑Version: 2026-03-10`.

## Bulk upload format

Accepted file types: `.csv`, `.xlsx`, `.xls`. Columns (header row required):

| Column | Required | Notes |
| --- | --- | --- |
| `username` | yes | GitHub login (a leading `@` is stripped). |
| `budget_amount` | yes | Whole US dollars. `$` and thousands separators are tolerated. |

**Upsert behavior:** if a user already has an override it is updated (`PATCH`), otherwise a new
one is created (`POST`). Use **Download sample CSV** in the dialog for a ready‑made template.

> AI Credits budgets always block spending when exceeded — `prevent_further_usage` is forced
> `true` for both universal and override budgets, as required by the API.

## Getting started

```bash
npm install
npm run dev        # start the dev server (Vite)
```

Then open the printed local URL. The app starts in **Demo** mode, so no token is needed.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR. |
| `npm run build` | Type‑check (`tsc -b`) and produce a production build in `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint. |

### Deploying

`npm run build` emits a static `dist/` folder. Host it on any static host (GitHub Pages,
Netlify, S3, etc.) — there is nothing server‑side to run.

## How it maps to the API

| UI concept | Scope | Key fields |
| --- | --- | --- |
| Universal ULB | `multi_user_customer` | `budget_type: "BundlePricing"`, `budget_product_sku: "ai_credits"`, `prevent_further_usage: true` |
| Override budget | `user` | same as above plus a required `user` (login) |

Base endpoint:
`https://api.github.com/enterprises/{enterprise}/settings/billing/budgets`

## Project structure

```
src/
  api/        BudgetClient interface + live GitHub client + localStorage mock client
  components/ Header, universal card, overrides table/panel, dialogs, theme toggle
  context/    Color mode, connection (demo/live + token), toast providers
  hooks/      TanStack Query hooks for budgets
  types/      Budget types, payloads, AI Credits constants
  utils/      CSV/Excel parsing, bulk import, formatting, concurrency pool
```

## Tech stack

Vite · React 19 · TypeScript · Primer React + Octicons · TanStack Query ·
papaparse (CSV) · SheetJS/xlsx (Excel).

> Note: this project pins the patched SheetJS CDN build of `xlsx` (the npm package has
> unaddressed security advisories).
