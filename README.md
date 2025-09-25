# Phamily — CMS Physician Matcher & Pro Forma

React + Vite + Tailwind + Recharts frontend, with a Vercel Edge Function proxy to CMS to avoid CORS/timeouts.

## Features
- Upload/type names or NPIs, verify + match to CMS dataset
- Adjustable assumptions (bene scale, MA factor, 99490 rate, qualification rate, etc.)
- Live charts (financials, billable events) + KPI dashboard
- CSV export: physician-level + rolled-up pro forma
- Clean Phamily-aligned UI

## Local Dev

### Prereqs
- Node 18+ (recommend `nvm`)
- GitHub account
- Vercel account

### Run
```bash
npm i
npm run dev
