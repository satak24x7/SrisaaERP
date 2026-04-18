-- DropIndex
DROP INDEX `statutory_registration_type_number_key` ON `statutory_registration`;

-- AlterTable
ALTER TABLE `company` DROP COLUMN `account_no`,
    DROP COLUMN `bank_branch`,
    DROP COLUMN `bank_name`,
    DROP COLUMN `ifsc`,
    ADD COLUMN `tan` VARCHAR(10) NULL;

-- AlterTable
ALTER TABLE `opportunity` ADD COLUMN `account_id` VARCHAR(26) NULL,
    ADD COLUMN `end_client_account_id` VARCHAR(26) NULL,
    ADD COLUMN `owner_user_id` VARCHAR(26) NULL,
    MODIFY `client_name` VARCHAR(255) NULL,
    MODIFY `stage` VARCHAR(64) NOT NULL,
    MODIFY `entry_path` VARCHAR(64) NOT NULL;

-- AlterTable
ALTER TABLE `project` ADD COLUMN `category` VARCHAR(64) NULL,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `location` VARCHAR(255) NULL,
    ADD COLUMN `project_code` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `statutory_registration` DROP COLUMN `certificate_uri`,
    DROP COLUMN `number`,
    DROP COLUMN `state`,
    DROP COLUMN `type`,
    DROP COLUMN `validity_end`,
    DROP COLUMN `validity_start`,
    ADD COLUMN `email` VARCHAR(255) NULL,
    ADD COLUMN `login` VARCHAR(255) NULL,
    ADD COLUMN `mobile` VARCHAR(32) NULL,
    ADD COLUMN `name` VARCHAR(128) NOT NULL,
    ADD COLUMN `password` VARCHAR(255) NULL,
    ADD COLUMN `portal_url` VARCHAR(512) NULL,
    ADD COLUMN `registration_id` VARCHAR(128) NOT NULL;

