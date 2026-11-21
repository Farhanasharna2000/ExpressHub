-- CreateEnum
CREATE TYPE "ShipmentImportStatus" AS ENUM ('PREVIEW', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ShipmentImportRowStatus" AS ENUM ('PENDING', 'CREATED', 'FAILED', 'INVALID');

-- CreateTable
CREATE TABLE "shipment_imports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "status" "ShipmentImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_import_rows" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "ShipmentImportRowStatus" NOT NULL,
    "data" JSONB NOT NULL,
    "errors" JSONB,
    "estimatedPrice" DECIMAL(12,2),
    "currency" VARCHAR(3),
    "shipmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipment_imports_userId_createdAt_idx" ON "shipment_imports"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "shipment_imports_status_updatedAt_idx" ON "shipment_imports"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "shipment_import_rows_importId_status_idx" ON "shipment_import_rows"("importId", "status");

-- CreateIndex
CREATE INDEX "shipment_import_rows_shipmentId_idx" ON "shipment_import_rows"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_import_rows_importId_rowNumber_key" ON "shipment_import_rows"("importId", "rowNumber");

-- AddForeignKey
ALTER TABLE "shipment_imports" ADD CONSTRAINT "shipment_imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_import_rows" ADD CONSTRAINT "shipment_import_rows_importId_fkey" FOREIGN KEY ("importId") REFERENCES "shipment_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_import_rows" ADD CONSTRAINT "shipment_import_rows_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

