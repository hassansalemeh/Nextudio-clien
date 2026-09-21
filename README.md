# Control

Internal management system for an architecture company.

## Tech stack

- **Frontend**: React + TypeScript + Vite (`client/`)
- **Backend**: Node.js + Express + TypeScript (`server/`)
- **Database**: PostgreSQL (will later be hosted on Supabase)
- **Auth & file storage**: Supabase (planned, not implemented yet)

## Project structure

```
client/   React + TypeScript + Vite frontend
server/   Node.js + Express + TypeScript backend
```

## Getting started

### Frontend

```
cd client
npm install
npm run dev
```

### Backend

```
cd server
npm install
cp .env.example .env
npm run dev
```

The backend starts on `http://localhost:4000` by default. Check it is running with:

```
GET http://localhost:4000/api/health
```

which returns:

```json
{ "status": "ok" }
```

## Production

See [docs/DEPLOY-GODADDY.md](docs/DEPLOY-GODADDY.md). `npm run package` (from the repository root) builds everything and creates
`deploy/nextudio-control-<date>.zip`, the folder to upload. On the host: `npm start` runs the server, `npm run check` tests the
host (database, PDF engine), `npm run backup` / `npm run restore` protect the data. The database is PostgreSQL on Supabase.
