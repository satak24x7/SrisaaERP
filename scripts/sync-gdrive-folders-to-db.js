#!/usr/bin/env node
/**
 * sync-gdrive-folders-to-db.js
 *
 * Creates DocumentFolder records in the DB to match the GDrive folder structure
 * created by migrate-to-gdrive.js. Also moves existing DMS documents into the
 * correct category folders (e.g., company docs → Shared/Company folder).
 *
 * Safe to re-run — skips folders that already exist (by driveId).
 */

const fs = require('fs');
const path = require('path');

const apiNodeModules = path.resolve(__dirname, '../apps/api/node_modules');
const rootNodeModules = path.resolve(__dirname, '../node_modules');
function requireFrom(mod) {
  try { return require(path.join(apiNodeModules, mod)); } catch {}
  try { return require(path.join(rootNodeModules, mod)); } catch {}
  return require(mod);
}

const { PrismaClient } = requireFrom('@prisma/client');
const { google } = requireFrom('googleapis');
const prisma = new PrismaClient();

// ULID-like ID generator (simple version for script)
function newId() {
  const ts = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const rand = Array.from({ length: 16 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]).join('');
  return ts + rand;
}

const SYSTEM_ACTOR = 'system_migration';

async function getDriveClient() {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: ['dms_google_credentials', 'dms_google_folder_id'] } },
  });
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const creds = JSON.parse(cfg.dms_google_credentials);
  let auth;
  if (creds.client_id && creds.client_secret && creds.refresh_token) {
    const oauth2 = new google.auth.OAuth2(creds.client_id, creds.client_secret);
    oauth2.setCredentials({ refresh_token: creds.refresh_token });
    auth = oauth2;
  } else {
    auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] });
  }
  return { drive: google.drive({ version: 'v3', auth }), rootFolderId: cfg.dms_google_folder_id };
}

async function listSubfolders(drive, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
    orderBy: 'name',
  });
  return res.data.files || [];
}

