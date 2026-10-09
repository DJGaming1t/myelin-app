-- Apply once using D1 migrations. No client workspace content or tokens stored.
CREATE TABLE assistant_control (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  cooldown_until INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_until >= 0)
);
INSERT INTO assistant_control(singleton, cooldown_until) VALUES(1, 0);
CREATE TABLE assistant_attempts (
  user_key TEXT NOT NULL,
  request_key TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  active_until INTEGER NOT NULL,
  PRIMARY KEY(user_key, request_key)
);
CREATE INDEX assistant_attempts_time ON assistant_attempts(started_at);
CREATE INDEX assistant_attempts_user_time ON assistant_attempts(user_key, started_at);
CREATE INDEX assistant_attempts_active ON assistant_attempts(active_until);
CREATE INDEX assistant_attempts_user_active ON assistant_attempts(user_key, active_until);
