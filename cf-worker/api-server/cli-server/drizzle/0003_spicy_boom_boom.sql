-- SQLite allows dynamic typing, so we don't need to rebuild the tables just to store text instead of integer.
-- This empty migration satisfies Drizzle-kit's state tracking.
SELECT 1;