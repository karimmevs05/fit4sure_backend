-- Insert receipt records for Jul 17, 2026

-- Sam's Club receipt
INSERT INTO receipts (date, store, total_amount_cents)
VALUES ('2026-07-17', 'Sam''s Club', 6433);

-- Costco receipt
INSERT INTO receipts (date, store, total_amount_cents)
VALUES ('2026-07-17', 'Costco', 9910);

-- Sam's Club items
INSERT INTO receipt_items (receipt_id, inventory_name, quantity_grams, quantity, unit, unit_price_cents)
VALUES
  (1, 'Bare Bones Instant Beef Bouillon Bone Broth Sticks', 0, 8, 'count', 798),
  (1, 'Multi Bell Sweet Peppers', 0, 6, 'count', 677),
  (1, 'Organic Green Beans', 0, 2, 'count', 574),
  (1, 'Member''s Mark Grass Fed Beef Top Sirloin Steak', 737, 1.63, 'lb', 1757),
  (1, 'Member''s Mark Grass Fed Beef Top Sirloin Steak', 693, 1.53, 'lb', 1649);

-- Costco items
INSERT INTO receipt_items (receipt_id, inventory_name, quantity_grams, quantity, unit, unit_price_cents)
VALUES
  (2, 'Organic GT Kombucha', 0, 1, 'count', 1999),
  (2, 'Organic GT Kombucha', 0, 1, 'count', 1999),
  (2, 'Organic GT Kombucha', 0, 1, 'count', 1999),
  (2, 'Organic Squash', 0, 1, 'count', 799),
  (2, 'Organic Blueberries', 0, 2, 'count', 799),
  (2, 'Asparagus', 0, 1, 'count', 969),
  (2, 'Asparagus', 0, 1, 'count', 969),
  (2, 'Rainbow Carrot', 0, 2, 'count', 749);
