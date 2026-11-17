-- CreateTable
CREATE TABLE "delivery_proofs" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "recipientName" VARCHAR(100) NOT NULL,
    "photoKey" VARCHAR(64),
    "signatureKey" VARCHAR(64),
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "key" VARCHAR(64) NOT NULL,
    "contentType" VARCHAR(40) NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_proofs_shipmentId_key" ON "delivery_proofs"("shipmentId");

-- CreateIndex
CREATE INDEX "delivery_proofs_courierId_capturedAt_idx" ON "delivery_proofs"("courierId", "capturedAt");

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

