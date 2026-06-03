# Repository Guidelines

## Project Structure & Module Organization

This repository is split into two Node projects. `client/` contains the Vue 3 + Vite frontend, with application code in `client/src/`, static assets in `client/public/`, and built output in `client/dist/`. Frontend modules are grouped by role: `components/`, `components/charts/`, `components/ui/`, `views/`, `stores/`, `router/`, `layouts/`, and `composables/`.

`server/` contains the Express + MongoDB API. Entry point is `server/index.js`; route definitions live in `server/routes/`, request handlers in `server/controllers/`, Mongoose schemas in `server/models/`, auth middleware in `server/middleware/`, and background or external API logic in `server/services/`.

## Build, Test, and Development Commands

Run commands from the relevant subdirectory.

- `cd client && npm run dev`: start the Vite development server.
- `cd client && npm run build`: create the production frontend bundle in `client/dist/`.
- `cd client && npm run preview`: serve the built frontend locally.
- `cd server && npm run dev`: start the API with Node watch mode.
- `cd server && npm start`: start the API normally.

Install dependencies separately in each project with `npm install`.

## Coding Style & Naming Conventions

Use JavaScript throughout. The frontend uses ES modules, Vue single-file components, Pinia stores, and PrimeVue. The backend uses CommonJS modules. Match the existing style: 2-space indentation, no semicolons, single quotes, and concise async functions.

Name Vue components in PascalCase, for example `StockChart.vue` or `AddTransactionModal.vue`. Name composables with a `use` prefix, such as `useApi.js`. Backend files generally use camelCase for controllers, routes, middleware, and services, while Mongoose model files use PascalCase.

## Testing Guidelines

No automated test scripts are currently configured in either `package.json`. Before opening a PR, run at least `npm run build` in `client/` and manually verify API flows with `npm run dev` in `server/`. When adding tests, place them beside the feature or under a clear `tests/` folder and add the corresponding `npm test` script.

## Commit & Pull Request Guidelines

Recent commits use short imperative or descriptive subjects, such as `Fix v-model syntax in EditTransactionModal`. Keep subjects focused and under one line.

PRs should include a brief description, changed areas (`client`, `server`, or both), verification steps, linked issues when relevant, and screenshots or screen recordings for UI changes.

## Security & Configuration Tips

Do not commit real secrets. Use `server/.env.example` as the backend template and keep deployment values in environment-specific secret stores. Frontend production API configuration belongs in `client/.env.production`.
