CREATE TABLE IF NOT EXISTS wallets(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

INSERT INTO wallets (tenant_id, owner_name, balance) VALUES ('tenant-a', 'Alice', 10000);

INSERT INTO wallets (tenant_id, owner_name, balance) VALUES ('tenant-a', 'Bob', 5000);

INSERT INTO wallets (tenant_id, owner_name, balance) VALUES ('tenant-b', 'Charlie', 25000);

CREATE TABLE IF NOT EXISTS transactions(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  from_wallet_id UUID NOT NULL REFERENCES wallets(id),
  to_wallet_id UUID NOT NULL REFERENCES wallets(id),
  amount BIGINT NOT NULL CHECK(amount>0),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS api_keys(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO api_keys( tenant_id, key_hash, label) VALUES ('tenant-a', encode(sha256('sk_test_tenant_a'::bytea), 'hex'), 'Tenant A Test Key');

INSERT INTO api_keys( tenant_id, key_hash, label) VALUES ('tenant-b', encode(sha256('sk_test_tenant_b'::bytea), 'hex'), 'Tenant B Test Key');

CREATE TABLE IF NOT EXISTS ledger_entries(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  entry_type TEXT NOT NULL CHECK(entry_type in ('DEBIT', 'CREDIT')),
  amount BIGINT NOT NULL CHECK ((entry_type = 'DEBIT' AND amount < 0) OR (entry_type = 'CREDIT' AND amount > 0)),
  balance_after BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_created ON ledger_entries(tenant_id, wallet_id, created_at DESC);