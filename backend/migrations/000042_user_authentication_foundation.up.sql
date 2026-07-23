PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_user_accounts (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL UNIQUE,
  login TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (LENGTH(TRIM(login)) BETWEEN 1 AND 254),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  last_login_at DATETIME,
  password_changed_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES authz_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_auth_user_accounts_active
  ON auth_user_accounts(active);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  revoked_at DATETIME,
  user_agent TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (account_id) REFERENCES auth_user_accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_account_active
  ON auth_sessions(account_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
  ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (account_id) REFERENCES auth_user_accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_auth_password_reset_account_active
  ON auth_password_reset_tokens(account_id, used_at, expires_at);

CREATE TRIGGER IF NOT EXISTS trg_auth_user_accounts_delete_prohibited
BEFORE DELETE ON auth_user_accounts
BEGIN
  SELECT RAISE(ABORT, 'authentication_account_deletion_not_allowed');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_user_accounts_actor_id_immutable
BEFORE UPDATE OF actor_id ON auth_user_accounts
WHEN NEW.actor_id <> OLD.actor_id
BEGIN
  SELECT RAISE(ABORT, 'authentication_actor_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_user_accounts_login_normalized_insert
BEFORE INSERT ON auth_user_accounts
WHEN NEW.login COLLATE BINARY <> LOWER(TRIM(NEW.login)) COLLATE BINARY OR TRIM(NEW.login) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_login_must_be_normalized');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_user_accounts_login_normalized_update
BEFORE UPDATE OF login ON auth_user_accounts
WHEN NEW.login COLLATE BINARY <> LOWER(TRIM(NEW.login)) COLLATE BINARY OR TRIM(NEW.login) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_login_must_be_normalized');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_user_accounts_password_hash_required_insert
BEFORE INSERT ON auth_user_accounts
WHEN TRIM(NEW.password_hash) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_password_hash_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_user_accounts_password_hash_required_update
BEFORE UPDATE OF password_hash ON auth_user_accounts
WHEN TRIM(NEW.password_hash) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_password_hash_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_sessions_account_id_immutable
BEFORE UPDATE OF account_id ON auth_sessions
WHEN NEW.account_id <> OLD.account_id
BEGIN
  SELECT RAISE(ABORT, 'authentication_session_account_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_sessions_token_hash_required_insert
BEFORE INSERT ON auth_sessions
WHEN TRIM(NEW.token_hash) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_session_token_hash_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_sessions_token_hash_immutable
BEFORE UPDATE OF token_hash ON auth_sessions
WHEN NEW.token_hash <> OLD.token_hash
BEGIN
  SELECT RAISE(ABORT, 'authentication_session_token_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_password_reset_account_id_immutable
BEFORE UPDATE OF account_id ON auth_password_reset_tokens
WHEN NEW.account_id <> OLD.account_id
BEGIN
  SELECT RAISE(ABORT, 'authentication_reset_account_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_password_reset_token_hash_required_insert
BEFORE INSERT ON auth_password_reset_tokens
WHEN TRIM(NEW.token_hash) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_reset_token_hash_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_password_reset_token_hash_immutable
BEFORE UPDATE OF token_hash ON auth_password_reset_tokens
WHEN NEW.token_hash <> OLD.token_hash
BEGIN
  SELECT RAISE(ABORT, 'authentication_reset_token_immutable');
END;
