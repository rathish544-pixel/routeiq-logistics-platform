# RouteIQ — Implementation Map (Phase 0 Discovery)

## Repository Snapshot

| Layer | State | Notes |
|---|---|---|
| Frontend | **Complete & building** | React 19 + Vite 8 + TS 6 + Tailwind 4 + React Router 7 + Leaflet. Typecheck ✓, production build ✓. |
| Backend | **Complete** | FastAPI + SQLAlchemy 2 + Pydantic 2 + OR-Tools + OSRM + Redis. Auth-protected routers, dynamic rerouting, SLA monitor, analytics, settings. |
| Database | **Live, seeded** | Local PostgreSQL `logistics_db`, 8 tables, seed data (10 orders, 5 drivers, 6 routes). |
| Redis | **Live** | Local Redis accepting connections; offline-safe in-memory fallback. |
| Stitch design | **Extracted** | `/tmp/stitch_extract/` — DESIGN.md + 13 screens (PNG + HTML). |
| Tests | **37 passing** | `backend/tests` pytest suite (unit + API) in `conftest`-isolated env. |
| Deployment config | **Complete** | `requirements.txt`, `.env.example` (both ends), env-driven CORS, `frontend/vercel.json`, `DEPLOYMENT.md`. |
| Git | Empty repo | No commits yet; working tree staged + modified. |

## Frontend (already implemented, matches Stitch)

- **Design system** in `src/index.css` — theme tokens map 1:1 to Stitch DESIGN.md (surfaces `#0A0D14/#121824/#172033`, status colors, JetBrains Mono/Inter/Plus Jakarta Sans).
- **App shell**: `Sidebar` (nav: Dashboard, Orders, Drivers, Route Optimization, Live Tracking, Delays & Alerts, Analytics, Settings & Policies), `TopBar` (sector chip, WS telemetry indicator, force sync, user chip), `AppLayout`.
- **Pages** (all 9): Login, Dashboard, Orders, Drivers, Optimization, LiveTracking, Delays, Analytics, Settings.
- **Components**: MetricCard, StatusBadge, TacticalButton, Modal, Loading/Empty/Error states, FleetMap, CreateOrderModal, CreateDriverModal, AssignOrderModal.
- **API layer** (`src/api/`): client with auth header + error handling; orders, drivers, optimization, assignments, delays, analytics, settings, auth.
- **Hooks**: `useAuth` (Supabase w/ local fallback), `useWebSocket` (auto-reconnect, 3s backoff).

## Backend (implemented)

- **Models** (8): drivers, orders, routes, route_orders, driver_locations, system_alerts, optimization_runs, app_settings — schema matches frontend types.
- **Services**: OR-Tools VRP optimizer (capacity, pickup-before-delivery, hard deadlines, soft priority bounds), OSRM matrix + geometry (haversine fallback), dynamic routing, delay detection, ETA, best-driver assignment, Redis client (memory fallback), WebSocket manager, driver movement simulator.
- **Routes present**: orders (CRUD partial), drivers (list/create only), assignment (single order), optimizer (run/list/geometry), tracking (location/history/live/ws), dynamic routing (recalculate), delay detection (per-order), auth (stub).

## Backend — Missing API surface (frontend already calls these)

| Endpoint | Used by |
|---|---|
| `PATCH /orders/{id}` , `DELETE /orders/{id}` | OrdersPage / detail actions |
| `GET /drivers/{id}`, `PATCH /drivers/{id}`, `PATCH /drivers/{id}/status` | Drivers detail & availability toggle |
| `GET /tracking/ws/events` (broadcast WebSocket) | `useWebSocket` connects to it — **currently 404** |
| `GET /optimization/routes/{id}` | Route details |
| `POST /assignments/auto-assign-all` | Dashboard "Auto-Assign Backlog" |
| `GET /delays/summary`, `POST /delays/scan`, `GET /delays/alerts`, `PATCH /delays/alerts/{id}/ack` | Delays page + Dashboard escalation queue |
| `GET /analytics/dashboard`, `GET /analytics/performance`, `GET /analytics/comparison` | Dashboard KPIs + Analytics page |
| `GET /settings/`, `PUT /settings/` | Settings page |

## Backend — Response-shape gaps

- `GET /optimization/routes` returns only `{order_id, stop_sequence}` per stop — frontend expects full stops (lat/lng, stop_type, weight, priority, ETA, deadline, delivery_status) plus driver_name, vehicle_capacity, total_weight, route_code.
- `POST /optimization/multi-driver` response lacks `metrics` (avg capacity utilization, on-time compliance, fleet distance, late count) and `execution_time_seconds`.
- `POST /assignments/order/{id}` ignores optional `driver_id` override; lacks scoring/breakdown feedback.
- `/auth/login` & `/auth/me` are stubs; backend never verifies the Supabase JWT sent by the frontend.
- `ws_manager` exists but is **never used**; the simulator never broadcasts events.

## Stitch screens not yet reflected in UI

- Order Details (`order_details_ord_9912`) — clickable order numbers in Orders table do nothing today.
- Driver Details (`driver_details_marcus_brody_drv_409`) — no detail view.
- Route Details & Dynamic Rerouting (`route_details_dynamic_rerouting_rt_882`) — no dedicated view/comparison.
- Global search in the header (Stitch top bar has a search input) — missing.
- TopBar lacks the Stitch "Create Order" / "Dispatch Override" quick actions.

## Phase plan (22 phases)

0. ✅ Discovery & map (this doc)
1. Design system & foundation — audit vs Stitch; add header search + quick actions
2. Backend foundation — requirements.txt, .env.example, CORS from env, health, cleanup (remove `app/order.py` leftover, unused imports)
3. Auth & security — Supabase JWT verification dependency, protect routes, real `/auth/me`
4. Orders — PATCH/DELETE, search/filter/sort params, Order Details view (Stitch)
5. Drivers — GET/{id}, PATCH, status endpoint, Driver Details view (Stitch)
6. Assignment — auto-assign-all, driver_id override, scoring feedback
7. Optimization engine — enriched responses, metrics, run persistence, routes/{id}
8. Route details & map — full stop itinerary, markers, geometry
9. Real-time tracking — `/tracking/ws/events` broadcast, simulator + status events
10. Dynamic rerouting — persist new route, comparison payload (old vs new, ETA deltas)
11. Delay & at-risk — summary/scan/alerts/ack, alert creation + broadcasts
12. Dashboard — real `/analytics/dashboard` metrics
13. Analytics — performance + comparison endpoints
14. Settings — app_settings-backed GET/PUT
15. Real-time architecture — lifecycle, Redis consistency, event propagation
16. Frontend polish — full Stitch comparison pass
17. Testing & QA — pytest (unit/API/optimization/assignment/tracking/delay), typecheck, build
18. Performance — indexes, eager loading, batch geometry, code splitting
19. Observability — structured logging, health/readiness, diagnostics
20. Deployment — env examples, Vercel + backend deployment config, CORS, Supabase
21. E2E validation — full user journey against live stack
22. Final production audit — cleanup + readiness report