-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('Playing', 'Backlog', 'Completed', 'OnHold', 'Dropped', 'Wishlist');

-- CreateEnum
CREATE TYPE "PlatformCode" AS ENUM ('ST', 'PS', 'XB', 'GG', 'NT', 'EP');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('ok', 'syncing', 'error', 'stale', 'manual');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "googleId" TEXT,
    "steamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" "PlatformCode" NOT NULL,
    "credentials" JSONB,
    "syncable" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "developer" TEXT,
    "releaseYear" INTEGER,
    "genres" TEXT[],
    "coverUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'Backlog',
    "playtimeByPlatform" JSONB NOT NULL DEFAULT '{}',
    "lastPlayedAt" TIMESTAMP(3),
    "notes" TEXT,
    "rating" INTEGER,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HltbData" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "mainStory" INTEGER,
    "mainExtras" INTEGER,
    "completionist" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HltbData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistRelease" (
    "id" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "developer" TEXT,
    "releaseDate" TIMESTAMP(3),
    "releaseDateCategory" TEXT NOT NULL DEFAULT 'TBA',
    "platforms" TEXT[],
    "genres" TEXT[],
    "userId" TEXT NOT NULL,
    "hype" INTEGER,
    "synopsis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_steamId_key" ON "User"("steamId");

-- CreateIndex
CREATE UNIQUE INDEX "Platform_userId_code_key" ON "Platform"("userId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Game_igdbId_key" ON "Game"("igdbId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGame_userId_gameId_key" ON "UserGame"("userId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "HltbData_gameId_key" ON "HltbData"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistRelease_userId_igdbId_key" ON "WishlistRelease"("userId", "igdbId");

-- AddForeignKey
ALTER TABLE "Platform" ADD CONSTRAINT "Platform_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGame" ADD CONSTRAINT "UserGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGame" ADD CONSTRAINT "UserGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HltbData" ADD CONSTRAINT "HltbData_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistRelease" ADD CONSTRAINT "WishlistRelease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
