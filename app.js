const sampleText =
  "Tomorrow around 11 I need to drop off a package at UPS, get Chick-fil-A for lunch, maybe stop by Target, and be home before 3:30.";

const state = {
  mode: "easy",
  lastPlan: null,
};

const providerFoundations = [
  {
    name: "Places",
    status: "Ready for API",
    note: "Resolve natural-language stops into real addresses, hours, ratings, and categories.",
  },
  {
    name: "Routing",
    status: "Ready for API",
    note: "Request commute times, traffic-aware estimates, transit options, and route geometry.",
  },
  {
    name: "Reservations",
    status: "Future partner",
    note: "Hold restaurant tables, book activities, or surface handoff links when APIs are unavailable.",
  },
  {
    name: "Hotels",
    status: "Future partner",
    note: "Attach overnight stays to multi-day plans with check-in windows and cancellation metadata.",
  },
];

const knownPlaces = [
  { token: "ups", name: "UPS", type: "errand", duration: 12 },
  { token: "fedex", name: "FedEx", type: "errand", duration: 12 },
  { token: "post office", name: "Post Office", type: "errand", duration: 15 },
  { token: "chick-fil-a", name: "Chick-fil-A", type: "food", duration: 35 },
  { token: "chickfila", name: "Chick-fil-A", type: "food", duration: 35 },
  { token: "starbucks", name: "Starbucks", type: "coffee", duration: 20 },
  { token: "target", name: "Target", type: "shopping", duration: 42 },
  { token: "costco", name: "Costco", type: "shopping", duration: 55 },
  { token: "trader joe", name: "Trader Joe's", type: "shopping", duration: 30 },
  { token: "whole foods", name: "Whole Foods", type: "shopping", duration: 32 },
  { token: "hotel", name: "Hotel", type: "lodging", duration: 20 },
  { token: "museum", name: "Museum", type: "activity", duration: 90 },
  { token: "park", name: "Park", type: "activity", duration: 45 },
  { token: "restaurant", name: "Restaurant", type: "food", duration: 50 },
];

const elements = {
  input: document.querySelector("#planInput"),
  startTime: document.querySelector("#startTime"),
  startPlace: document.querySelector("#startPlace"),
  returnBy: document.querySelector("#returnBy"),
  planButton: document.querySelector("#planButton"),
  sampleButton: document.querySelector("#sampleButton"),
  stopCount: document.querySelector("#stopCount"),
  commuteTime: document.querySelector("#commuteTime"),
  finishTime: document.querySelector("#finishTime"),
  routeStatus: document.querySelector("#routeStatus"),
  timeline: document.querySelector("#timeline"),
  intentOutput: document.querySelector("#intentOutput"),
  providerGrid: document.querySelector("#providerGrid"),
};

function normalizeTime(value) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function formatTime(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function titleCase(raw) {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function extractDeadline(text, fallback) {
  const lower = text.toLowerCase();
  const match = lower.match(/(?:back|home|return|finish|done).*?(?:by|before)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return fallback;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour < 8) hour += 12;
  return hour * 60 + minute;
}

function extractDate(text) {
  const lower = text.toLowerCase();
  if (lower.includes("tomorrow")) return "tomorrow";
  if (lower.includes("today")) return "today";
  if (lower.includes("weekend")) return "this weekend";
  return "unspecified";
}

function createStopFromPhrase(phrase, index) {
  const cleaned = phrase
    .replace(/\b(i need to|need to|want to|then|and|also|maybe|possibly|stop by|go to|get|grab|buy|drop off|pick up|for lunch|for dinner|for breakfast)\b/gi, " ")
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2) return null;
  return {
    id: `custom-${index}`,
    name: titleCase(cleaned),
    type: "place",
    required: !/\bmaybe|possibly|optional\b/i.test(phrase),
    estimated_duration_minutes: 25,
    source: "inferred phrase",
  };
}

function extractStops(text) {
  const lower = text.toLowerCase();
  const found = [];
  const seen = new Set();

  for (const place of knownPlaces) {
    if (lower.includes(place.token) && !seen.has(place.name)) {
      seen.add(place.name);
      const optionalPattern = new RegExp(`\\b(maybe|possibly|optional)[^.,;]*${place.token}`, "i");
      found.push({
        id: place.token.replace(/\s+/g, "-"),
        name: place.name,
        type: place.type,
        required: !optionalPattern.test(text),
        estimated_duration_minutes: place.duration,
        source: "known place dictionary",
      });
    }
  }

  if (found.length > 0) return found;

  return text
    .split(/,|\.|;|\band then\b|\bthen\b/gi)
    .map(createStopFromPhrase)
    .filter(Boolean)
    .slice(0, 6);
}

function optimizeStops(stops, mode) {
  const priority = {
    easy: ["errand", "shopping", "food", "coffee", "activity", "lodging", "place"],
    fast: ["errand", "food", "coffee", "shopping", "activity", "lodging", "place"],
    meal: ["errand", "coffee", "food", "shopping", "activity", "lodging", "place"],
  };
  const order = priority[mode] || priority.easy;
  return [...stops].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return order.indexOf(a.type) - order.indexOf(b.type);
  });
}

