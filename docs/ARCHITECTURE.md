# Load Profit — architecture & formulas

Main question the app answers:
**"How much money will I really make on this load, relative to time, miles, risk and capital?"**

Every screen follows: **Gross → Expenses → Profit → Profit/Mile → Profit/Hour → Risk → Recommendation.**

---

## 1. Product architecture

```
src/
  engine/            ← pure TypeScript, no React, no storage, no clock
    types.ts         domain model (LoadInput, Settings, EquipmentProfile…)
    defaults.ts      ALL default assumptions (editable in Settings)
    math.ts          rounding / safe division helpers
    calculate.ts     calculateLoad(): the whole P&L, break-even, score, decision
    scenario.ts      "What if?" overrides
    analytics.ts     history filters, compare, broker stats, dashboard sums
    __tests__/       unit tests with hand-checked numbers
  storage/
    types.ts         DataRepository interface (async) + AppData
    localRepository  localStorage implementation (MVP)
    normalize.ts     forward-compatible migration (deep-merge with defaults)
    exportImport.ts  CSV / Excel CSV / JSON export + CSV/JSON import
  state/store.tsx    React context: app data, draft load, actions
  ui/                components, formatting, charts, router, theme
  pages/             Dashboard, Loads, Calculator, Compare, Reports, Settings, What-If
```

Rules:

- **Calculation logic never lives in UI.** Pages call `calculateLoad(load, settings)` and only format.
- **Saved loads are reproducible.** Each load carries `assumptions` — a snapshot of the cost
  parameters it was created with (maintenance $/mi, fixed costs, hourly rate, allocation method…).
  Changing Settings affects new loads only. "Reload costs from Settings" re-snapshots a draft.
- **No hidden coefficients.** Every number used by a formula is either a load input or a setting.
- **Money lines are rounded to cents before summing**, so breakdowns add up exactly like a spreadsheet.
- **Storage is behind an async interface** (`DataRepository`) so Supabase/PostgreSQL can replace
  localStorage without touching the engine or pages.

## 2. Database schema

MVP stores one JSON document (`AppData`) in localStorage. The shape maps 1:1 to this future SQL schema:

```sql
create table users (id uuid primary key, email text unique, created_at timestamptz default now());

create table settings (
  user_id uuid primary key references users(id),
  data jsonb not null,                 -- Settings (defaults, targets, scoring, thresholds)
  updated_at timestamptz default now()
);

create table equipment_profiles (
  id uuid primary key, user_id uuid references users(id),
  name text not null,
  truck jsonb not null,                -- TruckSpec
  trailer jsonb not null,              -- TrailerSpec
  archived boolean default false
);

create table brokers (
  id uuid primary key, user_id uuid references users(id),
  name text not null, mc_number text, notes text,
  unique (user_id, lower(name))
);

create table loads (
  id uuid primary key, user_id uuid references users(id),
  profile_id uuid references equipment_profiles(id),
  broker_id uuid references brokers(id),
  status text check (status in ('offer','booked','completed','rejected','cancelled')),
  load_number text, commodity text, trailer_type text,
  pickup_city text, pickup_state char(2), delivery_city text, delivery_state char(2),
  pickup_at timestamp, delivery_at timestamp,
  weight_lbs int, stops int, loaded_miles numeric, deadhead_miles numeric,
  revenue jsonb, fuel jsonb, hours jsonb, tolls jsonb, risks jsonb,
  assumptions jsonb not null,          -- frozen cost snapshot
  target_profit_override numeric, trip_days_override numeric,
  invoiced_at date, paid_at date, notes text,
  created_at timestamptz, updated_at timestamptz
);

create table load_expenses (
  id uuid primary key, load_id uuid references loads(id) on delete cascade,
  category text not null, amount numeric(10,2) not null, notes text
);

-- Computed results are NOT stored: they are recomputed by the engine (single source of truth).
-- A materialized view can cache them for reporting if needed.
```

## 3. Calculation formulas

All in `src/engine/calculate.ts`. Notation: `r2()` = round to cents.

