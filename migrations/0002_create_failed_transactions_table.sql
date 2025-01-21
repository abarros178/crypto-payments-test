CREATE TABLE IF NOT EXISTS failed_transactions (
  id SERIAL PRIMARY KEY,
  execution_id UUID NOT NULL,
  txid VARCHAR(256),
  address VARCHAR(256),
  amount NUMERIC(18, 8),
  confirmations INT,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
