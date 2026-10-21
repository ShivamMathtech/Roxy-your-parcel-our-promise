# Roxy — your parcel, our promise

A complete local parcel delivery web application inspired by the supplied red-and-white Roxy XD reference. The responsive React interface is backed by a real Node.js API and a persistent SQLite database. Customer bookings, administrator status changes, support messages, notifications and demo payments are saved across restarts.

## Start on Windows

1. Install **Node.js 24.x** from [nodejs.org](https://nodejs.org/). Restart your terminal after installation.
2. Extract the ZIP completely, for example into `G:\major_projects\roxy-delivery`.
3. Double-click **START-WINDOWS.bat**. The browser opens automatically after the server starts.
4. Open **http://localhost:4000** if the browser does not open. Keep the terminal window running.
5. Select **Customer demo** or **Admin demo** on the sign-in page.

The ZIP includes `dist/`, so this quick start does **not** require `npm install`, a separate database installation, API keys, Python, or internet access after Node is installed. Run the app through the server; do not double-click `index.html`.

| Account | Email | Password |
| --- | --- | --- |
| Customer | `hello@roxy.demo` | `RoxyDemo@123` |
| Administrator | `admin@roxy.demo` | `RoxyAdmin@123` |

Demo accounts and sample records are created on the first launch. You can also create a new customer account through **Create an account**. Sample contact details and delivery records are fictional demonstration data. The welcome screen is personalized with Shivam Singh.

## What works

- Responsive desktop dashboard, mobile navigation, and Roxy delivery illustrations.
- Registration, sign-in, sign-out, hashed passwords and persistent HTTP-only sessions.
- Personal profile, current-password verification, and session invalidation after a password change.
- Local demo password recovery using a one-time 15-minute link, visibly labelled as local recovery.
- Saved address creation, editing, removal, and reuse during booking.
- Four-step parcel booking: pickup/drop, dimensions and contents, courier service, review and payment choice.
- Server-calculated quotes for three Roxy services, volumetric weight, fragile handling, intercity fees and a labelled sample tax.
- Unique tracking numbers and idempotent booking submission.
- Cash-on-delivery records and a clearly labelled simulated prepaid checkout.
- Parcel search, status filters, pagination and CSV export of the current page.
- Public tracking without personal addresses or phone numbers; authenticated full parcel details.
- Delivery timeline and route illustration; customer detail pages poll for updates every 15 seconds.
- Administrator-controlled sequential delivery events, COD collection confirmation and audit trail.
- Cancellation before pickup; reversal of simulated prepaid payments on cancellation.
- In-app notifications and mark-all-read.
- Customer/admin support conversations with persisted messages, close/reopen, and 10-second polling.
- Print-friendly booking receipt; use the browser’s **Save as PDF** option if needed.
- Administrator overview of customers, sample courier tariffs, and recent activity.
- Database schema initialization and sample seeding, test suite, Windows launchers, Docker configuration and technical documentation.

## Try the complete workflow

1. Sign in using **Customer demo**.
2. Click **Send a parcel**. Choose saved **Home** for pickup and **Studio** for delivery.
3. Enter a parcel description and dimensions, then compare the three services.
4. Choose **Pay on delivery** or **Demo checkout** and confirm the booking.
5. For Demo checkout, click **Complete demo payment** on the parcel page. No money is charged.
6. Copy the tracking number. Sign out and use **Admin demo**, or use a separate browser profile for the admin session.
7. Open **All parcels**, find the new booking, and update each delivery stage in order. Include an event city and note. Confirm fee collection when completing a COD delivery.
8. Return to the customer session and open the parcel or public tracking page. Saved events appear on refresh or automatically within 15 seconds.
9. Start a support conversation as the customer, then reply as the administrator. Both parties see the saved exchange.

## Run on macOS or Linux

```bash
cd roxy-delivery
bash start.sh
```

Or, on any platform with Node 24:

```bash
node --env-file-if-exists=.env server/index.mjs
```

## Develop and rebuild

On Windows, run **SETUP-WINDOWS.bat** once, then **DEV-WINDOWS.bat**. Equivalent commands:

```bash
npm ci
npm run dev
```

Development frontend: `http://localhost:4173`. The development script starts the backend on port 4000 and proxies `/api` requests through Vite. Use port 4173 for current source edits; port 4000 serves the last built frontend.

```bash
npm run check
npm test
npm run build
npm start
```

`npm test` uses Node’s built-in runner and temporary SQLite files. Tests never reset your regular `data/roxy.sqlite` database. `npm run build` replaces `dist/` with the current frontend. The lockfile includes cross-platform optional packages; `node_modules` is intentionally excluded from the ZIP.

## Configuration and storage

Copy `.env.example` to `.env` only if you want to override defaults. Never commit `.env` or your live database.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `4000` | HTTP port |
| `DB_PATH` | `<project>/data/roxy.sqlite` | SQLite file path; use an absolute path when overriding |
| `DEMO_MODE` | `true` | Enables demo seeding, recovery links and test payments |
| `COOKIE_SECURE` | `false` | Set to `true` behind HTTPS |
| `APP_ORIGIN` | unset | Exact permitted browser origin for mutation requests behind a reverse proxy |

The database is created automatically. To back up, stop the server and copy the entire `data` folder. Restore it while the server is stopped. To create an independent fresh demo without deleting existing work, stop Roxy and set `DB_PATH` to a new, unused absolute path.

**Changing `DEMO_MODE` to `false` does not delete existing demo accounts.** For a deployment without demo credentials, use a new database path and create an administrator using the included CLI. See `docs/DEPLOYMENT.md`.

## Scope and external integrations

This is a working local delivery-management application, not a connected logistics business. Courier services and rates are sample Roxy services. There is no actual carrier dispatch, live GPS/geocoding, payment gateway, SMS/email provider, fingerprint authentication, native mobile biometric API, or external OTP verification. The map is a route illustration and is labelled accordingly. The checkout never collects real card details. Email/SMS preferences are saved but do not send messages. Local password recovery shows a token link only when demo mode is enabled; production email recovery is unavailable until a provider is implemented.

The reference is a collection of small mobile mockups. This build adapts its brand, colour palette and parcel workflows to a responsive web application; it is not a pixel-for-pixel Adobe XD export, APK, or native iOS application. Before any public rollout, connect the required providers, review security and privacy requirements, and complete deployment-specific testing. No such provider accounts or credentials were supplied.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `node` is not recognized | Install Node 24.x, ensure **Add to PATH** is enabled, then reopen the terminal. |
| `No such built-in module: node:sqlite` | You are running an older Node version. Confirm `node --version` begins with `v24`. |
| Window closes / permission error | Extract the entire ZIP to a normal writable project directory, not inside the ZIP or Program Files. Run START-WINDOWS.bat from Command Prompt to see the error. |
| Port 4000 already in use | Stop the other process, or set `PORT=4001` in `.env`. The start script opens the printed port. Dev mode reserves backend port 4000. |
| Frontend changes do not appear | Use port 4173 in dev mode, or run `npm run build` and then refresh port 4000. |
| Blank page after opening HTML | Start the Node server. The API and built assets require HTTP, not `file://`. |
| npm fails or times out | The prebuilt app still starts without npm installation. For source changes, check your registry/network configuration and rerun SETUP-WINDOWS.bat. |
| `vite` not recognized | Run `npm ci` or SETUP-WINDOWS.bat before developer mode. |
| Secure cookie blocks local login | Use `COOKIE_SECURE=false` for local HTTP and `true` only with HTTPS. |
| Demo login stopped working | The account’s password may have changed in your persistent database. Use local demo recovery, or choose a new database path for a separate fresh demo. |
| Quote/booking validation fails | Use a supported city, six-digit PIN code not starting with zero, positive dimensions, weight 0.1–30 kg, and pickup within the next 30 days. |
| No live tracking or email arrives | These providers are not connected. Use the admin status controls and in-app notifications. |

## Project structure

| Path | Contents |
| --- | --- |
| `src/` | React screens, forms, shared components and responsive styles |
| `server/index.mjs` | HTTP API, session authorization, workflow endpoints and static hosting |
| `server/db.mjs` | SQLite schema, queries, transactions and demo seed |
| `server/domain.mjs` | Validation, password hashing, quote arithmetic and state transitions |
| `scripts/` | Development launcher, prebuilt launcher and admin creation CLI |
| `tests/app.test.mjs` | API integration and domain tests |
| `public/` | Offline favicon and static assets |
| `dist/` | Prebuilt frontend ready to serve |
| `docs/` | API, architecture, deployment and validation notes |

Dependencies: React 19.2.0, Vite 7.3.1, Lucide React 0.468.0. The runtime backend uses only Node 24 built-ins. See `THIRD-PARTY-NOTICES.md` for dependency licences.
