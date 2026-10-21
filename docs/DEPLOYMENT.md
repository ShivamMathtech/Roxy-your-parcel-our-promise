# Running beyond your laptop

The application is a stateful Node service with a local SQLite file. Deploying only `dist/` to a static host does not deploy the API or database. Do not use an ephemeral filesystem for the database.

## Docker demonstration

```bash
docker compose up --build -d
docker compose logs -f
```

Open `http://localhost:4000`. The supplied Compose configuration exposes the service on the host loopback address only and uses a named volume for the database. It defaults to demo mode. Stop with `docker compose down`; this preserves the named volume. Back up the database before changing or removing storage. Docker execution has not been validated in the creation environment.

## Fresh installation without sample credentials

1. Choose a **new** database file or volume. Disabling demo mode on an existing demo database does not remove seeded accounts.
2. Set `DEMO_MODE=false` before the first startup.
3. For a local Node deployment, create an admin with `npm run admin:create`. Prompts collect name, email, phone and a hidden password. The CLI always disables demo seeding and refuses to overwrite an existing account.
4. For Docker, use `docker compose exec roxy node scripts/create-admin.mjs` after starting with `DEMO_MODE=false` and a fresh volume.
5. Customers register using the application. There is no public admin signup.

## HTTP service deployment

Build with `npm ci && npm run build`, or use the included prebuilt frontend for the initial version. Start `node server/index.mjs` using your process manager. Set:

```dotenv
HOST=127.0.0.1
PORT=4000
DEMO_MODE=false
COOKIE_SECURE=true
APP_ORIGIN=https://your-real-domain.example
DB_PATH=/persistent/roxy/roxy.sqlite
```

Use a reverse proxy that terminates HTTPS, preserves the correct host, forwards requests to this service, and sets sensible limits. The browser and API should share the same public origin. If using Docker, bind the container to `0.0.0.0` internally while restricting the exposed host port appropriately. `COOKIE_SECURE=true` requires HTTPS in the browser; use false only for local HTTP testing.

This project does not provision a cloud provider, domain, TLS certificate or secret store. The supplied container runs as the non-root `node` user. Keep the database volume writable by that user.

## External services to implement for a real business

| Requirement | Current behaviour | Integration needed |
| --- | --- | --- |
| Carrier dispatch | Local booking + administrator events | Carrier API, verified webhooks, retries, reconciliation |
| Live map | Labelled SVG route illustration | Geocoding, route service and consented driver location data |
| Card/UPI checkout | Test payment or COD record | Gateway order creation, server verification and signed webhooks |
| Email/SMS | Preferences only; no outbound delivery | Provider adapters, delivery errors, opt-outs and queues |
| Password recovery | Demo link; disabled in production mode | Private email delivery, verified account recovery policy |
| OTP/fingerprint screens | Not implemented | Proper OTP provider or WebAuthn/mobile biometric integration |
| Tax invoices | Sample fee breakdown and booking receipt | Business-specific taxation and invoice requirements |
| Scale and operations | One process and SQLite | Capacity tests, shared rate limits, monitoring, backups and recovery drills |

Do not expose the sample accounts or enable demo recovery in a public installation. Add deployment-specific access review and dependency updates before using real customer information. No real payment, messaging or courier provider was configured or tested in this deliverable.
