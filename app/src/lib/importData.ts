import { useAuth } from './auth';
import { db } from './supabase';
import { markOwnWrite } from '../state/actions';
import { prepareImport } from './importFile';
export { parseImport } from './importFile';
export type { ImportFile, ImportSummary } from './importFile';
import type { ImportFile } from './importFile';

/** One database transaction; a failed or repeated request cannot leave half an import. */
export async function runImport(file: ImportFile): Promise<void> {
  const uid = useAuth.getState().session?.user.id;
  if (!uid) throw Error('No session');
  const { id, tables } = await prepareImport(file);
  if (useAuth.getState().session?.user.id !== uid) throw Error('Session changed');
  const keep = setInterval(() => markOwnWrite(), 1000);
  try {
    const { error } = await db().rpc('import_my_data', { p_id: id, p_rows: tables, p_owner: uid });
    if (error) throw error; // Never fall back to partial client-side inserts on older databases.
  } finally { clearInterval(keep); markOwnWrite(); }
}
