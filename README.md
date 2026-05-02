# RouteDay Planner

RouteDay is a prototype for turning natural language day plans into timed, editable routes.

## What works now

- Natural-language input for errands, meals, shopping, activities, and return constraints.
- Local intent extraction into structured JSON.
- Stop ordering by preference: easiest, fastest, or meal-aware.
- Estimated commute, arrival, dwell, and finish times.
- Itinerary, extracted intent, and future provider foundation views.

## Intended architecture

```text
User request
-> model-backed intent extraction
-> place resolution
-> route/time optimization
-> editable itinerary
-> booking/action provider layer
```

The current app uses a browser-side parser so it works without credentials. The next step is to replace `buildIntent()` in `app.js` with an API call that returns the same JSON shape using structured model output.

## Future provider adapters

- Places: addresses, hours, categories, and candidate locations.
- Routing: commute estimates, traffic, transit, walking, and route geometry.
- Reservations: restaurants and activities.
- Hotels: lodging options and booking metadata.
- Orders: pickup windows for food, retail, and errands.

## Run locally

Open `index.html` directly, or run:

```bash
python3 -m http.server 4174 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:4174/`.
