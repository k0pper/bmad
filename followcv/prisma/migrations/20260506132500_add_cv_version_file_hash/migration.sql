-- AddColumn
ALTER TABLE "cv_versions" ADD COLUMN "fileHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cv_versions_userId_fileHash_key" ON "cv_versions"("userId", "fileHash");
