-- Refresh tokens are now stored as SHA-256 hashes only.
-- Existing rows contained plaintext tokens, so we invalidate them and force a fresh secure login.
DELETE FROM "refresh_tokens";
