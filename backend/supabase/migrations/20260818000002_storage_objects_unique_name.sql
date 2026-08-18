-- Storage API upserts with ON CONFLICT (name, bucket_id).
CREATE UNIQUE INDEX IF NOT EXISTS objects_name_bucket_id_unique
  ON storage.objects (name, bucket_id);
