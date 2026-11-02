CREATE TABLE homes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_members_home FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT uq_members_home_position UNIQUE (home_id, position),
  CONSTRAINT uq_members_home_id UNIQUE (home_id, id)
);

CREATE TABLE bills (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bills_home FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT ck_bills_total_cents_positive CHECK (total_cents > 0),
  CONSTRAINT uq_bills_home_id UNIQUE (home_id, id)
);

CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL,
  bill_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT,
  idempotency_key TEXT,
  CONSTRAINT fk_shares_bill_home FOREIGN KEY (home_id, bill_id) REFERENCES bills(home_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_member_home FOREIGN KEY (home_id, member_id) REFERENCES members(home_id, id) ON DELETE CASCADE,
  CONSTRAINT ck_shares_amount_cents_nonnegative CHECK (amount_cents >= 0)
);

CREATE INDEX idx_bills_home_created ON bills(home_id, created_at, id);
CREATE INDEX idx_shares_home_member_unpaid ON shares(home_id, member_id, paid_at);
CREATE INDEX idx_shares_bill ON shares(bill_id, member_id);
