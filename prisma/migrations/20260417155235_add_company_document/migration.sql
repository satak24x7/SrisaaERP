-- CreateTable
CREATE TABLE `company_document` (
    `id` VARCHAR(26) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(128) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `storage_path` VARCHAR(512) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
