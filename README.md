# nlwc-ems-admin

Staff console for the NLWC Event Management System (Vite + React 19 + TanStack Router/Query). It talks only to
[`nlwc-ems-api`](https://github.com/Oduology/nlwc-ems-api). Design tokens and component CSS come from `@nlwc/ui`
(`nlwc-ems-api/shared/ui`, installed as a git dependency); there is no design of its own.

## Run it

```
pnpm install
API_URL=http://localhost:4000 pnpm dev      # console on http://localhost:3001
```

The dev server proxies `/api` to `API_URL`, so the browser sees one origin and the API's cookies and CSRF check work
unchanged. The API must list `http://localhost:3001` under `Cors:AllowedOrigins`, and for plain-http local work run it with
`Security__CookieSecure=false`.

| Command | What it does |
|---|---|
| `pnpm dev` | dev server on :3001 |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | vitest (API client, formatters, rate-rule builder, role matrix) |
| `pnpm build` | typecheck + production build in `dist/` |

### First staff sign-in

1. Sign the person up on the web app (or `POST api/v1/auth/signup`).
2. Grant a role. The very first Super Admin comes from the API CLI: `dotnet run --project nlwc-ems.api --no-launch-profile -- --bootstrap-admin <email>`. After that, grant roles from **Staff & roles**.
3. Sign in here. Staff permissions only count on an MFA-verified session, so the console asks for the authenticator code before it loads anything else. First time only, choose **Set up an authenticator**, scan the QR code and enter the code.

> Don't press "Set up an authenticator" if you already have one: it replaces the key your app uses today.

## Screens

| Screen | Needs | Notes |
|---|---|---|
| Sign-in and MFA | none | the gate for everything below |
| Dashboard | `registrations:view` | registration counts by state, how people attend, age bands, what needs attention, lifecycle, capabilities on |
| Event editions | `config:view` / `config:edit` | create, edit settings, capability switches and stage moves (each asks for a reason) |
| Pricing & rate plans | `pricing:draft` / `pricing:approve` | draft rate versions, approve (a different person), publish |
| Registrations | `registrations:view` | searchable queue (name or reference; state, mode and age-band filters); an audited CSV **Export** (reason required, never health answers); a drawer with people, permissions, emergency contact and history; **Cancel registration** with a reason (`registrations:edit`); a deliberate, logged **Reveal health** (`health:view`) |
| Camp review | `registrations:view` (decide: `registrations:edit`) | camp requests with a person's decision (Approve, Waitlist, Decline, each with a reason); approvals need a camp capacity and room in it |
| People | `people:view` (edit: `people:edit`) | name search, family and registrations, possible duplicates ("not the same person", never auto-merged), staff pairing of adult spouses |
| Staff & roles | `staff:view` / `staff:edit` | role matrix, grants, grant and revoke with a reason |
| Audit log | `audit:view` | paged events, detail, **Verify chain** |

Navigation is built from `GET access/me`. Hiding a link is cosmetic: the API checks every call again.

## Rules this console keeps

- Every dangerous action asks for a reason, and the reason goes to the audit log.
- Health details live in component state only: never in the query cache or any browser storage, cleared on close, **Hide now**, sign-out, or after 90 seconds. The queue shows only whether something was declared, and only to roles with `health:flags`.
- The edition switcher scopes every screen; the choice is remembered in `localStorage` (an id, nothing sensitive).
- The edition switcher is fed by `GET edition/mine`, so every staff role sees the editions its grants cover, with or without `config:view`.
- MFA: if `auth/me` says an authenticator exists, only a code is asked for (setup would replace it, and the API now refuses that). Otherwise setup starts by itself.
- Pricing lists every rate version from `GET edition/{id}/rates`; granting a role finds the person by email (`GET rolegrant/lookup`).

## Known gaps (waiting on the API)

- Lost authenticator: there is no admin reset yet, so a locked-out staff member needs the database changed by hand.
- Role grants still list a short account id, not the person's email.
- No revenue, capacity or check-in numbers yet, so the dashboard shows only registration counts.
