-- Function to get marking scheme cleanup statistics
CREATE OR REPLACE FUNCTION get_marking_scheme_cleanup_stats()
RETURNS JSON AS $$
DECLARE
  total_pdfs INTEGER;
  pdfs_with_text INTEGER;
  avg_pdf_size BIGINT;
  potential_savings BIGINT;
BEGIN
  -- Count total marking scheme PDFs
  SELECT COUNT(*) INTO total_pdfs
  FROM marking_schemes
  WHERE pdf_path IS NOT NULL;

  -- Count papers with extracted text
  SELECT COUNT(DISTINCT exam_paper_id) INTO pdfs_with_text
  FROM exam_questions
  WHERE marking_scheme_text IS NOT NULL;

  -- Estimate average PDF size from storage.objects
  SELECT COALESCE(AVG((metadata->>'size')::BIGINT), 15000000) INTO avg_pdf_size
  FROM storage.objects
  WHERE bucket_id = 'marking-schemes'
  AND (metadata->>'size')::BIGINT > 0
  LIMIT 1000;

  -- Calculate potential savings (PDFs with text that can be deleted)
  potential_savings := pdfs_with_text * avg_pdf_size;

  RETURN json_build_object(
    'totalPdfs', total_pdfs,
    'pdfsWithText', pdfs_with_text,
    'pdfsWithoutText', total_pdfs - pdfs_with_text,
    'potentialSavingsBytes', potential_savings,
    'potentialSavingsMB', ROUND(potential_savings / 1024.0 / 1024.0, 2),
    'potentialSavingsGB', ROUND(potential_savings / 1024.0 / 1024.0 / 1024.0, 3),
    'averagePdfSizeBytes', avg_pdf_size,
    'averagePdfSizeMB', ROUND(avg_pdf_size / 1024.0 / 1024.0, 2)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get insert cleanup statistics
CREATE OR REPLACE FUNCTION get_insert_cleanup_stats()
RETURNS JSON AS $$
DECLARE
  total_pdfs INTEGER;
  pdfs_with_images INTEGER;
  avg_pdf_size BIGINT;
  potential_savings BIGINT;
BEGIN
  -- Count total insert PDFs
  SELECT COUNT(*) INTO total_pdfs
  FROM exam_papers
  WHERE insert_pdf_path IS NOT NULL;

  -- Count inserts with converted images
  -- (This is approximate - checks if insert images exist in storage)
  SELECT COUNT(DISTINCT ep.id) INTO pdfs_with_images
  FROM exam_papers ep
  WHERE ep.insert_pdf_path IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM storage.objects so
    WHERE so.bucket_id = 'inserts'
    AND so.name LIKE 'inserts/' || ep.id || '/%'
    AND so.name ~ '\.(jpg|jpeg|png)$'
  );

  -- Estimate average insert PDF size
  SELECT COALESCE(AVG((metadata->>'size')::BIGINT), 10000000) INTO avg_pdf_size
  FROM storage.objects
  WHERE bucket_id = 'inserts'
  AND name ~ '\.pdf$'
  AND (metadata->>'size')::BIGINT > 0
  LIMIT 1000;

  -- Calculate potential savings
  potential_savings := pdfs_with_images * avg_pdf_size;

  RETURN json_build_object(
    'totalPdfs', total_pdfs,
    'pdfsWithImages', pdfs_with_images,
    'pdfsWithoutImages', total_pdfs - pdfs_with_images,
    'potentialSavingsBytes', potential_savings,
    'potentialSavingsMB', ROUND(potential_savings / 1024.0 / 1024.0, 2),
    'potentialSavingsGB', ROUND(potential_savings / 1024.0 / 1024.0 / 1024.0, 3),
    'averagePdfSizeBytes', avg_pdf_size,
    'averagePdfSizeMB', ROUND(avg_pdf_size / 1024.0 / 1024.0, 2)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_marking_scheme_cleanup_stats() IS 'Returns statistics about marking scheme PDFs and potential storage savings from cleanup';
COMMENT ON FUNCTION get_insert_cleanup_stats() IS 'Returns statistics about insert PDFs and potential storage savings from cleanup';
