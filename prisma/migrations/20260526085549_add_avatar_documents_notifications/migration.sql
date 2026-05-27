-- CreateEnum
CREATE TYPE "TypeDocumentRh" AS ENUM ('contrat', 'avenant', 'attestation', 'bulletin_paie', 'certificat', 'autre');

-- CreateEnum
CREATE TYPE "TypeNotification" AS ENUM ('info', 'conge', 'paie', 'document', 'systeme');

-- AlterTable
ALTER TABLE "employes" ADD COLUMN     "avatar" TEXT;

-- CreateTable
CREATE TABLE "documents_rh" (
    "id" SERIAL NOT NULL,
    "employeId" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "type" "TypeDocumentRh" NOT NULL,
    "fichierPath" TEXT NOT NULL,
    "taille" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "documents_rh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "employeId" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "TypeNotification" NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "luAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_rh_employeId_idx" ON "documents_rh"("employeId");

-- CreateIndex
CREATE INDEX "notifications_employeId_idx" ON "notifications"("employeId");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "budget_categories_code_idx" ON "budget_categories"("code");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- AddForeignKey
ALTER TABLE "documents_rh" ADD CONSTRAINT "documents_rh_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
