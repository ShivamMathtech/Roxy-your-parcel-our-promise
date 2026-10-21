# Third-party software

Roxy includes an application-specific interface and SVG artwork created for this project. Its design direction was inspired by the user-supplied Roxy image. The original reference image is not redistributed in the ZIP. Roxy branding is used as requested; this project does not grant rights to any pre-existing trademark or design.

The frontend bundle includes these dependencies and their transitive code:

- React and React DOM 19.2.0 — MIT licence. https://github.com/facebook/react
- Lucide React 0.468.0 — ISC licence. https://github.com/lucide-icons/lucide
- Vite 7.3.1 is used only to build/develop the frontend — MIT licence. https://github.com/vitejs/vite
- The Node.js 24 runtime is installed separately. Its embedded SQLite support is provided by Node.js. https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html

See `docs/licenses/` for the dependency licence texts copied from the installed packages. Exact package versions and optional cross-platform dependencies are recorded in `package-lock.json`.
