-- Load weekly meal count data into fit4sure database
-- Using correct column names: entry_date (DATE not TIMESTAMP)

INSERT INTO financial_entries (entry_type, description, amount_cents, entry_date)
VALUES
  ('purchase', 'Week 1.18: 45 meals sold', 0, '2026-01-18'::date),
  ('purchase', 'Week 1.25: 43 meals sold', 0, '2026-01-25'::date),
  ('purchase', 'Week 2.1: 46 meals sold', 0, '2026-02-01'::date),
  ('purchase', 'Week 2.8: 44 meals sold', 0, '2026-02-08'::date),
  ('purchase', 'Week 2.15: 52 meals sold', 0, '2026-02-15'::date),
  ('purchase', 'Week 2.22: 52 meals sold', 0, '2026-02-22'::date),
  ('purchase', 'Week 03.01: 63 meals sold', 0, '2026-03-01'::date),
  ('purchase', 'Week 03.08: 58 meals sold', 0, '2026-03-08'::date),
  ('purchase', 'Week 3.22: 53 meals sold', 0, '2026-03-22'::date),
  ('purchase', 'Week 3.29: 56 meals sold', 0, '2026-03-29'::date),
  ('purchase', 'Week 4.5: 55 meals sold', 0, '2026-04-05'::date),
  ('purchase', 'Week 4.12: 51 meals sold', 0, '2026-04-12'::date),
  ('purchase', 'Week 4.19: 43 meals sold (Thursday off)', 0, '2026-04-19'::date),
  ('purchase', 'Week 4.26: 53 meals sold', 0, '2026-04-26'::date),
  ('purchase', 'Week 5.03: 57 meals sold', 0, '2026-05-03'::date),
  ('purchase', 'Week 5.10: 47 meals sold', 0, '2026-05-10'::date),
  ('purchase', 'Week 5.17: 50 meals sold', 0, '2026-05-17'::date),
  ('purchase', 'Week 5.24: 36 meals sold (Thursday off)', 0, '2026-05-24'::date),
  ('purchase', 'Week 5.31: 58 meals sold', 0, '2026-05-31'::date),
  ('purchase', 'Week 6.7: 55 meals sold', 0, '2026-06-07'::date),
  ('purchase', 'Week 6.14: 48 meals sold', 0, '2026-06-14'::date),
  ('purchase', 'Week 6.21: 41 meals sold (Thursday off)', 0, '2026-06-21'::date),
  ('purchase', 'Week 7.5: 50 meals sold', 0, '2026-07-05'::date),
  ('purchase', 'Week 7.12: 49 meals sold (CURRENT)', 0, '2026-07-12'::date);
