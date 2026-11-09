-- CreateTable
CREATE TABLE `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `channel` ENUM('WEB', 'LINE', 'EMAIL') NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `displayName` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NULL,
    `emailThreadId` VARCHAR(191) NULL,
    `status` ENUM('AI', 'WAITING_HUMAN', 'HUMAN', 'CLOSED') NOT NULL DEFAULT 'AI',
    `handoffReason` TEXT NULL,
    `pendingAction` JSON NULL,
    `staffUnread` BOOLEAN NOT NULL DEFAULT false,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Conversation_status_lastMessageAt_idx`(`status`, `lastMessageAt`),
    INDEX `Conversation_userId_idx`(`userId`),
    UNIQUE INDEX `Conversation_channel_externalId_key`(`channel`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `role` ENUM('CUSTOMER', 'AI', 'STAFF', 'SYSTEM') NOT NULL,
    `content` TEXT NOT NULL,
    `staffId` VARCHAR(191) NULL,
    `channelMessageId` VARCHAR(191) NULL,
    `delivery` VARCHAR(191) NULL,
    `deliveryError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Message_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentStep` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `input` JSON NULL,
    `output` JSON NULL,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `latencyMs` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentStep_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `AgentStep_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChannelLink` (
    `id` VARCHAR(191) NOT NULL,
    `channel` ENUM('WEB', 'LINE', 'EMAIL') NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChannelLink_userId_idx`(`userId`),
    UNIQUE INDEX `ChannelLink_channel_externalId_key`(`channel`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BrowseEvent` (
    `id` VARCHAR(191) NOT NULL,
    `visitorId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BrowseEvent_visitorId_createdAt_idx`(`visitorId`, `createdAt`),
    INDEX `BrowseEvent_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `BrowseEvent_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentStep` ADD CONSTRAINT `AgentStep_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChannelLink` ADD CONSTRAINT `ChannelLink_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