-- AlterTable
ALTER TABLE `task` ADD COLUMN `kanban_column` VARCHAR(32) NOT NULL DEFAULT 'BACKLOG',
    ADD COLUMN `labels` VARCHAR(500) NULL,
    ADD COLUMN `priority` VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
    ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `app_config` (
    `id` VARCHAR(26) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `value` TEXT NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_config_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lookup_list` (
    `id` VARCHAR(26) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lookup_list_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lookup_item` (
    `id` VARCHAR(26) NOT NULL,
    `list_id` VARCHAR(26) NOT NULL,
    `label` VARCHAR(128) NOT NULL,
    `value` VARCHAR(64) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lookup_item_list_id_sort_order_idx`(`list_id`, `sort_order`),
    UNIQUE INDEX `lookup_item_list_id_value_key`(`list_id`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `government` (
    `id` VARCHAR(26) NOT NULL,
    `code` VARCHAR(5) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `government_type` ENUM('NATIONAL', 'STATE') NOT NULL,
    `country` VARCHAR(128) NOT NULL,
    `capital` VARCHAR(128) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    UNIQUE INDEX `government_code_key`(`code`),
    INDEX `government_government_type_idx`(`government_type`),
    INDEX `government_country_idx`(`country`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account` (
    `id` VARCHAR(26) NOT NULL,
    `code` VARCHAR(5) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `short_name` VARCHAR(64) NULL,
    `account_type` VARCHAR(64) NOT NULL,
    `parent_account_id` VARCHAR(26) NULL,
    `website` VARCHAR(512) NULL,
    `phone` VARCHAR(32) NULL,
    `email` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(128) NULL,
    `state` VARCHAR(64) NULL,
    `pincode` VARCHAR(10) NULL,
    `gstin` VARCHAR(15) NULL,
    `notes` TEXT NULL,
    `owner_user_id` VARCHAR(26) NULL,
    `government_id` VARCHAR(26) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    UNIQUE INDEX `account_code_key`(`code`),
    INDEX `account_name_idx`(`name`),
    INDEX `account_account_type_idx`(`account_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact` (
    `id` VARCHAR(26) NOT NULL,
    `first_name` VARCHAR(128) NOT NULL,
    `last_name` VARCHAR(128) NULL,
    `designation` VARCHAR(128) NULL,
    `department` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(32) NULL,
    `mobile` VARCHAR(32) NULL,
    `influence_level` ENUM('LOW', 'MEDIUM', 'HIGH', 'CHAMPION') NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `contact_last_name_first_name_idx`(`last_name`, `first_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_contact` (
    `id` VARCHAR(26) NOT NULL,
    `account_id` VARCHAR(26) NOT NULL,
    `contact_id` VARCHAR(26) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `account_contact_contact_id_idx`(`contact_id`),
    UNIQUE INDEX `account_contact_account_id_contact_id_key`(`account_id`, `contact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `influencer` (
    `id` VARCHAR(26) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `influencer_type` ENUM('POLITICAL', 'BUREAUCRAT', 'OTHER') NOT NULL,
    `government_id` VARCHAR(26) NOT NULL,
    `party_name` VARCHAR(128) NULL,
    `qualifier` VARCHAR(255) NULL,
    `phone` VARCHAR(32) NULL,
    `email` VARCHAR(255) NULL,
    `influence_level` ENUM('LOW', 'MEDIUM', 'HIGH', 'CHAMPION') NULL,
    `rating` TINYINT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `influencer_government_id_idx`(`government_id`),
    INDEX `influencer_influencer_type_idx`(`influencer_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opportunity_influencer` (
    `id` VARCHAR(26) NOT NULL,
    `opportunity_id` VARCHAR(26) NOT NULL,
    `influencer_id` VARCHAR(26) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `opportunity_influencer_influencer_id_idx`(`influencer_id`),
    UNIQUE INDEX `opportunity_influencer_opportunity_id_influencer_id_key`(`opportunity_id`, `influencer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opportunity_contact` (
    `id` VARCHAR(26) NOT NULL,
    `opportunity_id` VARCHAR(26) NOT NULL,
    `contact_id` VARCHAR(26) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `opportunity_contact_contact_id_idx`(`contact_id`),
    UNIQUE INDEX `opportunity_contact_opportunity_id_contact_id_key`(`opportunity_id`, `contact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead` (
    `id` VARCHAR(26) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `account_id` VARCHAR(26) NULL,
    `contact_id` VARCHAR(26) NULL,
    `business_unit_id` VARCHAR(26) NULL,
    `source` ENUM('WEBSITE', 'REFERRAL', 'CONFERENCE', 'GEM_PORTAL', 'CPPP', 'COLD_OUTREACH', 'EXISTING_ACCOUNT', 'OTHER') NOT NULL,
    `status` ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST') NOT NULL DEFAULT 'NEW',
    `description` TEXT NULL,
    `estimated_value_paise` BIGINT NULL,
    `expected_closure_date` DATE NULL,
    `owner_user_id` VARCHAR(26) NULL,
    `converted_opportunity_id` VARCHAR(26) NULL,
    `lost_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `lead_status_idx`(`status`),
    INDEX `lead_account_id_idx`(`account_id`),
    INDEX `lead_business_unit_id_status_idx`(`business_unit_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cost_of_sale_entry` (
    `id` VARCHAR(26) NOT NULL,
    `opportunity_id` VARCHAR(26) NOT NULL,
    `category` VARCHAR(64) NOT NULL,
    `entry_date` DATE NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `amount_paise` BIGINT NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'SPENT',
    `receipt_ref` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `cost_of_sale_entry_opportunity_id_category_idx`(`opportunity_id`, `category`),
    INDEX `cost_of_sale_entry_opportunity_id_status_idx`(`opportunity_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `milestone` (
    `id` VARCHAR(26) NOT NULL,
    `project_id` VARCHAR(26) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `deliverable` VARCHAR(500) NULL,
    `planned_date` DATE NOT NULL,
    `actual_date` DATE NULL,
    `percent_of_contract` DECIMAL(5, 2) NULL,
    `invoice_amount_paise` BIGINT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `milestone_project_id_sort_order_idx`(`project_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_effort_log` (
    `id` VARCHAR(26) NOT NULL,
    `task_id` VARCHAR(26) NOT NULL,
    `user_id` VARCHAR(26) NOT NULL,
    `log_date` DATE NOT NULL,
    `hours` DECIMAL(8, 2) NOT NULL,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `task_effort_log_task_id_idx`(`task_id`),
    INDEX `task_effort_log_user_id_log_date_idx`(`user_id`, `log_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget` (
    `id` VARCHAR(26) NOT NULL,
    `project_id` VARCHAR(26) NOT NULL,
    `total_estimated_paise` BIGINT NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    UNIQUE INDEX `budget_project_id_key`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_line` (
    `id` VARCHAR(26) NOT NULL,
    `budget_id` VARCHAR(26) NOT NULL,
    `category` VARCHAR(64) NOT NULL,
    `description` VARCHAR(500) NULL,
    `estimated_paise` BIGINT NOT NULL DEFAULT 0,
    `committed_paise` BIGINT NOT NULL DEFAULT 0,
    `actual_paise` BIGINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `budget_line_budget_id_idx`(`budget_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inflow_plan_item` (
    `id` VARCHAR(26) NOT NULL,
    `project_id` VARCHAR(26) NOT NULL,
    `milestone_id` VARCHAR(26) NULL,
    `description` VARCHAR(500) NOT NULL,
    `invoice_date` DATE NOT NULL,
    `amount_paise` BIGINT NOT NULL,
    `gst_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `retention_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `inflow_plan_item_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cash_flow_period` (
    `id` VARCHAR(26) NOT NULL,
    `project_id` VARCHAR(26) NOT NULL,
    `period_label` VARCHAR(16) NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `opening_balance_paise` BIGINT NOT NULL DEFAULT 0,
    `billed_paise` BIGINT NOT NULL DEFAULT 0,
    `received_paise` BIGINT NOT NULL DEFAULT 0,
    `outflow_paise` BIGINT NOT NULL DEFAULT 0,
    `closing_balance_paise` BIGINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `cash_flow_period_project_id_idx`(`project_id`),
    UNIQUE INDEX `cash_flow_period_project_id_period_label_key`(`project_id`, `period_label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pbg_record` (
    `id` VARCHAR(26) NOT NULL,
    `project_id` VARCHAR(26) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `amount_paise` BIGINT NOT NULL,
    `bank_name` VARCHAR(255) NULL,
    `bg_number` VARCHAR(128) NULL,
    `issued_date` DATE NULL,
    `expiry_date` DATE NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    `release_date` DATE NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `pbg_record_project_id_idx`(`project_id`),
    INDEX `pbg_record_expiry_date_status_idx`(`expiry_date`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `risk` (
    `id` VARCHAR(26) NOT NULL,
    `project_id` VARCHAR(26) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `probability` VARCHAR(16) NOT NULL,
    `impact` VARCHAR(16) NOT NULL,
    `mitigation` TEXT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    `owner_id` VARCHAR(26) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `risk_project_id_status_idx`(`project_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `issue` (
    `id` VARCHAR(26) NOT NULL,
    `project_id` VARCHAR(26) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `severity` VARCHAR(16) NOT NULL,
    `resolution` TEXT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    `owner_id` VARCHAR(26) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `issue_project_id_status_idx`(`project_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity` (
    `id` VARCHAR(26) NOT NULL,
    `activity_type` VARCHAR(16) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `category_code` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(26) NOT NULL,
    `start_date_time` DATETIME(3) NULL,
    `end_date_time` DATETIME(3) NULL,
    `is_all_day` BOOLEAN NOT NULL DEFAULT false,
    `due_date_time` DATETIME(3) NULL,
    `task_status` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `activity_activity_type_deleted_at_idx`(`activity_type`, `deleted_at`),
    INDEX `activity_user_id_activity_type_idx`(`user_id`, `activity_type`),
    INDEX `activity_start_date_time_idx`(`start_date_time`),
    INDEX `activity_due_date_time_task_status_idx`(`due_date_time`, `task_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_association` (
    `id` VARCHAR(26) NOT NULL,
    `activity_id` VARCHAR(26) NOT NULL,
    `entity_type` VARCHAR(32) NOT NULL,
    `entity_id` VARCHAR(26) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_association_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    UNIQUE INDEX `activity_association_activity_id_entity_type_entity_id_key`(`activity_id`, `entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_contact` (
    `id` VARCHAR(26) NOT NULL,
    `activity_id` VARCHAR(26) NOT NULL,
    `contact_id` VARCHAR(26) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_contact_contact_id_idx`(`contact_id`),
    UNIQUE INDEX `activity_contact_activity_id_contact_id_key`(`activity_id`, `contact_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `travel_plan` (
    `id` VARCHAR(26) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `purpose` VARCHAR(64) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `lead_traveller_id` VARCHAR(26) NOT NULL,
    `business_unit_id` VARCHAR(26) NULL,
    `advance_amount_paise` BIGINT NOT NULL DEFAULT 0,
    `advance_status` VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUESTED',
    `reimbursement_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    `reimbursement_paid_paise` BIGINT NOT NULL DEFAULT 0,
    `reimbursement_ref` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `rejection_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `travel_plan_status_deleted_at_idx`(`status`, `deleted_at`),
    INDEX `travel_plan_lead_traveller_id_idx`(`lead_traveller_id`),
    INDEX `travel_plan_start_date_idx`(`start_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `travel_plan_traveller` (
    `id` VARCHAR(26) NOT NULL,
    `travel_plan_id` VARCHAR(26) NOT NULL,
    `user_id` VARCHAR(26) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `travel_plan_traveller_user_id_idx`(`user_id`),
    UNIQUE INDEX `travel_plan_traveller_travel_plan_id_user_id_key`(`travel_plan_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `travel_plan_association` (
    `id` VARCHAR(26) NOT NULL,
    `travel_plan_id` VARCHAR(26) NOT NULL,
    `entity_type` VARCHAR(32) NOT NULL,
    `entity_id` VARCHAR(26) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `travel_plan_association_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    UNIQUE INDEX `travel_plan_association_travel_plan_id_entity_type_entity_id_key`(`travel_plan_id`, `entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `travel_plan_ticket` (
    `id` VARCHAR(26) NOT NULL,
    `travel_plan_id` VARCHAR(26) NOT NULL,
    `ticket_type` VARCHAR(32) NOT NULL,
    `from_location` VARCHAR(255) NOT NULL,
    `to_location` VARCHAR(255) NOT NULL,
    `travel_date` DATE NOT NULL,
    `return_date` DATE NULL,
    `booking_ref` VARCHAR(128) NULL,
    `amount_paise` BIGINT NOT NULL,
    `notes` VARCHAR(500) NULL,
    `attachment_name` VARCHAR(255) NULL,
    `attachment_path` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `travel_plan_ticket_travel_plan_id_idx`(`travel_plan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `travel_plan_hotel` (
    `id` VARCHAR(26) NOT NULL,
    `travel_plan_id` VARCHAR(26) NOT NULL,
    `hotel_name` VARCHAR(255) NOT NULL,
    `location` VARCHAR(255) NOT NULL,
    `check_in` DATE NOT NULL,
    `check_out` DATE NOT NULL,
    `booking_ref` VARCHAR(128) NULL,
    `amount_paise` BIGINT NOT NULL,
    `notes` VARCHAR(500) NULL,
    `attachment_name` VARCHAR(255) NULL,
    `attachment_path` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `travel_plan_hotel_travel_plan_id_idx`(`travel_plan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `travel_plan_expense` (
    `id` VARCHAR(26) NOT NULL,
    `travel_plan_id` VARCHAR(26) NOT NULL,
    `category` VARCHAR(64) NOT NULL,
    `expense_date` DATE NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `amount_paise` BIGINT NOT NULL,
    `receipt_ref` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `travel_plan_expense_travel_plan_id_idx`(`travel_plan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_entry` (
    `id` VARCHAR(26) NOT NULL,
    `owner_user_id` VARCHAR(26) NOT NULL,
    `portal` VARCHAR(255) NOT NULL,
    `location` VARCHAR(255) NULL,
    `username` VARCHAR(255) NOT NULL,
    `encrypted_pass` TEXT NOT NULL,
    `pass_iv` VARCHAR(32) NOT NULL,
    `pass_tag` VARCHAR(32) NOT NULL,
    `notes` TEXT NULL,
    `visibility` VARCHAR(16) NOT NULL DEFAULT 'PERSONAL',
    `shared_role_id` VARCHAR(26) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `password_entry_owner_user_id_deleted_at_idx`(`owner_user_id`, `deleted_at`),
    INDEX `password_entry_visibility_deleted_at_idx`(`visibility`, `deleted_at`),
    INDEX `password_entry_shared_role_id_idx`(`shared_role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_security_question` (
    `id` VARCHAR(26) NOT NULL,
    `password_entry_id` VARCHAR(26) NOT NULL,
    `question` VARCHAR(500) NOT NULL,
    `encrypted_answer` TEXT NOT NULL,
    `answer_iv` VARCHAR(32) NOT NULL,
    `answer_tag` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `password_security_question_password_entry_id_idx`(`password_entry_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `opportunity_account_id_idx` ON `opportunity`(`account_id`);

-- CreateIndex
CREATE UNIQUE INDEX `project_project_code_key` ON `project`(`project_code`);

-- CreateIndex
CREATE INDEX `project_project_manager_id_idx` ON `project`(`project_manager_id`);

-- CreateIndex
CREATE INDEX `task_project_id_kanban_column_idx` ON `task`(`project_id`, `kanban_column`);

-- AddForeignKey
ALTER TABLE `lookup_item` ADD CONSTRAINT `lookup_item_list_id_fkey` FOREIGN KEY (`list_id`) REFERENCES `lookup_list`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_parent_account_id_fkey` FOREIGN KEY (`parent_account_id`) REFERENCES `account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_government_id_fkey` FOREIGN KEY (`government_id`) REFERENCES `government`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_contact` ADD CONSTRAINT `account_contact_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_contact` ADD CONSTRAINT `account_contact_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `influencer` ADD CONSTRAINT `influencer_government_id_fkey` FOREIGN KEY (`government_id`) REFERENCES `government`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opportunity_influencer` ADD CONSTRAINT `opportunity_influencer_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opportunity_influencer` ADD CONSTRAINT `opportunity_influencer_influencer_id_fkey` FOREIGN KEY (`influencer_id`) REFERENCES `influencer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opportunity_contact` ADD CONSTRAINT `opportunity_contact_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opportunity_contact` ADD CONSTRAINT `opportunity_contact_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead` ADD CONSTRAINT `lead_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead` ADD CONSTRAINT `lead_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead` ADD CONSTRAINT `lead_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead` ADD CONSTRAINT `lead_converted_opportunity_id_fkey` FOREIGN KEY (`converted_opportunity_id`) REFERENCES `opportunity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opportunity` ADD CONSTRAINT `opportunity_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opportunity` ADD CONSTRAINT `opportunity_end_client_account_id_fkey` FOREIGN KEY (`end_client_account_id`) REFERENCES `account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opportunity` ADD CONSTRAINT `opportunity_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_of_sale_entry` ADD CONSTRAINT `cost_of_sale_entry_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone` ADD CONSTRAINT `milestone_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_milestone_id_fkey` FOREIGN KEY (`milestone_id`) REFERENCES `milestone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_effort_log` ADD CONSTRAINT `task_effort_log_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_effort_log` ADD CONSTRAINT `task_effort_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget` ADD CONSTRAINT `budget_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_line` ADD CONSTRAINT `budget_line_budget_id_fkey` FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inflow_plan_item` ADD CONSTRAINT `inflow_plan_item_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inflow_plan_item` ADD CONSTRAINT `inflow_plan_item_milestone_id_fkey` FOREIGN KEY (`milestone_id`) REFERENCES `milestone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cash_flow_period` ADD CONSTRAINT `cash_flow_period_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pbg_record` ADD CONSTRAINT `pbg_record_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `risk` ADD CONSTRAINT `risk_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `risk` ADD CONSTRAINT `risk_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue` ADD CONSTRAINT `issue_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `issue` ADD CONSTRAINT `issue_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity` ADD CONSTRAINT `activity_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_association` ADD CONSTRAINT `activity_association_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_contact` ADD CONSTRAINT `activity_contact_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_contact` ADD CONSTRAINT `activity_contact_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `travel_plan` ADD CONSTRAINT `travel_plan_lead_traveller_id_fkey` FOREIGN KEY (`lead_traveller_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `travel_plan` ADD CONSTRAINT `travel_plan_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `travel_plan_traveller` ADD CONSTRAINT `travel_plan_traveller_travel_plan_id_fkey` FOREIGN KEY (`travel_plan_id`) REFERENCES `travel_plan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `travel_plan_traveller` ADD CONSTRAINT `travel_plan_traveller_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `travel_plan_association` ADD CONSTRAINT `travel_plan_association_travel_plan_id_fkey` FOREIGN KEY (`travel_plan_id`) REFERENCES `travel_plan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `travel_plan_ticket` ADD CONSTRAINT `travel_plan_ticket_travel_plan_id_fkey` FOREIGN KEY (`travel_plan_id`) REFERENCES `travel_plan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `travel_plan_hotel` ADD CONSTRAINT `travel_plan_hotel_travel_plan_id_fkey` FOREIGN KEY (`travel_plan_id`) REFERENCES `travel_plan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `travel_plan_expense` ADD CONSTRAINT `travel_plan_expense_travel_plan_id_fkey` FOREIGN KEY (`travel_plan_id`) REFERENCES `travel_plan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_entry` ADD CONSTRAINT `password_entry_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_entry` ADD CONSTRAINT `password_entry_shared_role_id_fkey` FOREIGN KEY (`shared_role_id`) REFERENCES `role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_security_question` ADD CONSTRAINT `password_security_question_password_entry_id_fkey` FOREIGN KEY (`password_entry_id`) REFERENCES `password_entry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
