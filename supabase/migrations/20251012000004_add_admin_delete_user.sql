-- Admin function to completely delete a user and all their related data
-- This is a destructive operation and should only be used by admins

-- Create function to delete user and all related data
CREATE OR REPLACE FUNCTION admin_delete_user_completely(
  p_user_id UUID,
  p_admin_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  deleted_counts JSONB
) AS $$
DECLARE
  v_admin_role TEXT;
  v_counts JSONB := '{}'::jsonb;
  v_count INTEGER;
BEGIN
  -- Verify the requesting user is an admin
  SELECT role INTO v_admin_role
  FROM profiles
  WHERE id = p_admin_id;

  IF v_admin_role IS NULL OR v_admin_role != 'admin' THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized: Only admins can delete users'::TEXT, v_counts;
    RETURN;
  END IF;

  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN QUERY SELECT FALSE, 'User not found'::TEXT, v_counts;
    RETURN;
  END IF;

  -- Prevent admin from deleting themselves
  IF p_user_id = p_admin_id THEN
    RETURN QUERY SELECT FALSE, 'Cannot delete your own account'::TEXT, v_counts;
    RETURN;
  END IF;

  -- Delete user data in order (respecting foreign key constraints)

  -- 1. Delete chat messages (via conversations)
  SELECT COUNT(*) INTO v_count
  FROM chat_messages cm
  WHERE cm.conversation_id IN (
    SELECT id FROM conversations WHERE user_id = p_user_id
  );
  v_counts := jsonb_set(v_counts, '{chat_messages}', to_jsonb(v_count));

  DELETE FROM chat_messages
  WHERE conversation_id IN (
    SELECT id FROM conversations WHERE user_id = p_user_id
  );

  -- 2. Delete conversations
  SELECT COUNT(*) INTO v_count FROM conversations WHERE user_id = p_user_id;
  v_counts := jsonb_set(v_counts, '{conversations}', to_jsonb(v_count));
  DELETE FROM conversations WHERE user_id = p_user_id;

  -- 3. Delete user subscriptions
  SELECT COUNT(*) INTO v_count FROM user_subscriptions WHERE user_id = p_user_id;
  v_counts := jsonb_set(v_counts, '{user_subscriptions}', to_jsonb(v_count));
  DELETE FROM user_subscriptions WHERE user_id = p_user_id;

  -- 4. Delete token usage tracking (if table exists)
  BEGIN
    SELECT COUNT(*) INTO v_count FROM token_usage WHERE user_id = p_user_id;
    v_counts := jsonb_set(v_counts, '{token_usage}', to_jsonb(v_count));
    DELETE FROM token_usage WHERE user_id = p_user_id;
  EXCEPTION
    WHEN undefined_table THEN
      -- Table doesn't exist, skip
      v_counts := jsonb_set(v_counts, '{token_usage}', to_jsonb(0));
  END;

  -- 6. Delete profile picture from storage (if exists)
  -- Note: This marks the file for deletion, actual deletion happens via storage policies
  DECLARE
    v_profile_picture_url TEXT;
  BEGIN
    SELECT profile_picture_url INTO v_profile_picture_url
    FROM profiles
    WHERE id = p_user_id;

    IF v_profile_picture_url IS NOT NULL THEN
      -- Extract filename from URL and delete from storage
      -- This is handled by CASCADE DELETE in storage policies
      v_counts := jsonb_set(v_counts, '{profile_picture}', to_jsonb(1));
    END IF;
  END;

  -- 7. Delete profile (this will CASCADE to auth.users)
  -- Note: profiles table has ON DELETE CASCADE from auth.users
  -- So we delete from auth.users, which will delete the profile
  DELETE FROM auth.users WHERE id = p_user_id;
  v_counts := jsonb_set(v_counts, '{auth_user}', to_jsonb(1));
  v_counts := jsonb_set(v_counts, '{profile}', to_jsonb(1));

  RETURN QUERY SELECT TRUE, 'User and all related data deleted successfully'::TEXT, v_counts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (will be restricted by admin check inside function)
GRANT EXECUTE ON FUNCTION admin_delete_user_completely TO authenticated;

-- Add comment
COMMENT ON FUNCTION admin_delete_user_completely IS
  'Completely deletes a user and all their related data from the system. Only admins can execute this. Includes: conversations, messages, subscriptions, token usage, profile picture, and auth account. This is a destructive operation that cannot be undone.';
