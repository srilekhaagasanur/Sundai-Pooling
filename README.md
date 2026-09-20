# RideMatch — SundAI Pooling

**RideMatch** helps people leaving **SundAI at 292 Main St (IHQ)** find someone headed a nearby way, pair up, and open a shared **Uber multi-stop** ride instead of taking two separate trips.

**Live:** https://sundai-pooling.vercel.app

**One-liner:** Leave SundAI together — match someone headed near you, confirm, and open a multi-stop Uber from IHQ.

---

## The idea

After an event, everyone is walking out to book a ride. If two people are going to places within ~2 miles of each other, they can share one car: pickup at IHQ, drop off person A, then person B (or the reverse). RideMatch finds that partner, makes sure both confirm, then hands you an Uber link with a suggested stop order — plus the other order if Uber’s road route prefers it.

Guests can try a destination and see who’s on the board **before** signing in. Posting or joining requires Google so pairs stay accountable.

## How it works

1. Sign in with Google (or preview as a guest)
2. Pick your dropoff with Google Places
3. See riders within ~2 miles of your dropoff (ranked by road distance when available)
4. Join → both confirm → lock
5. Open Uber with IHQ → stop 1 → stop 2 (recommended + reverse)

## Tech stack

- **Frontend:** React + Vite, deployed on **Vercel**
- **Backend / data:** **Supabase** (Postgres, Auth, RPCs for join / confirm / leave / upsert)
- **Auth:** Google OAuth via Supabase
- **Places:** Google Maps Places Autocomplete (destination search + lat/lng)
- **Matching:** Haversine shortlist (~2 miles), then **OpenRouteService** matrix to re-rank by driving distance
- **Routing for Uber order:** OpenRouteService directions (with haversine fallback)
- **Deep links:** Uber `m.uber.com/looking` multi-stop (pickup + drops)

## Limitations

- Fixed origin only (IHQ / 292 Main St) — not a general citywide pooler
- Pairs of **2** riders only
- “Nearby” is dropoff-to-dropoff distance (~2 miles), not “on my way / minimal detour”
- Road distances use OSM via OpenRouteService (not Uber’s live ETA/fare)
- Suggested stop order may still differ from what Uber shows on the road
- Hackathon-open Supabase policies (fine for demo; tighten for production)
- Relies on polling for live updates (not full realtime UX everywhere)
- No payments, ratings, or in-app chat

## Future work

- **Minimal-detour / “on the way” matching** — pair people even if dropoffs are farther apart when the shared path barely adds time vs two solos
- Live traffic-aware ETAs and fairer “extra minutes for each rider” scoring
- Lyft (or other) single-destination links
- Map on the locked screen showing IHQ + both stops
- Stronger privacy (public board without exposing full identities; stricter RLS)
- Groups larger than 2, scheduled meetup windows, and push/SMS when a match appears
