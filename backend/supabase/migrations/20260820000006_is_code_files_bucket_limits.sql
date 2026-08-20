-- Align is-code-files bucket limits with storage-api FILE_SIZE_LIMIT (50MB)
-- and allow common Office/image MIME types used by browsers.

UPDATE storage.buckets
SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]::text[]
WHERE id = 'is-code-files';
