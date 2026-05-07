-- DropForeignKey
ALTER TABLE "cv_snapshots" DROP CONSTRAINT "cv_snapshots_cvVersionId_fkey";

-- AddForeignKey
ALTER TABLE "cv_snapshots" ADD CONSTRAINT "cv_snapshots_cvVersionId_fkey" FOREIGN KEY ("cvVersionId") REFERENCES "cv_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