async function ensureDbFolder({ name, parentId, scope, ownerUserId, driveId, sortOrder }) {
  // Check if already exists by driveId
  const existing = await prisma.documentFolder.findFirst({
    where: { driveId, deletedAt: null },
  });
  if (existing) {
    console.log(`  [EXISTS] ${name} (${existing.id})`);
    return existing.id;
  }

  // Also check by driveId with gdrive: prefix
  const existingPrefixed = await prisma.documentFolder.findFirst({
    where: { driveId: `gdrive:${driveId}`, deletedAt: null },
  });
  if (existingPrefixed) {
    console.log(`  [EXISTS] ${name} (${existingPrefixed.id})`);
    return existingPrefixed.id;
  }

  const id = newId();
  await prisma.documentFolder.create({
    data: {
      id, name, parentId: parentId || null,
      scope, ownerUserId: ownerUserId || null,
      driveId,
      sortOrder: sortOrder || 0,
      createdBy: SYSTEM_ACTOR, updatedBy: SYSTEM_ACTOR,
    },
  });
  console.log(`  [CREATED] ${name} -> ${id} (drive: ${driveId})`);
  return id;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Sync GDrive Folders → DocumentFolder DB   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const { drive, rootFolderId } = await getDriveClient();

  // --- Find top-level GDrive folders ---
  const topFolders = await listSubfolders(drive, rootFolderId);
  const sharedDrive = topFolders.find(f => f.name === 'Shared');
  const privateDrive = topFolders.find(f => f.name === 'Private');

  if (!sharedDrive) throw new Error('Shared folder not found in GDrive root');
  if (!privateDrive) throw new Error('Private folder not found in GDrive root');

  console.log(`Shared: ${sharedDrive.id}`);
  console.log(`Private: ${privateDrive.id}\n`);

  // --- Shared category folders ---
  console.log('--- Shared Category Folders ---');
  const sharedSubs = await listSubfolders(drive, sharedDrive.id);

  const categoryOrder = ['Company', 'Tenders', 'Projects', 'Expenses', 'Travel', 'General'];
  const categoryDbIds = {};

  for (let i = 0; i < categoryOrder.length; i++) {
    const catName = categoryOrder[i];
    const driveSub = sharedSubs.find(f => f.name === catName);
    if (!driveSub) { console.log(`  [SKIP] ${catName} not found on GDrive`); continue; }
    const dbId = await ensureDbFolder({
      name: catName, parentId: null, scope: 'SHARED',
      ownerUserId: null, driveId: driveSub.id, sortOrder: i,
    });
    categoryDbIds[catName] = dbId;
  }

  // --- Tender sub-folders ---
  if (categoryDbIds['Tenders']) {
    console.log('\n--- Tender Folders ---');
    const tenderFolders = await listSubfolders(drive, sharedSubs.find(f => f.name === 'Tenders').id);
    for (let i = 0; i < tenderFolders.length; i++) {
      const tf = tenderFolders[i];
      await ensureDbFolder({
        name: tf.name, parentId: categoryDbIds['Tenders'], scope: 'SHARED',
        ownerUserId: null, driveId: tf.id, sortOrder: i,
      });
    }
  }

  // --- Project sub-folders ---
  if (categoryDbIds['Projects']) {
    console.log('\n--- Project Folders ---');
    const projectFolders = await listSubfolders(drive, sharedSubs.find(f => f.name === 'Projects').id);
    for (let i = 0; i < projectFolders.length; i++) {
      const pf = projectFolders[i];
      await ensureDbFolder({
        name: pf.name, parentId: categoryDbIds['Projects'], scope: 'SHARED',
        ownerUserId: null, driveId: pf.id, sortOrder: i,
      });
    }
  }

  // --- Expense sub-folders ---
  if (categoryDbIds['Expenses']) {
    console.log('\n--- Expense Folders ---');
    const expFolders = await listSubfolders(drive, sharedSubs.find(f => f.name === 'Expenses').id);
    for (let i = 0; i < expFolders.length; i++) {
      const ef = expFolders[i];
      await ensureDbFolder({
        name: ef.name, parentId: categoryDbIds['Expenses'], scope: 'SHARED',
        ownerUserId: null, driveId: ef.id, sortOrder: i,
      });
    }
  }

  // --- Travel sub-folders (plan → tickets/hotels/expenses) ---
  if (categoryDbIds['Travel']) {
    console.log('\n--- Travel Folders ---');
    const travelFolders = await listSubfolders(drive, sharedSubs.find(f => f.name === 'Travel').id);
    for (let i = 0; i < travelFolders.length; i++) {
      const tp = travelFolders[i];
      const tpDbId = await ensureDbFolder({
        name: tp.name, parentId: categoryDbIds['Travel'], scope: 'SHARED',
        ownerUserId: null, driveId: tp.id, sortOrder: i,
      });
      // Sub-folders: Tickets, Hotels, Expenses
      const subs = await listSubfolders(drive, tp.id);
      for (let j = 0; j < subs.length; j++) {
        await ensureDbFolder({
          name: subs[j].name, parentId: tpDbId, scope: 'SHARED',
          ownerUserId: null, driveId: subs[j].id, sortOrder: j,
        });
      }
    }
  }

  // --- General sub-folders (user-created DMS shared folders) ---
  // Move any existing root-level shared folders under General if they're not category folders
  if (categoryDbIds['General']) {
    console.log('\n--- Reparenting existing shared folders under General ---');
    const existingRootShared = await prisma.documentFolder.findMany({
      where: { scope: 'SHARED', parentId: null, deletedAt: null },
    });
    for (const f of existingRootShared) {
      // Skip category folders
      if (Object.values(categoryDbIds).includes(f.id)) continue;
      console.log(`  [MOVE] "${f.name}" → under General`);
      await prisma.documentFolder.update({
        where: { id: f.id },
        data: { parentId: categoryDbIds['General'] },
      });
    }
  }

  // --- Private user folders ---
  console.log('\n--- Private User Folders ---');
  const userFolders = await listSubfolders(drive, privateDrive.id);
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, fullName: true },
  });

  for (let i = 0; i < userFolders.length; i++) {
    const uf = userFolders[i];
    // Extract userId from folder name pattern: "Name (userId)"
    const match = uf.name.match(/\(([A-Z0-9]+)\)$/);
    const userId = match ? match[1] : null;
    const user = userId ? users.find(u => u.id === userId) : null;

    if (!user) {
      console.log(`  [SKIP] ${uf.name} — no matching user`);
      continue;
    }

    const dbId = await ensureDbFolder({
      name: user.fullName || uf.name, parentId: null, scope: 'PERSONAL',
      ownerUserId: user.id, driveId: uf.id, sortOrder: i,
    });

    // Move any existing personal folders for this user under this new root
    const existingPersonal = await prisma.documentFolder.findMany({
      where: { scope: 'PERSONAL', ownerUserId: user.id, parentId: null, deletedAt: null },
    });
    for (const pf of existingPersonal) {
      if (pf.id === dbId) continue;
      console.log(`  [MOVE] "${pf.name}" → under ${user.fullName}'s folder`);
      await prisma.documentFolder.update({
        where: { id: pf.id },
        data: { parentId: dbId },
      });
    }
  }

  console.log('\n✅ Folder sync complete!');
}

main()
  .catch((e) => { console.error('\n❌ Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
