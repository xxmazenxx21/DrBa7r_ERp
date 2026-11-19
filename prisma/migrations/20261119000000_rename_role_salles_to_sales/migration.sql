-- Fix enum spelling: SALLES -> SALES (existing users keep their role)
ALTER TYPE "Role" RENAME VALUE 'SALLES' TO 'SALES';
