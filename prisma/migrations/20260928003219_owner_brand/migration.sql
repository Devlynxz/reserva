-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "icon_url" TEXT,
ADD COLUMN     "show_powered_by" BOOLEAN NOT NULL DEFAULT true;
