-- AlterTable
ALTER TABLE "employes" ADD COLUMN "dateFinContrat" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "paie" ADD COLUMN "joursTravailles" INTEGER;
ALTER TABLE "paie" ADD COLUMN "joursPeriode" INTEGER;
