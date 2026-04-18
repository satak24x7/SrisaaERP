-- CreateTable
CREATE TABLE `role` (
    `id` VARCHAR(26) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `display_name` VARCHAR(128) NOT NULL,
    `description` TEXT NULL,
    `permissions` JSON NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `role_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_unit_member` (
    `id` VARCHAR(26) NOT NULL,
    `business_unit_id` VARCHAR(26) NOT NULL,
    `user_id` VARCHAR(26) NOT NULL,
    `role_id` VARCHAR(26) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `business_unit_member_user_id_idx`(`user_id`),
    UNIQUE INDEX `business_unit_member_business_unit_id_user_id_key`(`business_unit_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `business_unit_member` ADD CONSTRAINT `business_unit_member_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_unit_member` ADD CONSTRAINT `business_unit_member_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_unit_member` ADD CONSTRAINT `business_unit_member_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
