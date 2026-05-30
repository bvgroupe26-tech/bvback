-- Notifications centralisées : employés (PWA) + comptes RH/admin
ALTER TABLE "notifications" ALTER COLUMN "employeId" DROP NOT NULL;

ALTER TABLE "notifications" ADD COLUMN "userId" INTEGER;
ALTER TABLE "notifications" ADD COLUMN "meta" JSONB;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");
