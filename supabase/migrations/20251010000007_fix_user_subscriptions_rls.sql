-- Fix RLS policies for user_subscriptions to allow users to update their own subscription

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Only admins can manage subscriptions" ON user_subscriptions;

-- Allow users to view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to UPDATE their own subscription (for token/paper tracking)
CREATE POLICY "Users can update their own subscription tracking"
  ON user_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all subscriptions
CREATE POLICY "Admins can view all subscriptions"
  ON user_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can manage all subscriptions (INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can manage all subscriptions"
  ON user_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Allow system (service role) to insert subscriptions for new users
CREATE POLICY "System can create subscriptions"
  ON user_subscriptions FOR INSERT
  WITH CHECK (true);
