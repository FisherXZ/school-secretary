-- Database Schema for school-secretary Morning Digest
-- This creates the users table for storing digest subscriptions and Google Calendar tokens

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  google_refresh_token TEXT NOT NULL,
  google_access_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  digest_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for daily cron query (only users with digest enabled)
CREATE INDEX IF NOT EXISTS idx_users_digest_enabled
ON users(digest_enabled)
WHERE digest_enabled = true;

-- Index for email lookups (used during signup)
CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments explaining each field
COMMENT ON TABLE users IS 'Stores digest subscriptions and Google Calendar authentication tokens';
COMMENT ON COLUMN users.id IS 'Unique identifier, used in unsubscribe links';
COMMENT ON COLUMN users.email IS 'Email address where digest is sent';
COMMENT ON COLUMN users.google_refresh_token IS 'Long-lived token to obtain new access tokens';
COMMENT ON COLUMN users.google_access_token IS 'Short-lived token for Google Calendar API calls (cached)';
COMMENT ON COLUMN users.token_expires_at IS 'When the access token expires';
COMMENT ON COLUMN users.timezone IS 'User timezone from Google Calendar (for 8am calculation)';
COMMENT ON COLUMN users.digest_enabled IS 'Whether user wants to receive digest emails';
COMMENT ON COLUMN users.created_at IS 'When user first signed up';
COMMENT ON COLUMN users.updated_at IS 'Last modification timestamp';
