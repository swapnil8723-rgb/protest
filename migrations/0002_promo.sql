-- Clicks and closes on the KryVault ad (worker/promo.ts): totals only, never a person.
CREATE TABLE promo_counts (
  day     TEXT NOT NULL,      -- YYYY-MM-DD (UTC)
  event   TEXT NOT NULL,      -- 'click' or 'close'
  country TEXT NOT NULL,      -- Cloudflare's two-letter country, 'XX' if unknown
  n       INTEGER NOT NULL,
  PRIMARY KEY (day, event, country)
);