function commuteBetween(index, mode) {
  const base = mode === "fast" ? 10 : mode === "meal" ? 13 : 15;
  return base + ((index * 7) % 11);
}

function buildIntent() {
  const text = elements.input.value.trim();
  const start = normalizeTime(elements.startTime.value) || 9 * 60;
  const deadline = extractDeadline(text, normalizeTime(elements.returnBy.value));
  const rawStops = extractStops(text);
  const stops = optimizeStops(rawStops, state.mode);

  return {
    date: extractDate(text),
    start_location: elements.startPlace.value.trim() || "Home",
    end_location: "Home",
    start_time: elements.startTime.value,
    deadline: deadline ? formatTime(deadline) : null,
    preference: state.mode,
    stops,
  };
}

function buildItinerary(intent) {
  let cursor = normalizeTime(elements.startTime.value) || 9 * 60;
  const items = [];
  let commute = 0;

  items.push({
    time: formatTime(cursor),
    title: `Leave ${intent.start_location}`,
    detail: `Starting a ${intent.preference} plan for ${intent.date}.`,
    type: "start",
  });

  intent.stops.forEach((stop, index) => {
    const travel = commuteBetween(index + 1, state.mode);
    commute += travel;
    cursor += travel;
    items.push({
      time: formatTime(cursor),
      title: stop.name,
      detail: `${travel} min commute. ${stop.estimated_duration_minutes} min planned for ${stop.type}.`,
      type: stop.type,
      optional: !stop.required,
    });
    cursor += stop.estimated_duration_minutes;
  });

  const returnCommute = intent.stops.length ? commuteBetween(intent.stops.length + 1, state.mode) : 0;
  commute += returnCommute;
  cursor += returnCommute;
  items.push({
    time: formatTime(cursor),
    title: `Arrive ${intent.end_location}`,
    detail: returnCommute ? `${returnCommute} min return commute.` : "No stops detected yet.",
    type: "finish",
  });

  return { items, commute, finish: cursor };
}

function renderItinerary(plan) {
  elements.timeline.innerHTML = "";
  for (const item of plan.items) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="time-block">${item.time}</div>
      <div>
        <h2 class="stop-title">${item.title}</h2>
        <p class="stop-detail">${item.detail}</p>
      </div>
      <span class="badge">${item.optional ? "Optional" : item.type}</span>
    `;
    elements.timeline.append(li);
  }
}

function renderProviders() {
  elements.providerGrid.innerHTML = "";
  for (const provider of providerFoundations) {
    const card = document.createElement("article");
    card.className = "provider-card";
    card.innerHTML = `
      <h3>${provider.name} · ${provider.status}</h3>
      <p>${provider.note}</p>
    `;
    elements.providerGrid.append(card);
  }
}

function buildPlan() {
  const intent = buildIntent();
  const itinerary = buildItinerary(intent);
  state.lastPlan = { intent, itinerary };

  elements.stopCount.textContent = String(intent.stops.length);
  elements.commuteTime.textContent = `${itinerary.commute}m`;
  elements.finishTime.textContent = formatTime(itinerary.finish);
  elements.routeStatus.textContent =
    intent.stops.length > 0
      ? `${intent.stops.map((stop) => stop.name).join(" → ")} → Home`
      : "Add errands, meals, or activities to build a route";
  elements.intentOutput.textContent = JSON.stringify(intent, null, 2);
  renderItinerary(itinerary);
}

document.querySelectorAll(".segmented").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segmented").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.mode = button.dataset.mode;
    if (state.lastPlan) buildPlan();
  });
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.view}View`).classList.add("active");
  });
});

elements.planButton.addEventListener("click", buildPlan);
elements.sampleButton.addEventListener("click", () => {
  elements.input.value = sampleText;
  elements.startTime.value = "11:00";
  elements.returnBy.value = "15:30";
  buildPlan();
});

elements.input.value = sampleText;
renderProviders();
buildPlan();
