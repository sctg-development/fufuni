-- Migration to add tax_inclusive to regions table
ALTER TABLE regions ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 0;
