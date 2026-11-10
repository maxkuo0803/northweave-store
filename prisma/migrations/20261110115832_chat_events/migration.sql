-- CreateTable
CREATE TABLE `ChatEvent` (
    `id` VARCHAR(191) NOT NULL,
    `visitorId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NULL,
    `path` VARCHAR(191) NULL,
    `value` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatEvent_type_createdAt_idx`(`type`, `createdAt`),
    INDEX `ChatEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
