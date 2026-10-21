# HTTP API

Base URL: `http://localhost:4000/api`. All mutation bodies are JSON and must include `Content-Type: application/json`. Authentication uses the `roxy_session` cookie, not a bearer token. Use your HTTP client’s cookie jar after login. Errors use `{ "error": "Readable explanation" }` and an appropriate 4xx/5xx status.

## Public endpoints

| Method | Path | Body / behaviour |
| --- | --- | --- |
| GET | `/health` | Runtime status and demo mode |
| GET | `/catalog` | Supported cities, courier services and statuses |
| POST | `/auth/register` | `{name,email,phone,password}`; always creates a customer |
| POST | `/auth/login` | `{email,password}`; issues session cookie |
| POST | `/auth/logout` | `{}`; removes current session |
| POST | `/auth/forgot` | `{email}`; demo-only recovery token response |
| POST | `/auth/reset` | `{token,password}`; single-use recovery and session revocation |
| GET | `/track/:tracking` | Public tracking, without personal contact/address details |

## Authenticated endpoints

| Method | Path | Body / behaviour |
| --- | --- | --- |
| GET | `/auth/me` | Current user, excluding password hash |
| PATCH | `/profile` | `{name,phone}` |
| POST | `/profile/password` | `{current_password,password}` |
| PATCH | `/settings` | `{email_updates:boolean,sms_updates:boolean}` |
| GET | `/addresses` | Own saved addresses |
| POST | `/addresses` | Address fields and `label` |
| PUT | `/addresses/:id` | Full replacement of own address fields and label |
| DELETE | `/addresses/:id` | `{}`; delete saved address only |
| POST | `/quotes` | `{pickup_city,drop_city,parcel,courier_id}` |
| GET | `/shipments` | `status`, `q`, `page` query parameters; 12 records per page |
| POST | `/shipments` | Booking payload below |
| GET | `/shipments/:id` | Full parcel details and events; owner or admin |
| POST | `/shipments/:id/cancel` | `{}`; before pickup only |
| POST | `/shipments/:id/demo-payment` | `{}`; test payment, demo mode only |
| GET | `/dashboard` | Counts, paid totals, recent parcels and notifications |
| GET | `/notifications` | Latest 100 own notifications |
| POST | `/notifications/read` | `{}`; mark all own notifications read |
| GET | `/tickets` | Own conversations; admin sees all |
| POST | `/tickets` | `{subject,message}` |
| GET | `/tickets/:id` | Conversation and messages; owner or admin |
| POST | `/tickets/:id/messages` | `{message}`; open conversations only |

## Admin endpoints

| Method | Path | Body / behaviour |
| --- | --- | --- |
| GET | `/admin/overview` | Customers, courier tariffs, latest 100 audit actions |
| PATCH | `/admin/shipments/:id` | `{status,location,note,cod_collected?}`; sequential lifecycle updates |
| PATCH | `/tickets/:id` | `{status:"open"|"closed"}` |

Administrators also see all records from `/shipments` and aggregate metrics from `/dashboard`. A service is selected at booking and remains attached to the parcel. This version does not offer post-booking courier reassignment or a separate courier-driver account.

## Payload shapes

```json
{
  "pickup": {
    "name": "Demo Sender",
    "phone": "+91 90000 00001",
    "line": "12 Sample Street",
    "city": "Dehradun",
    "pincode": "248001"
  },
  "drop": {
    "name": "Demo Recipient",
    "phone": "+91 90000 00002",
    "line": "34 Example Road",
    "city": "Delhi",
    "pincode": "110001"
  },
  "parcel": {
    "type": "parcel",
    "description": "Books",
    "weight": 1,
    "length": 20,
    "width": 15,
    "height": 10
  },
  "pickup_date": "REPLACE_WITH_TODAY_YYYY-MM-DD",
  "courier_id": "roxy-express",
  "payment_method": "cod",
  "notes": "Call before pickup",
  "idempotency_key": "generate-a-unique-key-per-booking"
}
```

Parcel types: `document`, `parcel`, `fragile`. Payment methods: `cod`, `demo` (enabled only in demo mode). Send the same idempotency key only when retrying the same booking; use a new key for a new booking. The fee is always recalculated by the backend. `total_paise` and `status` supplied by a client are not accepted as authoritative.

## Common status codes

`200` success, `201` created, `400` invalid input, `401` no valid session, `403` admin access or origin denied, `404` absent or inaccessible record, `409` duplicate account or invalid workflow transition, `413` request over 64 KiB, `415` non-JSON mutation, `429` rate limited, `503` unsupported/unconfigured operation.
