# Supabase setup (hackathon)

## 1. Create a project
1. Go to https://supabase.com and create a free project.
2. Wait until the database is ready.

## 2. Create the tables and functions
1. Open **SQL Editor** → **New query**.
2. Paste everything from `supabase/schema.sql`.
3. Click **Run**.

If Realtime says the table is already in the publication, you can ignore that one line and re-run the rest.

## 3. Copy API keys into the frontend
1. Open **Project Settings** → **API**.
2. Copy **Project URL** and the **anon public** key.
3. In `frontend/`:

```bash
cp .env.example .env
```

4. Fill in:

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 4. Run the app
```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL on two phones/browsers (same Wi‑Fi or public deploy later). You no longer need the FastAPI backend for the demo flow.

## 5. Before the demo
- Confirm the Supabase project is awake (open the dashboard once).
- Post two test rides to the same destination and complete join → confirm → locked.
- Optional: clear old rows in **Table Editor** → `rides` between demo rounds.
