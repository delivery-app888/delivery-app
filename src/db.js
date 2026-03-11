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

// ─── API compatible with window.storage ───

export const storage = {
  async get(key) {
    const row = await db.store.get(key);
    return row ? { key: row.key, value: row.value } : null;
  },

  async set(key, value) {
    await db.store.put({ key, value });
    return { key, value };
  },

  async delete(key) {
    await db.store.delete(key);
    return { key, deleted: true };
  },

  async list(prefix) {
    if (prefix) {
      const keys = await db.store.where('key').startsWith(prefix).primaryKeys();
      return { keys, prefix };
    }
    const keys = await db.store.toCollection().primaryKeys();
    return { keys };
  },
};

export default db;
