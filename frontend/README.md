# RideMatch frontend

Vite + React app. Ride data lives in **Supabase** (not the local FastAPI server).

## Setup

1. Follow [`../SUPABASE.md`](../SUPABASE.md) to create the project and run `supabase/schema.sql`.
2. Copy env and add your keys:

```bash
cp .env.example .env
```

3. Install and run:

```bash
npm install
npm run dev
```
