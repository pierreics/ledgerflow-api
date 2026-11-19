# Multi-Tenant Double-Entry Wallet API

A financial backend built with **TypeScript**, **Express**, and **PostgreSQL** implementing multi-tenant isolation, deadlock-safe concurrent transfers, strict idempotency, and an immutable double-entry ledger.

---

## Core Architecture & Financial Guarantees

- **Multi-Tenant Isolation:** Every request is authenticated via a Bearer API key (`SHA-256` hashed at rest) that resolves to a `tenant_id`. All database queries are scoped by `tenant_id` to prevent cross-tenant data access.
- **Double-Entry Accounting:** Every transfer atomically updates wallet balances and writes paired `DEBIT` (`-amount`) and `CREDIT` (`+amount`) records to `ledger_entries` with `balance_after` snapshots. Database-level `CHECK` constraints enforce sign invariants so the ledger remains zero-sum (`SUM(amount) = 0`).
- **Concurrency & Deadlock Prevention:** Transfers execute inside explicit `BEGIN ... COMMIT` PostgreSQL transactions using row-level locks (`SELECT ... FOR UPDATE`). Wallets are locked in deterministic UUID order (`firstId < secondId`) to prevent circular deadlocks under concurrent load.
- **Strict Idempotency:** `POST /transfers` requires an `x-idempotency-key` header backed by a unique database constraint per tenant. Retrying an identical request safely replays the original transaction (`200 OK`), while reusing a key with a mismatched payload returns `409 Conflict`.
- **Precision Money Representation:** All monetary amounts and balances are stored as `BIGINT` minor units (e.g., cents) in PostgreSQL and handled with `BigInt` in TypeScript to avoid floating-point rounding errors.

---

## Tech Stack

- **Runtime & Language:** Node.js, TypeScript
- **Web Framework:** Express
- **Database:** PostgreSQL (`pg` connection pool)
- **Containerization:** Docker & Docker Compose

---

## Getting Started

### 1. Start & Initialize PostgreSQL
```bash
docker compose up -d
```
PostgreSQL initializes the database schema (`api_keys`, `wallets`, `transactions`, `ledger_entries`) and seed data automatically via `init.sql`.

### 2. Install Dependencies & Configure Environment
```bash
npm install
```
Ensure your `.env` file matches the PostgreSQL credentials configured in `docker-compose.yml`.

### 3. Run the Server
```bash
npm run dev
```
The API listens on `http://localhost:3300`.

---

## API Reference

All endpoints except `GET /health` require:
```http
Authorization: Bearer <YOUR_API_KEY>
```

### `GET /health`
Public database connectivity check.
- **Response (`200 OK`):** `{ "success": true, "data": { "result": { "now": "..." } } }`

### `GET /wallets`
Lists all wallets belonging to the authenticated tenant.
- **Response (`200 OK`):** `{ "success": true, "data": [ ... ] }`

### `POST /transfers`
Executes an atomic, idempotent transfer between two wallets within the same tenant.
- **Headers:** `x-idempotency-key: <unique-string>`
- **Body:**
  ```json
  {
    "fromWalletId": "uuid",
    "toWalletId": "uuid",
    "amount": 100
  }
  ```
- **Responses:**
  - `201 Created` — Transfer executed and double-entry ledger entries recorded.
  - `200 OK` — Idempotent replay of an already-processed transfer.
  - `400 Bad Request` — Invalid input or insufficient funds.
  - `404 Not Found` — Sender or receiver wallet not found in the tenant's scope.
  - `409 Conflict` — Idempotency key reused with different transfer parameters.

### `GET /wallets/:id/ledger`
Returns the chronological double-entry audit trail (`DEBIT` and `CREDIT` entries) for a tenant-owned wallet, ordered newest first.
- **Responses:**
  - `200 OK` — Array of ledger entries with `balance_after` snapshots.
  - `400 Bad Request` — Malformed wallet UUID.
  - `404 Not Found` — Wallet does not exist or belongs to another tenant.