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

## 5. Google Auth (Sign in with Google)
1. Google Cloud → OAuth client (Web) with redirect URI  
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
2. Supabase → **Authentication → Providers → Google** → paste Client ID/secret.
3. Supabase → **Authentication → URL Configuration** → add:
   - `http://localhost:5173`
   - `https://sundai-pooling.vercel.app`
4. App shows **Sign in with Google** before posting/joining.

## 5b. User id on rides (existing projects)
If `rides` already exists, also run `supabase/user_id.sql` once so each ride can store `user_id` and only one open ride per user is allowed.

## 5c. Confirm by user id (existing projects)
Run `supabase/confirm_by_user.sql` once so join/confirm/leave match on `user_id` inside `members` (fixes same-display-name double confirm).

## 5d. Places destination fields (existing projects)
Run `supabase/places_dest.sql` once for `place_id` / `dest_lat` / `dest_lng`.  
Add `VITE_GOOGLE_MAPS_API_KEY` to `frontend/.env` and Vercel (public browser key with HTTP referrer restrictions).

## 6. Before the demo
- Confirm the Supabase project is awake (open the dashboard once).
- Clear old `rides` rows between rounds if the board gets noisy.
- Prefer distinct Google accounts on two phones for a dry run.
- Post two test rides to the same destination and complete join → confirm → locked.
- Optional: clear old rows in **Table Editor** → `rides` between demo rounds.

## Leave / cancel (existing projects)
If you already ran an older `schema.sql`, also run `supabase/leave_cancel.sql` once so `cancel_ride` and `leave_pair` exist and `cancelled` is allowed.
