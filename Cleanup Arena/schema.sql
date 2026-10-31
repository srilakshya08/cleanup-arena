-- =============================================================================
-- Cleanup Arena — Database Schema (PostgreSQL / Supabase)
-- Major Task 4: Supabase Database Integration
-- =============================================================================

-- Enable pgcrypto / uuid generation extension if not already active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Table A: emails
-- Stores all email records across categories and their current lifecycle statuses.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender TEXT NOT NULL,
    sender_email TEXT,
    subject TEXT NOT NULL,
    preview TEXT,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Category check constraint: exactly matches the 4 game categories
    CONSTRAINT chk_email_category CHECK (
        category IN ('spam', 'newsletter', 'notification', 'important')
    ),

    -- Status check constraint: matches application workflow
    CONSTRAINT chk_email_status CHECK (
        status IN ('pending', 'archived', 'starred', 'follow_up', 'spam')
    ),

    -- Natural composite unique key to prevent duplicate email insertions when re-running seed
    CONSTRAINT uq_email_natural_key UNIQUE (sender_email, subject, received_at)
);

-- Targeted indexes for high-frequency queries and filtering:
-- 1. Category filtering (e.g. SELECT * FROM emails WHERE category = 'spam')
CREATE INDEX IF NOT EXISTS idx_emails_category ON public.emails (category);

-- 2. Status filtering (e.g. SELECT * FROM emails WHERE status = 'pending')
CREATE INDEX IF NOT EXISTS idx_emails_status ON public.emails (status);

-- 3. Date sorting (e.g. ORDER BY received_at DESC)
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON public.emails (received_at DESC);


-- -----------------------------------------------------------------------------
-- Table B: cleanup_events
-- Records every executed cleanup or triage operation for analytics and game scoring.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cleanup_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    category TEXT NOT NULL,
    processed_count INTEGER NOT NULL CHECK (processed_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cleanup_events_created_at ON public.cleanup_events (created_at DESC);


-- -----------------------------------------------------------------------------
-- Table C: player_progress
-- Tracks player XP, Level, and Total Cleaned stats for the initial single-player MVP.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    total_emails_cleaned INTEGER NOT NULL DEFAULT 0 CHECK (total_emails_cleaned >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial single player record if not already present
INSERT INTO public.player_progress (id, xp, level, total_emails_cleaned)
VALUES ('00000000-0000-0000-0000-000000000001', 1300, 5, 142)
ON CONFLICT (id) DO NOTHING;
