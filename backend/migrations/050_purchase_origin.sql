-- Label simulated proposals permanently, separately from imported transaction records.
ALTER TABLE requests ADD COLUMN origin text NOT NULL DEFAULT 'REQUEST'
  CHECK(origin IN ('REQUEST','SIMULATED_PURCHASE'));
