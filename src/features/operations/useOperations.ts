import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import {
  assignResponsable,
  fetchOperationsPage,
  updateCheck,
  type OperationRow,
} from '@/repositories/operations.repository';
import { computeProgress, type CheckKey } from '@/domain/progress';
import { computeStatus, STATUS_LABELS } from '@/domain/campaign-status';
import { requiredChecksForLine } from '@/domain/operation-rules';
import { todayIso } from '@/lib/dates';
import { distinctOptions, sortedOptions, type FilterValues } from '@/components/filters/filter-utils';

type Status = 'loading' | 'error' | 'ready';

export function useOperations(pageSize = 50) {
  const { firebaseUser, appUser } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<OperationRow[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState<FilterValues>({});
  const [search, setSearch] = useState('');
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

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
      const progress = await updateCheck(
        idsOf(row),
        row.checks,
        key,
        next,
        actor,
        requiredChecksForLine(row.line),
      );
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

  const today = todayIso();
  const statusLabelOf = useCallback(
    (r: OperationRow) =>
      STATUS_LABELS[
        computeStatus({
          fechaFijacion: r.line.fecha_fijacion,
          fechaRetirada: r.line.fecha_retirada,
          checks: r.checks,
          cancelled: r.line.cancelled,
          today,
          requiredChecks: requiredChecksForLine(r.line),
        })
      ],
    [today],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.periodo && (r.line.periodo_original ?? '') !== filters.periodo) return false;
      if (filters.cadena && (r.line.cadena ?? '') !== filters.cadena) return false;
      if (filters.tipo && (r.line.tipo_operacion ?? '') !== filters.tipo) return false;
      if (filters.continuidad && (r.line.tipo_campana_periodo ?? '') !== filters.continuidad) return false;
      if (filters.cliente && (r.line.cliente_original ?? '') !== filters.cliente) return false;
      if (filters.estado && statusLabelOf(r) !== filters.estado) return false;
      if (q !== '') {
        const hay = [
          r.line.cliente_original,
          r.line.numero_campaña_original,
          r.line.placement_name_snapshot,
          r.line.creatividad_titulo_original,
          r.line.creatividad_id_original,
          r.line.periodo_original ?? '',
          r.line.tipo_campana_periodo ?? '',
          r.line.tipo_operacion ?? '',
          r.line.cadena ?? '',
          r.responsable ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filters, statusLabelOf]);

  // El periodo operativo de una línea ya venció. Usa periodo_fin si existe (el
  // periodo operativo vence antes que la campaña global); si no, fecha_retirada.
  const isLineExpired = useCallback(
    (row: OperationRow) => (row.line.periodo_fin ?? row.line.fecha_retirada) < today,
    [today],
  );

  // Marca de una vez todos los checks obligatorios pendientes de UNA sola línea.
  // Cada check se persiste con auditoría (mismo flujo que un check individual).
  const markLineChecks = useCallback(
    async (row: OperationRow) => {
      if (!actor || savingLineId) return;
      const requiredChecks = requiredChecksForLine(row.line);
      if (!requiredChecks.some((key) => !row.checks[key])) return;

      setSavingLineId(row.line.campaign_line_id);
      const nextChecks = { ...row.checks };
      try {
        for (const key of requiredChecks) {
          if (nextChecks[key]) continue;
          await updateCheck(idsOf(row), nextChecks, key, true, actor, requiredChecks);
          nextChecks[key] = true;
        }
        const progress = computeProgress(nextChecks, requiredChecks);
        setRows((prev) =>
          prev.map((r) =>
            r.line.campaign_line_id === row.line.campaign_line_id
              ? { ...r, checks: nextChecks, progress }
              : r,
          ),
        );
      } finally {
        setSavingLineId(null);
      }
    },
    [actor, savingLineId],
  );

  const filterFields = useMemo(
    () => [
      {
        key: 'periodo',
        label: 'Periodo',
        options: sortedOptions(rows, (r) => r.line.periodo_original, (r) => r.line.periodo_inicio),
      },
      { key: 'cadena', label: 'Cadena', options: distinctOptions(rows, (r) => r.line.cadena) },
      { key: 'tipo', label: 'Tipo', options: distinctOptions(rows, (r) => r.line.tipo_operacion) },
      {
        key: 'continuidad',
        label: 'Fijación/continua',
        options: distinctOptions(rows, (r) => r.line.tipo_campana_periodo),
      },
      { key: 'cliente', label: 'Cliente', options: distinctOptions(rows, (r) => r.line.cliente_original) },
      { key: 'estado', label: 'Estado', options: distinctOptions(rows, statusLabelOf) },
    ],
    [rows, statusLabelOf],
  );

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
    filters,
    filterFields,
    setFilter: (key: string, value: string) => setFilters((f) => ({ ...f, [key]: value })),
    clearFilters: () => {
      setFilters({});
      setSearch('');
    },
    isLineExpired,
    savingLineId,
    markLineChecks,
    toggleCheck,
    setResponsable,
  };
}
