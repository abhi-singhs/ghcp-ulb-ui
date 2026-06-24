# Copilot AI Credits · User‑Level Budgets

> [!IMPORTANT]
> **Unofficial:** This is an unofficial solution and is not affiliated with,
> endorsed by, or supported by GitHub.

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
  (GitHub's REST API supports CORS). You'll need a **classic PAT** with the
  `manage_billing:enterprise` scope — see
  [Authentication & security](#authentication--security-read-this-for-live-mode).

## Authentication & security (read this for Live mode)

> [!CAUTION]
> **Use at your own risk.** This is an unofficial, community‑built tool. You use it
> **entirely at your own risk**, and GitHub is **not responsible or liable** for any
> loss, damage, token compromise, unexpected billing changes, or other liability
> arising from your use of it. Review the source before connecting a real enterprise,
> and connect only with a token that grants the **least privilege** necessary.

### Which token you need

The enterprise [Budgets REST API](https://docs.github.com/en/enterprise-cloud@latest/rest/billing/budgets?apiVersion=2026-03-10)
that this app calls is only accessible to an **enterprise admin or billing manager**,
authenticating with a **classic personal access token** that has the
**`manage_billing:enterprise`** scope. **Fine‑grained personal access tokens are not
supported** for these endpoints.

`manage_billing:enterprise` is a **narrow** scope — it grants billing management only — but
because this app runs **entirely in your browser** and holds your token there, still treat it
carefully: grant **only** that one scope, set the **shortest expiration**, and **revoke** the
token as soon as you're done.

### Create the token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens →
   Tokens (classic) → Generate new token (classic)**.
2. Choose the **shortest expiration** that fits your task.
3. Select **only** the **`manage_billing:enterprise`** scope. Leave **every other scope
   unchecked**.
4. Generate the token, copy it, and paste it into the **Personal access token** field. Do
   **not** reuse this token for any other purpose.
5. **Revoke the token** as soon as you no longer need it.

### Where your token lives

- **Your token is held in your browser only.** By default it is kept in memory for the
  session and discarded when you close the tab.
- If you tick **“Remember token”**, it is saved to `localStorage` on your machine — only do
  this on a **trusted, private device**.
- No token or budget data is ever sent anywhere except `api.github.com`. There is no server,
  analytics, or third‑party call.
- All requests send `X‑GitHub‑Api‑Version: 2026-03-10`.

### Keeping your credentials secure

Treat your token like a password. Per GitHub's
[Keeping your API credentials secure](https://docs.github.com/en/enterprise-cloud@latest/rest/authentication/keeping-your-api-credentials-secure)
guide:

- **Limit permissions and lifetime** — grant only the `manage_billing:enterprise` scope and
  set the shortest expiration you need.
- **Store it securely** — never commit a token to a repository (even a private one), and never
  send it over unencrypted chat or email. If a team needs it, keep it in a secrets manager
  such as [1Password](https://1password.com/),
  [Azure Key Vault](https://azure.microsoft.com/products/key-vault), or
  [HashiCorp Vault](https://www.hashicorp.com/products/vault).
- **Don't share your token** — a token carries the owner's own access; grant people the
  billing‑manager role instead of handing out a token.
- **Don't persist it unnecessarily** — leave **“Remember token”** unticked so the token is
  never written to `localStorage`.
- **Have a remediation plan** — if a token is ever leaked, generate a replacement, update it
  everywhere you use it, then delete the compromised one from **Settings → Developer settings →
  Personal access tokens**.

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

#### GitHub Pages (automated)

This repo ships a [GitHub Actions workflow](./.github/workflows/deploy-pages.yml) that builds
the app and publishes it to GitHub Pages on every push to `main` (and on demand via the
Actions tab → **Deploy to GitHub Pages** → **Run workflow**).

To enable it once: open **Settings → Pages** and set **Source** to **GitHub Actions**. The
site is then served from `https://<owner>.github.io/ghcp-ulb-ui/`.

> The Vite [`base`](./vite.config.ts) is set to `/ghcp-ulb-ui/` so asset URLs resolve under
> that project‑pages subpath. If you deploy under a different repo name or to a custom domain,
> update `base` accordingly.

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

## License

Released under the [MIT License](./LICENSE).
