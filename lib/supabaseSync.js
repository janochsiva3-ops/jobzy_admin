import { querySupabase, supabaseAdmin } from './supabase.js';

const tablesToSync = [
  { name: 'users', pk: 'id' },
  { name: 'categories', pk: 'id' },
  { name: 'platform_settings', pk: 'key' },
  { name: 'advertisements', pk: 'id' },
  { name: 'platform_fee_settings', pk: 'id' },
  { name: 'fee_change_history', pk: 'id' },
  { name: 'provider_profiles', pk: 'id' },
  { name: 'bookings', pk: 'id' },
  { name: 'reviews', pk: 'id' },
  { name: 'messages', pk: 'id' },
  { name: 'notifications', pk: 'id' },
  { name: 'financial_ledger', pk: 'id' },
  { name: 'transactions', pk: 'id' },
  { name: 'provider_subscriptions', pk: 'id' },
  { name: 'account_audit_logs', pk: 'id' }
];

export async function syncTableToSupabase(sqliteDb, tableName) {
  const meta = tablesToSync.find(t => t.name === tableName);
  if (!meta) return;

  const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    const keys = Object.keys(row);
    const values = Object.values(row);
    const cols = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const query = `
      INSERT INTO "${tableName}" (${cols})
      VALUES (${placeholders})
      ON CONFLICT ("${meta.pk}") DO UPDATE SET
      ${keys.filter(k => k !== meta.pk).map(k => `"${k}" = EXCLUDED."${k}"`).join(', ') || `"${meta.pk}" = EXCLUDED."${meta.pk}"`};
    `;
    try {
      await querySupabase(query, values);
    } catch (e) {
      console.warn(`[SupabaseSync] Error syncing ${tableName}:`, e.message);
    }
  }
}

export async function syncAllToSupabase(sqliteDb) {
  for (const { name } of tablesToSync) {
    await syncTableToSupabase(sqliteDb, name);
  }
}

export async function pullTableFromSupabase(sqliteDb, tableName) {
  try {
    const meta = tablesToSync.find(t => t.name === tableName);
    const pk = meta?.pk || 'id';

    const res = await querySupabase(`SELECT * FROM "${tableName}"`);
    if (!res || !res.rows || res.rows.length === 0) return;

    const tableInfo = sqliteDb.pragma(`table_info("${tableName}")`);
    const validCols = tableInfo.map(c => c.name);
    if (validCols.length === 0) return;

    for (const row of res.rows) {
      const matchedCols = Object.keys(row).filter(c => validCols.includes(c));
      if (matchedCols.length === 0) continue;

      const colList = matchedCols.map(c => `"${c}"`).join(', ');
      const placeholders = matchedCols.map(() => '?').join(', ');
      const vals = matchedCols.map(c => {
        const v = row[c];
        if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
          return JSON.stringify(v);
        }
        return v;
      });

      const updateSet = matchedCols
        .filter(c => c !== pk)
        .map(c => `"${c}" = excluded."${c}"`)
        .join(', ');

      const sql = updateSet
        ? `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT("${pk}") DO UPDATE SET ${updateSet}`
        : `INSERT OR IGNORE INTO "${tableName}" (${colList}) VALUES (${placeholders})`;

      sqliteDb.prepare(sql).run(...vals);
    }
  } catch (e) {
    console.warn(`[SupabaseSync] Error pulling ${tableName}:`, e.message);
  }
}

export async function pullAllFromSupabase(sqliteDb) {
  try {
    sqliteDb.pragma('foreign_keys = OFF');
    for (const { name } of tablesToSync) {
      await pullTableFromSupabase(sqliteDb, name);
    }
  } finally {
    sqliteDb.pragma('foreign_keys = ON');
  }
}

export async function checkSupabaseConnection() {
  try {
    const res = await querySupabase('SELECT current_database(), now() as server_time');
    return {
      connected: true,
      database: res.rows[0].current_database,
      serverTime: res.rows[0].server_time
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message
    };
  }
}

