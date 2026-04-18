-- AlterTable
ALTER TABLE `company` ADD COLUMN `account_no` VARCHAR(64) NULL,
    ADD COLUMN `bank_branch` VARCHAR(255) NULL,
    ADD COLUMN `bank_name` VARCHAR(128) NULL,
    ADD COLUMN `gstin` VARCHAR(15) NULL,
    ADD COLUMN `ifsc` VARCHAR(11) NULL,
    ADD COLUMN `pan` VARCHAR(10) NULL;
