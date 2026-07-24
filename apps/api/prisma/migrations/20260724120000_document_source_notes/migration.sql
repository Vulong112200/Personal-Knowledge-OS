-- Support in-app note authoring: documents can now originate as an uploaded file OR a note.
-- Notes have no stored file, so the file-specific columns become nullable and a `source`
-- discriminator is added (existing rows backfill to 'upload' via the default).
CREATE TYPE "DocumentSource" AS ENUM ('upload', 'note');

ALTER TABLE "documents" ADD COLUMN "source" "DocumentSource" NOT NULL DEFAULT 'upload';

ALTER TABLE "documents" ALTER COLUMN "original_filename" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "mime_type" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "size_bytes" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "checksum" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "storage_driver" DROP NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "storage_key" DROP NOT NULL;
