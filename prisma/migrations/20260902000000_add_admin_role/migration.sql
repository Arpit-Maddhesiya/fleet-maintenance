-- Add the ADMIN role to the Role enum. Adding a value to a Postgres enum
-- cannot run inside a transaction, and Prisma applies each migration.sql
-- atomically by default, so the outer transaction is disabled for this file.
-- (See https://www.postgresql.org/docs/current/sql-altertype.html and the
-- Prisma docs on enum migrations.)
ALTER TYPE "Role" ADD VALUE 'ADMIN';
