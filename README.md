# BudgetIt

BudgetIt is a personal finance workspace with UI prototypes and reference assets for budgeting, savings goals, dashboards, and financial tracking.

## Repository Structure

- `BudgetIT/` - Main web app files and backend API (`index.html`, `app.html`, `app.js`, `styles.css`, `server.js`)
- `FINANCIAL/` - Design and dashboard prototype variants

## Quick Start

### Main app

1. Open `BudgetIT/index.html` in your browser.
2. Or run with a local static server from the `BudgetIT` folder.

Example using Node:

```bash
cd BudgetIT
npx serve .
```

Then open the local URL shown in your terminal.

### Backend API

From the `BudgetIT` folder:

```bash
npm install
npm run start
```

API base URL: `http://localhost:3001`

Available endpoints:

- `GET /api/health`
- `GET /api/summary`
- `GET /api/income`
- `POST /api/income`
- `PUT /api/income/:id`
- `DELETE /api/income/:id`
- `GET /api/expenses`
- `POST /api/expenses`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`
- `GET /api/savings-goals`
- `POST /api/savings-goals`
- `PUT /api/savings-goals/:id`
- `DELETE /api/savings-goals/:id`

## Notes

- Data is persisted in `BudgetIT/data/store.json`.
- Update this README as your project scope evolves.

## Deploying To Vercel

This repository uses a subfolder (`BudgetIT/`) for the frontend files. A root `vercel.json` is included so Vercel routes `/` and app assets correctly.

### Recommended Vercel settings

- Framework Preset: `Other`
- Root Directory: repository root (do not switch to `BudgetIT` when using the included `vercel.json`)
- Build Command: leave empty
- Output Directory: leave empty

### Important backend note

The current Express backend (`BudgetIT/server.js`) is designed for local Node runtime and file-based storage. Vercel static hosting does not run that server as-is.

If you want API endpoints on Vercel, move API routes to serverless functions (for example `api/*.js`) and use a cloud database instead of writing to local files.
