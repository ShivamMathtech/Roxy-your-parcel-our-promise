# Validation record

Validated on 21 October 2026 using Node.js 24.19.0 in a Linux environment.

## Completed checks

- Server and launcher syntax checks passed.
- Vite optimized production build passed; all assets are local and no CDN is required.
- **16 automated tests passed, 0 failed.** The tests start real HTTP servers against temporary SQLite databases.
- Authentication, role restrictions, private record ownership, input validation, origin checks and public tracking redaction passed.
- Server-side pricing, volumetric weight, idempotent booking, delivery stage ordering and COD confirmation passed.
- Demo payment repetition, cancellation, local refund records, notifications and support conversation controls passed.
- Password changes, one-time recovery, session revocation and database persistence across a server restart passed.
- A fresh non-demo database, administrator creation CLI, secure cookie flags, and disabled demo recovery/payment behaviour passed.
- The lockfile retains Windows x64 optional build packages. Native dependency folders are not shipped.
- Desktop sign-in, dashboard appearance, saved-address selection, and the first booking transition were checked in the preview browser. A browser compatibility issue in booking-key generation was fixed and the corrected screen was confirmed.

## Verification boundaries

Native Windows batch-file execution and Docker startup were not available in the creation environment. Mobile layouts are implemented through responsive CSS; a complete device/browser matrix was not executed. The remaining frontend screens were built successfully and their corresponding server workflows were covered by integration tests, but not every screen received a complete interactive browser walkthrough.

There is no claim of live payment, real courier, SMS, email, GPS, production load or third-party integration testing. The application visibly labels its simulated capabilities, and the deployment guide identifies what must be connected before live use.

## Repeat locally

```bash
npm test
npm run check
npm run build
```

For an acceptance walkthrough, follow the nine-step customer-to-admin workflow in README.md. Tests use temporary databases and leave your regular local data intact.
