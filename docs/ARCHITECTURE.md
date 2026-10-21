# Architecture and domain rules

## Runtime

The browser runs a React single-page application. Hash-based routing supports refreshes without a client routing server. The production Node process serves `dist` and `/api` on the same origin, so credentials stay in an HTTP-only cookie and no CORS token storage is needed. Vite proxies `/api` to Node in development.

Node’s `node:sqlite` module owns the SQLite database. No native npm database package or Python server is required. Database initialization runs on startup using idempotent DDL and a version record in `schema_migrations`. SQLite uses WAL, foreign keys and a busy timeout. The schema starts at version 1; future schema changes should add explicit, ordered migrations.

All amounts are integer paise. Stored pickup and delivery addresses are booking snapshots: edits to the address book do not rewrite historic parcels. IDs and session tokens are generated with cryptographically secure randomness. Quote calculation and lifecycle validation run on the server regardless of frontend controls.

## Data model

| Table | Responsibility |
| --- | --- |
| users | Identity, password hash, customer/admin role, saved notification preferences |
| sessions | SHA-256 hashes of opaque session tokens and expiry |
| password_resets | SHA-256 hashes of single-use recovery tokens and expiry |
| addresses | Customer-owned reusable contacts and locations |
| couriers | Three sample delivery services and rate parameters |
| shipments | Owner, tracking code, immutable booking snapshots, fee, payment state, delivery state |
| events | Chronological delivery milestones with location and note |
| notifications | Customer in-app update messages and read flags |
| tickets | Customer-owned support conversations |
| messages | Messages tied to a conversation and authenticated sender |
| audit_log | Actor and action records for booking, payment and delivery updates |
| schema_migrations | Database schema version |

## Delivery state machine

`booked → picked_up → in_transit → out_for_delivery → delivered`

Only the immediately next stage is allowed. Only a booked parcel may transition to `cancelled`. Customers can cancel their own booked parcels; administrators can manage all parcels. Delivered and cancelled records are terminal. COD delivery requires an explicit administrator confirmation that the fee was collected. A demo prepaid parcel must be marked paid before pickup.

State changes, timeline events, notifications and audit entries are committed together in a SQLite transaction. Bookings enforce a unique `(user_id, idempotency_key)` pair, so retrying a successful submission does not create a second parcel. Repeating an already successful test payment does not add another payment event. Cancellation changes a paid demo record to `refunded`; no real refund is attempted.

## Quote calculation

1. Validate actual weight (0.1–30 kg), dimensions (1–120 cm), parcel type and supported cities.
2. Volumetric weight is `length × width × height / 5000`, rounded to two decimals.
3. Billable weight is the greater of actual and volumetric weight, rounded up to 0.5 kg.
4. Service charge is base fee plus billable kilograms × per-kilogram rate, rounded to integer paise.
5. Add ₹80 for different pickup/drop cities, and ₹40 for a fragile parcel.
6. Apply an explicitly labelled sample 18% tax to that subtotal and round to integer paise.

These are illustrative tariffs, not tax advice or prices from a real carrier. The client’s total is ignored during booking. Pickup dates are validated as UTC calendar dates; the UI and server use the same rule. Date-based pickup scheduling does not promise a particular pickup hour.

## Authentication and access

- Passwords use salted scrypt hashes and constant-time comparison.
- Sessions use 32-byte random tokens; only their SHA-256 hashes are stored.
- Cookies are HTTP-only, SameSite=Strict, valid for seven days, and optionally Secure for HTTPS.
- Password changes and recovery invalidate existing sessions. A normal password change issues a fresh current session.
- Production password recovery has no delivery adapter and returns a clear configuration error; local demo recovery returns a 15-minute token link and never claims to send email.
- Customers cannot read or modify another customer’s parcel, address or support thread.
- Signup ignores client-provided roles; administrator creation is a server-side CLI operation.
- Public tracking returns only tracking code, city-level route, status, courier, estimated date and redacted timeline fields.
- Mutations require JSON and validate browser Origin when provided. SQL statements are parameterized.
- Auth and public tracking endpoints have in-memory request limits. For deployment, use a durable shared limiter and edge controls appropriate to traffic.
- Responses include CSP, no-sniff, frame denial and referrer policy headers. The React UI renders user input as text.

## Deliberate operational limits

This single-process SQLite architecture suits a local demonstration or a modest private prototype. Synchronous database and password work share the Node event loop. There is no load-test claim, distributed session infrastructure, large-fleet dispatching, durable job queue or provider webhook processing. The development server is not intended for public hosting. See the deployment notes before exposing the application.
