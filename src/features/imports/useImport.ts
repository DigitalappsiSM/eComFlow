import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isOnline } from '@/lib/connectivity';
import { loadFile, validateFileMeta, type LoadedFile } from '@/lib/file-reader';
import { extractSingleTable } from '@/lib/excel';
import { buildImportPlan, type ImportPlan } from '@/domain/import-pipeline';
import { buildPlacementIndex } from '@/domain/placement-index';
import { fetchPlacements } from '@/repositories/placements.repository';
import {
  buildFirestoreLookup,
  fetchPlacementCatalog,
  findImportByFileHash,
  runImport,
  type RunImportResult,
} from '@/repositories/import-processing.repository';
import { DEFAULT_APP_SETTINGS } from '@/types/operations';
import type { ImportScope } from '@/types/import';

export interface ImportProgress {
  confirmed: number;
  total: number;
  batch: number;
}

export type ImportState =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'rejected'; reason: string }
  | { step: 'preview'; file: LoadedFile; plan: ImportPlan; alreadyImported: boolean }
  | { step: 'confirming'; progress: ImportProgress }
  | { step: 'done'; result: RunImportResult }
  | { step: 'error'; message: string };

const DEFAULT_SCOPE: ImportScope = {
  scope_type: 'partial',
  scope_clients: [],
  scope_start_date: null,
  scope_end_date: null,
  scope_campaigns: [],
  is_complete_scope: false,
};

export function useImport() {
  const { appUser, firebaseUser } = useAuth();
  const [state, setState] = useState<ImportState>({ step: 'idle' });

  const reset = useCallback(() => setState({ step: 'idle' }), []);

  const selectFile = useCallback(async (file: File) => {
    if (!isOnline()) {
      setState({
        step: 'rejected',
        reason: 'No hay conexión. No se puede iniciar una importación sin conexión (§29).',
      });
      return;
    }

    const meta = validateFileMeta(
      file,
      DEFAULT_APP_SETTINGS.allowed_file_extensions,
      DEFAULT_APP_SETTINGS.max_file_size,
    );
    if (!meta.ok) {
      setState({ step: 'rejected', reason: meta.reason ?? 'Archivo no válido.' });
      return;
    }

    setState({ step: 'reading' });
    try {
      const loaded = await loadFile(file);
      const table = extractSingleTable(loaded.buffer);
      if (!table.ok) {
        setState({ step: 'rejected', reason: table.reason });
        return;
      }

      const placements = await fetchPlacements();
      const index = buildPlacementIndex(placements);
      const lookup = buildFirestoreLookup();
      const [plan, alreadyImported] = await Promise.all([
        buildImportPlan(table.table.headers, table.table.rows, index, lookup),
        findImportByFileHash(loaded.hash),
      ]);

      if (plan.generalRejection) {
        setState({ step: 'rejected', reason: plan.generalRejection });
        return;
      }

      setState({ step: 'preview', file: loaded, plan, alreadyImported });
    } catch (err) {
      setState({
        step: 'error',
        message: err instanceof Error ? err.message : 'Error al leer el archivo.',
      });
    }
  }, []);

  const confirm = useCallback(
    async (scope: ImportScope = DEFAULT_SCOPE) => {
      if (state.step !== 'preview') return;
      if (!isOnline()) {
        setState({ step: 'error', message: 'Sin conexión: no se puede confirmar la importación.' });
        return;
      }
      if (!firebaseUser || !appUser) {
        setState({ step: 'error', message: 'Sesión no válida.' });
        return;
      }

      const { file, plan } = state;
      setState({ step: 'confirming', progress: { confirmed: 0, total: 0, batch: 0 } });
      try {
        const catalog = await fetchPlacementCatalog();
        const result = await runImport({
          plan,
          file: { name: file.name, size: file.size, hash: file.hash },
          scope,
          user: { uid: firebaseUser.uid, email: appUser.email },
          templateVersion: DEFAULT_APP_SETTINGS.import_template_version,
          catalog,
          onProgress: (confirmed, total, batch) =>
            setState({ step: 'confirming', progress: { confirmed, total, batch } }),
        });
        setState({ step: 'done', result });
      } catch (err) {
        setState({
          step: 'error',
          message: err instanceof Error ? err.message : 'Error al escribir en Firestore.',
        });
      }
    },
    [state, firebaseUser, appUser],
  );

  return { state, selectFile, confirm, reset };
}
