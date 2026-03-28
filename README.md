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
