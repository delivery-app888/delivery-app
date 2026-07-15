/**
 * db.js — IndexedDB wrapper using Dexie.js
 * 
 * This replaces the window.storage API used in the Claude.ai artifact version.
 * 
 * Migration mapping:
 *   window.storage.get(key)        → db.store.get(key)
 *   window.storage.set(key, value) → db.store.put({ key, value })
 *   window.storage.delete(key)     → db.store.delete(key)
 *   window.storage.list(prefix)    → db.store.where('key').startsWith(prefix).keys()
 */

import Dexie from 'dexie';

const db = new Dexie('DeliveryLogDB');

db.version(1).stores({
  // Key-value store (mirrors window.storage structure)
  store: 'key',
  // Future: dedicated tables for better querying
  // deliveries: '++id, date, company, rating',
  // sessions: '++id, date',
});

// Ensure database is open before any operation
let dbReady = null;
export const ensureDB = () => {
  if (!dbReady) {
    dbReady = db.open().catch(err => {
      console.error('[DB] Failed to open IndexedDB:', err);
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
};

// ─── API compatible with window.storage ───

export const storage = {
  async get(key) {
    await ensureDB();
    try {
      const row = await db.store.get(key);
      return row ? { key: row.key, value: row.value } : null;
    } catch (err) {
      console.error('[DB] get failed:', key, err);
      return null;
    }
  },

  async set(key, value) {
    await ensureDB();
    try {
      await db.store.put({ key, value });
      return { key, value };
    } catch (err) {
      console.error('[DB] set failed:', key, err);
      throw err;
    }
  },

  async delete(key) {
    await ensureDB();
    try {
      await db.store.delete(key);
      return { key, deleted: true };
    } catch (err) {
      console.error('[DB] delete failed:', key, err);
      throw err;
    }
  },

  async list(prefix) {
    await ensureDB();
    try {
      if (prefix) {
        const keys = await db.store.where('key').startsWith(prefix).primaryKeys();
        return { keys, prefix };
      }
      const keys = await db.store.toCollection().primaryKeys();
      return { keys };
    } catch (err) {
      console.error('[DB] list failed:', prefix, err);
      return { keys: [] };
    }
  },
};

// Restore multiple daily logs and their index as one atomic operation.
// If any write fails, Dexie rolls the whole transaction back.
export const restoreLogs = async (logs) => {
  await ensureDB();
  const rows = logs.map(log => ({ key: `log:${log.date}`, value: JSON.stringify(log) }));
  const importedKeys = rows.map(row => row.key);

  await db.transaction('rw', db.store, async () => {
    const indexRow = await db.store.get('all-logs-index');
    let indexedKeys = [];
    try {
      indexedKeys = indexRow ? JSON.parse(indexRow.value) : [];
      if (!Array.isArray(indexedKeys)) indexedKeys = [];
    } catch {
      indexedKeys = [];
    }
    const storedLogKeys = await db.store.where('key').startsWith('log:').primaryKeys();
    const nextKeys = [...new Set([...indexedKeys, ...storedLogKeys, ...importedKeys])].sort();
    await db.store.bulkPut(rows);
    await db.store.put({ key: 'all-logs-index', value: JSON.stringify(nextKeys) });
  });
};

export default db;
