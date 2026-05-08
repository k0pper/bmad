-- Add Stripe customer + subscription tracking columns to users.
-- New columns are nullable so existing rows stay valid; the unique
-- indexes are partial-friendly (Postgres treats each NULL as distinct).

ALTER TABLE "users" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "users" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "users" ADD COLUMN "subscriptionEndsAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");
CREATE UNIQUE INDEX "users_stripeSubscriptionId_key" ON "users"("stripeSubscriptionId");
