import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import {
  assignResponsable,
  fetchOperationsPage,
  updateCheck,
  type OperationRow,
} from '@/repositories/operations.repository';
import type { CheckKey } from '@/domain/progress';

type Status = 'loading' | 'error' | 'ready';

export function useOperations(pageSize = 50) {
  const { firebaseUser, appUser } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<OperationRow[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');

  const actor = useMemo(
    () =>
      firebaseUser && appUser ? { uid: firebaseUser.uid, email: appUser.email } : null,
    [firebaseUser, appUser],
  );

  const load = useCallback(
    async (reset: boolean) => {
      setStatus(reset ? 'loading' : status);
      try {
        const page = await fetchOperationsPage(pageSize, reset ? null : cursor);
        setRows((prev) => (reset ? page.rows : [...prev, ...page.rows]));
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        setStatus('ready');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Error desconocido.');
        setStatus('error');
      }
    },
    [pageSize, cursor, status],
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const idsOf = (row: OperationRow) => ({
    campaign_line_id: row.line.campaign_line_id,
    campaign_space_id: row.line.campaign_space_id,
    campaign_group_id: row.line.campaign_group_id,
  });

  const toggleCheck = useCallback(
    async (row: OperationRow, key: CheckKey) => {
      if (!actor) return;
      const next = !row.checks[key];
      const progress = await updateCheck(idsOf(row), row.checks, key, next, actor);
      setRows((prev) =>
        prev.map((r) =>
          r.line.campaign_line_id === row.line.campaign_line_id
            ? { ...r, checks: { ...r.checks, [key]: next }, progress }
            : r,
        ),
      );
    },
    [actor],
  );

  const setResponsable = useCallback(
    async (row: OperationRow, value: string) => {
      if (!actor) return;
      const responsable = value.trim() === '' ? null : value.trim();
      await assignResponsable(idsOf(row), row.responsable, responsable, actor);
      setRows((prev) =>
        prev.map((r) =>
          r.line.campaign_line_id === row.line.campaign_line_id ? { ...r, responsable } : r,
        ),
      );
    },
    [actor],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((r) =>
      [
        r.line.cliente_original,
        r.line.numero_campaña_original,
        r.line.placement_name_snapshot,
        r.line.creatividad_titulo_original,
        r.line.creatividad_id_original,
        r.responsable ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  return {
    status,
    message,
    rows: filtered,
    totalLoaded: rows.length,
    hasMore,
    loadMore: () => void load(false),
    reload: () => void load(true),
    search,
    setSearch,
    toggleCheck,
    setResponsable,
  };
}
