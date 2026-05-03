-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coverDensity" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "hypeThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "libraryView" TEXT NOT NULL DEFAULT 'shelves',
ADD COLUMN     "showHltb" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "terminalCursor" BOOLEAN NOT NULL DEFAULT true;