| Item | Formula |
|---|---|
| Total miles | `Loaded + Deadhead` |
| Deadhead % | `Deadhead / Total miles × 100` |
| Gross (itemized) | `Broker rate + FSC + Detention + Layover + Tarp + Stop-off + Other` |
| Gross (one total) | the all-in number |
| Effective MPG | `MPG × (1 + adjustment%/100)` (profile MPG = truck MPG × (1 − trailer impact%)) |
| Gallons | `Total miles / Effective MPG` (or manual override) |
| Fuel cost | `Gallons × Diesel price` — all gallons burned; starting fuel only changes *fuel to buy* |
| DEF | `Gallons × DEF% × DEF price` |
| Maintenance / tire / trailer reserves | `Total miles × $/mile` each |
| Tolls | `Estimated tolls + transponder fees` |
| Other trip expenses | Σ line items (lodging, food, lumper…) |
| Factoring | `Gross × factoring%` |
| **Trip expenses** | fuel + DEF + reserves + tolls + other + factoring |
| Fixed — per mile | `Monthly fixed / expected monthly miles × total miles` |
| Fixed — per day | `Monthly fixed / working days × trip days`, trip days = `work hours / work hours per day` (or override) |
| Fixed — per load | `Monthly fixed / expected loads per month` |
| Monthly fixed | business fixed (insurance, ELD, phone…) + profile truck/trailer payments & insurance |
| **Total cost** | trip expenses + allocated fixed |
| **Operating profit** | `Gross − Total cost` |
| Work hours (auto) | `loaded/avg mph + deadhead/avg mph + 1 load + (stops−1) unloads × h/stop + fuel stops × h + inspection + waiting + other` |
| Owner labor value | `Work hours × target hourly rate` |
| **Economic profit** | `Operating profit − Owner labor value` |
| Margin | `Operating profit / Gross` (economic margin also shown) |
| Per mile | `Gross / loaded mi`, `Gross / total mi`, `Profit / total mi` |
| Per hour | `Gross, Operating, Economic profit / work hours`; operating per calendar hour (pickup→delivery + deadhead) |
| Cash break-even | `Costs / (1 − factoring%)` |
| Break-even with labor | `(Costs + Labor) / (1 − factoring%)` |
| Target profit | per load $, or `$ per mile × total miles`, or per-load override |
| **Minimum acceptable rate** | `(Costs + Labor + Target profit) / (1 − factoring%)`, shown rounded up to $25 |
| Negotiation target | `Minimum × (1 + room%)`, rounded up |
| Deadhead cost | `Deadhead miles × variable cost per mile` (fuel + DEF + reserves) |
| Tax estimate | `max(0, Operating profit) × tax rate` — estimate only, not tax advice |

### Load score (0–100)

Each factor is linear between a "bad" value (0 pts) and a "good" value (100 pts), then weighted:

| Factor | Default weight | Bad → Good |
|---|---|---|
| Profit / total mile | 18 | $0 → $2.00 |
| Profit / work hour | 18 | $15 → $100 |
| Economic profit | 10 | $0 → $2,000 |
| Operating margin | 10 | 10% → 50% |
| Revenue / total mile | 8 | $1.25 → $3.00 |
| Deadhead % | 10 | 40% → 5% |
| Fuel % of gross | 5 | 45% → 15% |
| Tolls % of gross | 3 | 8% → 0% |
| Stops | 4 | 6 → 2 |
| Waiting hours | 4 | 8 → 0 |
| Weight % of payload | 5 | 100% → 60% (skipped when weight unknown) |
| Trip length fit | 5 | 100 inside 250–1,200 mi |

`Score = round(Σ(points × weight) / Σ weight − manual risk penalties)`, clamped 0–100.
Bands: 85+ EXCELLENT, 70+ GOOD, 55+ MARGINAL, 40+ RISKY, else BAD.
Auto risks (high deadhead, low margin, …) are already measured by the factors, so they show as
warnings without a second penalty. Manual risks (bad weather, broker payment risk, …) subtract points.

### Decision

1. Gross < cash break-even → **REJECT** (loses money).
2. Score < 40 → **REJECT**.
3. Gross ≥ minimum acceptable → **TAKE** (or **NEGOTIATE** if score < 55).
4. Otherwise, if the gap to minimum ≤ 25% of the offer → **NEGOTIATE**, else **REJECT**.

## 4. Main screens

- **Calculator** (home): 8 quick inputs → instant decision, score, 9 key metrics, minimum rate.
  "Add more expenses & details" opens revenue, fuel/DEF, reserves, fixed allocation, tolls,
  time & labor, other expenses, risk checklist, target profit/tax. Below: P&L breakdown,
  negotiation tool, score breakdown, time, deadhead, fuel + diesel sensitivity, tax estimate.
- **What if?** sliders for diesel, MPG, rate, miles, deadhead, hours, maintenance, insurance, hourly rate.
- **Compare**: up to 4 loads, best value per row, overall winner and "why" insight.
- **Loads**: history with search, filters (date, broker, state, status, profit, rate, miles, score), sort.
- **Dashboard**: month metrics, target progress, 8-week chart, cost composition.
- **Reports**: broker ranking, 6-month results, export/import.
- **Settings**: equipment profiles, defaults, fixed costs & allocation, targets, negotiation, scoring, data.

## 5. User flow

Broker calls → open app (Calculator) → type broker, gross, cities, miles, hours → read TAKE /
NEGOTIATE / REJECT + "I would not take this load below $X" → optionally What-if / add expenses →
Save (status Offer) → Compare with other offers → mark Booked → Completed, set invoiced/paid dates →
Dashboard & broker stats update.

## 6. MVP scope (this build)

Done: calculator, full expense model, profit, break-even, per-mile/hour, load score, decision,
negotiation, risks, what-if, save, history, compare, dashboard, targets, broker stats, tax estimate,
multiple equipment profiles, CSV/Excel/JSON export, CSV/JSON import, dark mode, mobile layout.

## 7. Future architecture

- `SupabaseRepository implements DataRepository` + auth → cloud sync, multiple devices.
- Integrations plug in *before* the engine and only fill `LoadInput` fields:
  routing (Google Maps / Mapbox → loaded/deadhead miles, tolls), fuel price API → diesel price,
  weather → risk flags, broker credit API → payment risk, OCR / AI on rate confirmations and voice input
  ("Broker pays 3200, 700 loaded…") → a parser that returns a partial `LoadInput`.
- QuickBooks / bank import feed actual expenses to compare against estimates.
- The engine stays pure, so it can be reused unchanged in a React Native app or on the server.
