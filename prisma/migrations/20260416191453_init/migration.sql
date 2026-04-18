-- CreateTable
CREATE TABLE `company` (
    `id` VARCHAR(26) NOT NULL,
    `legal_name` VARCHAR(255) NOT NULL,
    `cin` VARCHAR(32) NULL,
    `logo_uri` VARCHAR(512) NULL,
    `registered_address` TEXT NULL,
    `corporate_address` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_unit` (
    `id` VARCHAR(26) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` TEXT NULL,
    `cost_centre` VARCHAR(32) NULL,
    `bu_head_user_id` VARCHAR(26) NOT NULL,
    `approval_thresholds` JSON NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `business_unit_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(26) NOT NULL,
    `external_id` VARCHAR(128) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `user_external_id_key`(`external_id`),
    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee` (
    `id` VARCHAR(26) NOT NULL,
    `user_id` VARCHAR(26) NOT NULL,
    `employee_code` VARCHAR(32) NOT NULL,
    `designation` VARCHAR(128) NULL,
    `grade` VARCHAR(16) NULL,
    `qualifications` JSON NULL,
    `skills` JSON NULL,
    `cv_uri` VARCHAR(512) NULL,
    `date_of_joining` DATE NULL,
    `availability` VARCHAR(32) NULL,
    `reporting_manager_id` VARCHAR(26) NULL,
    `pan_hash` VARCHAR(128) NULL,
    `aadhaar_hash` VARCHAR(128) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `employee_user_id_key`(`user_id`),
    UNIQUE INDEX `employee_employee_code_key`(`employee_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `statutory_registration` (
    `id` VARCHAR(26) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `number` VARCHAR(64) NOT NULL,
    `state` VARCHAR(32) NULL,
    `validity_start` DATE NULL,
    `validity_end` DATE NULL,
    `certificate_uri` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    UNIQUE INDEX `statutory_registration_type_number_key`(`type`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certification` (
    `id` VARCHAR(26) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `scope` TEXT NULL,
    `certificate_no` VARCHAR(64) NULL,
    `issuing_body` VARCHAR(128) NULL,
    `validity_start` DATE NULL,
    `validity_end` DATE NULL,
    `certificate_uri` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `certification_validity_end_idx`(`validity_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dsc` (
    `id` VARCHAR(26) NOT NULL,
    `holder_user_id` VARCHAR(26) NOT NULL,
    `serial_no` VARCHAR(128) NOT NULL,
    `issuer` VARCHAR(128) NULL,
    `validity_start` DATE NULL,
    `validity_end` DATE NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    UNIQUE INDEX `dsc_serial_no_key`(`serial_no`),
    INDEX `dsc_validity_end_idx`(`validity_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empanelment` (
    `id` VARCHAR(26) NOT NULL,
    `agency_name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(128) NULL,
    `empanelment_no` VARCHAR(64) NULL,
    `rate_contract_ref` VARCHAR(128) NULL,
    `validity_start` DATE NULL,
    `validity_end` DATE NULL,
    `certificate_uri` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `empanelment_validity_end_idx`(`validity_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `turnover_record` (
    `id` VARCHAR(26) NOT NULL,
    `financial_year` VARCHAR(10) NOT NULL,
    `revenue_paise` BIGINT NOT NULL,
    `net_worth_paise` BIGINT NULL,
    `auditor_name` VARCHAR(255) NULL,
    `audited_flag` BOOLEAN NOT NULL DEFAULT false,
    `certificate_uri` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    UNIQUE INDEX `turnover_record_financial_year_key`(`financial_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `past_project` (
    `id` VARCHAR(26) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `client_name` VARCHAR(255) NOT NULL,
    `order_value_paise` BIGINT NOT NULL,
    `start_date` DATE NULL,
    `completion_date` DATE NULL,
    `completion_pct` INTEGER NOT NULL DEFAULT 0,
    `completion_cert_uri` VARCHAR(512) NULL,
    `domain` VARCHAR(128) NULL,
    `keywords` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_account` (
    `id` VARCHAR(26) NOT NULL,
    `bank_name` VARCHAR(128) NOT NULL,
    `account_name` VARCHAR(255) NOT NULL,
    `account_no` VARCHAR(64) NOT NULL,
    `ifsc` VARCHAR(16) NOT NULL,
    `branch` VARCHAR(255) NULL,
    `purpose` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opportunity` (
    `id` VARCHAR(26) NOT NULL,
    `business_unit_id` VARCHAR(26) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `client_name` VARCHAR(255) NOT NULL,
    `stage` ENUM('CAPTURE', 'GO_NO_GO', 'PRE_BID', 'SOLUTION_PROPOSAL', 'BID_SUBMISSION', 'BID_EVALUATION', 'AWARDED', 'LOST') NOT NULL,
    `entry_path` ENUM('MANAGED_TENDER', 'STANDARD_TENDER', 'ACTIVE_TENDER', 'SOLUTION_PROPOSAL', 'RATE_CONTRACT') NOT NULL,
    `contract_value_paise` BIGINT NULL,
    `probability_pct` INTEGER NULL,
    `managed_tender_id` VARCHAR(26) NULL,
    `active_tender_id` VARCHAR(26) NULL,
    `submission_due` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `opportunity_business_unit_id_stage_created_at_idx`(`business_unit_id`, `stage`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project` (
    `id` VARCHAR(26) NOT NULL,
    `business_unit_id` VARCHAR(26) NOT NULL,
    `opportunity_id` VARCHAR(26) NULL,
    `name` VARCHAR(255) NOT NULL,
    `client_name` VARCHAR(255) NOT NULL,
    `work_order_ref` VARCHAR(128) NULL,
    `contract_value_paise` BIGINT NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `sponsor_user_id` VARCHAR(26) NULL,
    `project_manager_id` VARCHAR(26) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `project_business_unit_id_status_idx`(`business_unit_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task` (
    `id` VARCHAR(26) NOT NULL,
    `project_id` VARCHAR(26) NOT NULL,
    `parent_id` VARCHAR(26) NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('BACKLOG', 'TO_DO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE') NOT NULL DEFAULT 'BACKLOG',
    `owner_id` VARCHAR(26) NULL,
    `estimate_hours` DECIMAL(8, 2) NULL,
    `actual_hours` DECIMAL(8, 2) NULL,
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `milestone_id` VARCHAR(26) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `task_project_id_status_idx`(`project_id`, `status`),
    INDEX `task_owner_id_status_idx`(`owner_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expense_sheet` (
    `id` VARCHAR(26) NOT NULL,
    `business_unit_id` VARCHAR(26) NOT NULL,
    `sheet_type` ENUM('PRE_PROJECT', 'DURING_PROJECT', 'ADMIN_GENERAL', 'REIMBURSEMENT') NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED_FOR_CLARIFICATION', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `claimant_user_id` VARCHAR(26) NOT NULL,
    `opportunity_id` VARCHAR(26) NULL,
    `project_id` VARCHAR(26) NULL,
    `cost_centre` VARCHAR(32) NULL,
    `period_from` DATE NOT NULL,
    `period_to` DATE NOT NULL,
    `total_paise` BIGINT NOT NULL DEFAULT 0,
    `current_approval_step` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `expense_sheet_business_unit_id_status_idx`(`business_unit_id`, `status`),
    INDEX `expense_sheet_claimant_user_id_status_idx`(`claimant_user_id`, `status`),
    INDEX `expense_sheet_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expense_line` (
    `id` VARCHAR(26) NOT NULL,
    `sheet_id` VARCHAR(26) NOT NULL,
    `expense_date` DATE NOT NULL,
    `category_id` VARCHAR(26) NOT NULL,
    `vendor_name` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `amount_paise` BIGINT NOT NULL,
    `gst_paise` BIGINT NOT NULL DEFAULT 0,
    `payment_mode` VARCHAR(32) NOT NULL,
    `bill_uri` VARCHAR(512) NULL,
    `reimbursable` BOOLEAN NOT NULL DEFAULT true,
    `policy_exception_flag` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `expense_line_sheet_id_idx`(`sheet_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expense_category` (
    `id` VARCHAR(26) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `cap_paise` BIGINT NULL,
    `reimbursable` BOOLEAN NOT NULL DEFAULT true,
    `gst_input_credit_eligible` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `expense_category_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expense_sheet_event` (
    `id` VARCHAR(26) NOT NULL,
    `sheet_id` VARCHAR(26) NOT NULL,
    `from_status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED_FOR_CLARIFICATION', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'REJECTED') NOT NULL,
    `to_status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED_FOR_CLARIFICATION', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'REJECTED') NOT NULL,
    `actor_user_id` VARCHAR(26) NOT NULL,
    `actor_role` VARCHAR(32) NOT NULL,
    `comment` TEXT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `expense_sheet_event_sheet_id_occurred_at_idx`(`sheet_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item` (
    `id` VARCHAR(26) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `description` VARCHAR(512) NOT NULL,
    `uom` VARCHAR(16) NOT NULL,
    `category` VARCHAR(128) NULL,
    `hsn` VARCHAR(16) NULL,
    `specifications` JSON NULL,
    `last_purchased_rate_paise` BIGINT NULL,
    `make_model` VARCHAR(128) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    UNIQUE INDEX `item_sku_key`(`sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendor` (
    `id` VARCHAR(26) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `gstin` VARCHAR(16) NULL,
    `pan` VARCHAR(16) NULL,
    `category` VARCHAR(128) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(32) NULL,
    `bank_account_name` VARCHAR(255) NULL,
    `bank_account_no` VARCHAR(64) NULL,
    `bank_ifsc` VARCHAR(16) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    INDEX `vendor_gstin_idx`(`gstin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_request` (
    `id` VARCHAR(26) NOT NULL,
    `business_unit_id` VARCHAR(26) NOT NULL,
    `project_id` VARCHAR(26) NOT NULL,
    `mr_no` VARCHAR(32) NOT NULL,
    `requester_user_id` VARCHAR(26) NOT NULL,
    `priority` ENUM('NORMAL', 'URGENT', 'EMERGENCY') NOT NULL DEFAULT 'NORMAL',
    `required_by` DATE NOT NULL,
    `justification` TEXT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'PM_APPROVED', 'BU_HEAD_APPROVED', 'INDENTED', 'PO_RAISED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(26) NOT NULL,
    `updated_by` VARCHAR(26) NOT NULL,

    UNIQUE INDEX `material_request_mr_no_key`(`mr_no`),
    INDEX `material_request_project_id_status_idx`(`project_id`, `status`),
    INDEX `material_request_business_unit_id_created_at_idx`(`business_unit_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_request_line` (
    `id` VARCHAR(26) NOT NULL,
    `mr_id` VARCHAR(26) NOT NULL,
    `item_id` VARCHAR(26) NOT NULL,
    `qty_requested` DECIMAL(18, 4) NOT NULL,
    `qty_approved` DECIMAL(18, 4) NULL,
    `qty_fulfilled` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `remarks` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `material_request_line_mr_id_idx`(`mr_id`),
    INDEX `material_request_line_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` VARCHAR(26) NOT NULL,
    `actor_user_id` VARCHAR(26) NOT NULL,
    `actor_role` VARCHAR(32) NOT NULL,
    `resource_type` VARCHAR(64) NOT NULL,
    `resource_id` VARCHAR(26) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `correlation_id` VARCHAR(64) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(512) NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_log_resource_type_resource_id_occurred_at_idx`(`resource_type`, `resource_id`, `occurred_at`),
    INDEX `audit_log_actor_user_id_occurred_at_idx`(`actor_user_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_event` (
    `id` VARCHAR(26) NOT NULL,
    `aggregate_type` VARCHAR(64) NOT NULL,
    `aggregate_id` VARCHAR(26) NOT NULL,
    `event_type` VARCHAR(128) NOT NULL,
    `payload` JSON NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `published_at` DATETIME(3) NULL,

    INDEX `outbox_event_published_at_occurred_at_idx`(`published_at`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachment` (
    `id` VARCHAR(26) NOT NULL,
    `resource_type` VARCHAR(64) NOT NULL,
    `resource_id` VARCHAR(26) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(128) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `s3_key` VARCHAR(512) NOT NULL,
    `sha256` VARCHAR(64) NOT NULL,
    `uploaded_by` VARCHAR(26) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `attachment_s3_key_key`(`s3_key`),
    INDEX `attachment_resource_type_resource_id_idx`(`resource_type`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `business_unit` ADD CONSTRAINT `business_unit_bu_head_user_id_fkey` FOREIGN KEY (`bu_head_user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee` ADD CONSTRAINT `employee_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opportunity` ADD CONSTRAINT `opportunity_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project` ADD CONSTRAINT `project_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project` ADD CONSTRAINT `project_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expense_sheet` ADD CONSTRAINT `expense_sheet_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expense_sheet` ADD CONSTRAINT `expense_sheet_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expense_line` ADD CONSTRAINT `expense_line_sheet_id_fkey` FOREIGN KEY (`sheet_id`) REFERENCES `expense_sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expense_sheet_event` ADD CONSTRAINT `expense_sheet_event_sheet_id_fkey` FOREIGN KEY (`sheet_id`) REFERENCES `expense_sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_request` ADD CONSTRAINT `material_request_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_request` ADD CONSTRAINT `material_request_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_request_line` ADD CONSTRAINT `material_request_line_mr_id_fkey` FOREIGN KEY (`mr_id`) REFERENCES `material_request`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
