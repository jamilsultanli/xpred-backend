-- Create Supabase Storage Buckets for file uploads
-- Run this in Supabase SQL Editor

-- Create predictions bucket for videos and images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'predictions',
  'predictions',
  true,
  104857600, -- 100MB limit
  ARRAY['video/mp4', 'video/webm', 'video/mov', 'video/avi', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create avatars bucket for user avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create documents bucket for KYC documents (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false, -- Private bucket
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for predictions bucket
CREATE POLICY "Public Access for predictions bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'predictions');

CREATE POLICY "Authenticated users can upload to predictions"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'predictions' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their own uploads in predictions"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'predictions' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own uploads in predictions"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'predictions' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create RLS policies for avatars bucket
CREATE POLICY "Public Access for avatars bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create RLS policies for documents bucket (private)
CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' 
  AND auth.role() = 'authenticated'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admin can view all documents
CREATE POLICY "Admins can view all documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.admin_role_id IS NOT NULL
  )
);

DO $$ 
BEGIN
  RAISE NOTICE '✅ Storage buckets created successfully!';
  RAISE NOTICE '   - predictions (public, 100MB)';
  RAISE NOTICE '   - avatars (public, 5MB)';
  RAISE NOTICE '   - documents (private, 10MB)';
  RAISE NOTICE '✅ RLS policies created for all buckets';
END $$;


