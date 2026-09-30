PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS global_person_photos (
  person_id TEXT PRIMARY KEY NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),
  data BLOB NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  width INTEGER NOT NULL CHECK (width BETWEEN 64 AND 2048),
  height INTEGER NOT NULL CHECK (height BETWEEN 64 AND 2048),
  updated_by TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES global_people(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_global_person_photos_updated_at ON global_person_photos(updated_at);

PRAGMA foreign_keys = ON;
