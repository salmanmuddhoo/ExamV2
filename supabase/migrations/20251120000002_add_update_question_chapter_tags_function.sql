-- Create RPC function to update question chapter tags manually
-- Allows admins to manually edit which chapters a question is tagged to

CREATE OR REPLACE FUNCTION update_question_chapter_tags(
  p_question_id UUID,
  p_chapter_ids UUID[],
  p_primary_chapter_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_existing_tags UUID[];
  v_chapter_id UUID;
  v_is_primary BOOLEAN;
  v_result JSON;
BEGIN
  -- Validate that question exists
  IF NOT EXISTS (SELECT 1 FROM exam_questions WHERE id = p_question_id) THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Question not found'
    );
  END IF;

  -- Validate that primary chapter is in the selected chapters
  IF p_primary_chapter_id IS NOT NULL AND NOT (p_primary_chapter_id = ANY(p_chapter_ids)) THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Primary chapter must be one of the selected chapters'
    );
  END IF;

  -- Get existing tags for this question
  SELECT array_agg(chapter_id) INTO v_existing_tags
  FROM question_chapter_tags
  WHERE question_id = p_question_id;

  -- Delete tags that are no longer selected
  DELETE FROM question_chapter_tags
  WHERE question_id = p_question_id
    AND (
      p_chapter_ids IS NULL
      OR array_length(p_chapter_ids, 1) IS NULL
      OR NOT (chapter_id = ANY(p_chapter_ids))
    );

  -- Update or insert tags
  FOREACH v_chapter_id IN ARRAY p_chapter_ids
  LOOP
    v_is_primary := (v_chapter_id = p_primary_chapter_id);

    -- Insert or update the tag
    INSERT INTO question_chapter_tags (
      question_id,
      chapter_id,
      is_primary,
      confidence_score,
      is_manually_set,
      updated_at
    ) VALUES (
      p_question_id,
      v_chapter_id,
      v_is_primary,
      1.00,  -- Manual tags get 100% confidence
      true,  -- Mark as manually set
      NOW()
    )
    ON CONFLICT (question_id, chapter_id)
    DO UPDATE SET
      is_primary = v_is_primary,
      confidence_score = 1.00,
      is_manually_set = true,
      updated_at = NOW();
  END LOOP;

  -- Ensure only one primary chapter per question
  -- Clear primary flag from all others if a primary is set
  IF p_primary_chapter_id IS NOT NULL THEN
    UPDATE question_chapter_tags
    SET is_primary = false
    WHERE question_id = p_question_id
      AND chapter_id != p_primary_chapter_id
      AND is_primary = true;
  END IF;

  v_result := json_build_object(
    'success', true,
    'message', 'Question chapter tags updated successfully',
    'tags_updated', array_length(p_chapter_ids, 1)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (admins will use this)
GRANT EXECUTE ON FUNCTION update_question_chapter_tags(UUID, UUID[], UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION update_question_chapter_tags IS 'Manually update question-chapter tags. Used by admins to correct or modify AI-generated chapter assignments.';
