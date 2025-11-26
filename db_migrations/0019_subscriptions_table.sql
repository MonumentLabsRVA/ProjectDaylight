-- Migration: Create subscriptions table for billing management
-- This table is designed to integrate with Stripe when the time comes

-- Enum for subscription status (mirrors Stripe statuses)
CREATE TYPE subscription_status AS ENUM (
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused'
);

-- Enum for plan tiers
CREATE TYPE plan_tier AS ENUM (
  'free',
  'starter',
  'pro',
  'enterprise'
);

-- Enum for billing interval
CREATE TYPE billing_interval AS ENUM (
  'month',
  'year'
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Subscription details
  status subscription_status NOT NULL DEFAULT 'active',
  plan_tier plan_tier NOT NULL DEFAULT 'free',
  billing_interval billing_interval NOT NULL DEFAULT 'month',
  
  -- Billing period tracking
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  
  -- Stripe integration fields (nullable until Stripe is connected)
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure one subscription per user
  CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id)
);

-- Index for Stripe lookups (will be useful when Stripe webhooks are integrated)
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Index for status queries
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies: Users can only see/manage their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Note: DELETE is intentionally not allowed - subscriptions should be canceled, not deleted

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- Add to audit logging (if audit triggers exist)
-- This follows the pattern from other tables in the schema

