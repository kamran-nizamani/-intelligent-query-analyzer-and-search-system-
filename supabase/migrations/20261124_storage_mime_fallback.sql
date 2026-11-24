-- Some browsers and Supabase SDK upload paths send application/octet-stream
-- even when the selected filename has a supported document/code extension.
-- The frontend still validates extensions and extracts content by file type;
-- this only prevents Storage from rejecting otherwise supported uploads.
UPDATE storage.buckets
SET allowed_mime_types = CASE
    WHEN allowed_mime_types IS NULL THEN ARRAY['application/octet-stream']::text[]
    WHEN 'application/octet-stream' = ANY(allowed_mime_types) THEN allowed_mime_types
    ELSE array_append(allowed_mime_types, 'application/octet-stream')
END
WHERE name = 'documents';
