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

function sanitizeRowForPostgres(row) {
  if (!row) return row;
  const sanitized = { ...row };
  for (const [key, val] of Object.entries(sanitized)) {
    if (val === null || val === undefined) continue;
    // Fix integer fields stored with decimal points or strings in SQLite
    if (
      key === 'token_version' ||
      key === 'created_by_admin' ||
      key === 'manual_suspended' ||
      key === 'subscription_suspended' ||
      key === 'experience_years' ||
      key === 'is_sponsored' ||
      key === 'is_active' ||
      key === 'sort_order' ||
      key === 'review_count' ||
      key === 'registration_fee_paid' ||
      key === 'sponsored_fee_paid' ||
      key === 'is_moderated' ||
      key === 'is_hidden' ||
      key === 'read' ||
      key === 'is_read'
    ) {
      sanitized[key] = Math.round(Number(val)) || 0;
    }
  }
  return sanitized;
}

export async function syncRowToSupabase(sqliteDb, tableName, pkValue) {
  const meta = tablesToSync.find(t => t.name === tableName);
  if (!meta) return false;

  const pkCol = meta.pk;
  const rawRow = sqliteDb.prepare(`SELECT * FROM "${tableName}" WHERE "${pkCol}" = ?`).get(pkValue);
  if (!rawRow) return false;
  const row = sanitizeRowForPostgres(rawRow);

  // 1. Try fastest, direct HTTP REST via Supabase Admin (bypasses pg pool limits & timeouts)
  try {
    const { error } = await supabaseAdmin.from(tableName).upsert(row, { onConflict: pkCol });
    if (!error) return true;
    console.warn(`[SupabaseSync] supabaseAdmin upsert note on ${tableName} (${pkValue}):`, error.message);
  } catch (err) {
    console.warn(`[SupabaseSync] supabaseAdmin exception on ${tableName} (${pkValue}):`, err.message);
  }

  // 2. Fallback to direct pg pool query
  try {
    const keys = Object.keys(row);
    const values = Object.values(row);
    const cols = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const updateSet = keys
      .filter(k => k !== pkCol)
      .map(k => `"${k}" = EXCLUDED."${k}"`)
      .join(', ') || `"${pkCol}" = EXCLUDED."${pkCol}"`;

    const query = `
      INSERT INTO "${tableName}" (${cols})
      VALUES (${placeholders})
      ON CONFLICT ("${pkCol}") DO UPDATE SET
      ${updateSet};
    `;
    await querySupabase(query, values);
    return true;
  } catch (e) {
    console.error(`[SupabaseSync] All sync methods failed for ${tableName} (${pkValue}):`, e.message);
    return false;
  }
}

export async function deleteRowFromSupabase(tableName, pkValue) {
  const meta = tablesToSync.find(t => t.name === tableName);
  if (!meta) return false;
  try {
    const { error } = await supabaseAdmin.from(tableName).delete().eq(meta.pk, pkValue);
    if (!error) return true;
  } catch (e) {}

  try {
    await querySupabase(`DELETE FROM "${tableName}" WHERE "${meta.pk}" = $1`, [pkValue]);
    return true;
  } catch (e) {
    return false;
  }
}

export async function syncTableToSupabase(sqliteDb, tableName) {
  const meta = tablesToSync.find(t => t.name === tableName);
  if (!meta) return;

  const rawRows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
  if (!rawRows || rawRows.length === 0) return;
  const rows = rawRows.map(sanitizeRowForPostgres);

  // Batch upsert via Supabase Admin REST in chunks of 50 (fast and avoids pool exhaustion)
  try {
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin.from(tableName).upsert(chunk, { onConflict: meta.pk });
      if (error) {
        throw new Error(error.message);
      }
    }
    return;
  } catch (err) {
    console.warn(`[SupabaseSync] Batch upsert note on ${tableName}, attempting fallback:`, err.message);
  }

  // Fallback: row-by-row querySupabase
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

// Cache timestamps & deduplication for in-flight pulls
const lastPullTimes = {};
const inFlightPulls = {};

