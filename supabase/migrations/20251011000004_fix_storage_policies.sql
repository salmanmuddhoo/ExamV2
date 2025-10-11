-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Users can upload their own payment proof" ON storage.objects;
DROP POLICY IF EXISTS "Payment proofs are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own payment proof" ON storage.objects;
DROP POLICY IF EXISTS "Admins can access all payment proofs" ON storage.objects;

-- Recreate storage policies for payment-proofs bucket
-- Policy for users to upload their own payment proofs
CREATE POLICY "Users can upload their own payment proof"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy for public read access to payment proofs
CREATE POLICY "Payment proofs are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'payment-proofs');

-- Policy for users to update their own payment proofs
CREATE POLICY "Users can update their own payment proof"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'payment-proofs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy for users to delete their own payment proofs
CREATE POLICY "Users can delete their own payment proof"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy for admins to manage all payment proofs
CREATE POLICY "Admins can manage all payment proofs"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'payment-proofs' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