export async function pullTableFromSupabase(sqliteDb, tableName) {
  try {
    const meta = tablesToSync.find(t => t.name === tableName);
    const pk = meta?.pk || 'id';

    let rows = [];

    // 1. Primary: Try fastest, direct HTTP REST via Supabase Admin (bypasses pg pool limits & timeouts)
    try {
      const { data, error } = await supabaseAdmin.from(tableName).select('*');
      if (!error && Array.isArray(data)) {
        rows = data;
      } else if (error) {
        console.warn(`[SupabaseSync] supabaseAdmin REST select note on ${tableName}:`, error.message);
      }
    } catch (err) {
      console.warn(`[SupabaseSync] supabaseAdmin REST select exception on ${tableName}:`, err.message);
    }

    // 2. Fallback: Direct PostgreSQL pool query
    if (rows.length === 0) {
      try {
        const res = await querySupabase(`SELECT * FROM "${tableName}"`);
        if (res && res.rows && res.rows.length > 0) {
          rows = res.rows;
        }
      } catch (pgErr) {
        if (rows.length === 0) {
          console.warn(`[SupabaseSync] Direct PG select note on ${tableName}:`, pgErr.message);
        }
      }
    }

    if (!rows || rows.length === 0) return 0;

    const tableInfo = sqliteDb.pragma(`table_info("${tableName}")`);
    const validCols = tableInfo.map(c => c.name);
    if (validCols.length === 0) return 0;

    // Use a transaction for 100x faster bulk insert/update
    const syncTransaction = sqliteDb.transaction((records) => {
      for (const row of records) {
        const matchedCols = Object.keys(row).filter(c => validCols.includes(c));
        if (matchedCols.length === 0) continue;

        const colList = matchedCols.map(c => `"${c}"`).join(', ');
        const placeholders = matchedCols.map(() => '?').join(', ');
        const vals = matchedCols.map(c => {
          const v = row[c];
          if (typeof v === 'boolean') {
            return v ? 1 : 0;
          }
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
    });

    syncTransaction(rows);
    return rows.length;
  } catch (e) {
    console.warn(`[SupabaseSync] Error pulling ${tableName}:`, e.message);
    return 0;
  }
}

/**
 * Ensures specified tables have been pulled from Supabase recently.
 * If data was pulled within `maxAgeMs`, immediately returns without re-querying.
 * Deduplicates concurrent requests to avoid duplicate network transfers.
 */
export async function ensureFreshFromSupabase(sqliteDb, tableNames = null, maxAgeMs = 15000) {
  const now = Date.now();
  const tables = tableNames 
    ? (Array.isArray(tableNames) ? tableNames : [tableNames])
    : tablesToSync.map(t => t.name);

  const toPull = tables.filter(t => !lastPullTimes[t] || (now - lastPullTimes[t]) > maxAgeMs);
  if (toPull.length === 0) return false;

  const promises = toPull.map(tableName => {
    if (!inFlightPulls[tableName]) {
      inFlightPulls[tableName] = (async () => {
        try {
          await pullTableFromSupabase(sqliteDb, tableName);
          lastPullTimes[tableName] = Date.now();
        } finally {
          delete inFlightPulls[tableName];
        }
      })();
    }
    return inFlightPulls[tableName];
  });

  try {
    sqliteDb.pragma('foreign_keys = OFF');
    await Promise.all(promises);
  } finally {
    sqliteDb.pragma('foreign_keys = ON');
  }

  return true;
}

export async function pullAllFromSupabase(sqliteDb) {
  try {
    sqliteDb.pragma('foreign_keys = OFF');
    for (const { name } of tablesToSync) {
      await pullTableFromSupabase(sqliteDb, name);
      lastPullTimes[name] = Date.now();
    }
  } finally {
    sqliteDb.pragma('foreign_keys = ON');
  }
}

export async function checkSupabaseConnection() {
  try {
    // 1. Try fastest REST check
    const { count, error } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
    if (!error) {
      return {
        connected: true,
        method: 'REST (supabaseAdmin)',
        serverTime: new Date().toISOString(),
        userCount: count
      };
    }
  } catch (e) {}

  // 2. Direct PG query fallback
  try {
    const res = await querySupabase('SELECT current_database(), now() as server_time');
    return {
      connected: true,
      method: 'PostgreSQL Direct Pool',
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

