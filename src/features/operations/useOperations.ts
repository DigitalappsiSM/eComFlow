import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import {
  assignResponsable,
  fetchOperationsPage,
  updateLineCancellation,
  updateCheck,
  updateOperationComment,
  type CancellationCommand,
  type OperationRow,
} from '@/repositories/operations.repository';
import { computeProgress, type CheckKey } from '@/domain/progress';
import { computeStatus, STATUS_LABELS } from '@/domain/campaign-status';
import { requiredChecksForLine } from '@/domain/operation-rules';
import { isLineFullyCancelled } from '@/domain/line-cancellation';
import { campaignLineWindow, isInvalidRange, windowIntersects } from '@/domain/operational-window';
import { getMonthWindow, todayIso } from '@/lib/dates';
import { distinctOptions, type FilterValues } from '@/components/filters/filter-utils';
import {
  rowEcommerceStatus,
  type DrilldownFilters,
  type OperationalStatus,
} from '@/domain/operations-drilldown';

type Status = 'loading' | 'error' | 'ready';

// Seguimiento operativo consulta por VENTANA de meses (por defecto mes anterior,
// actual y siguiente), acotando por la fecha de retirada para no cargar todo el
// histórico ni perder campañas continuas. El tope por página vuelve a ser
// moderado porque la ventana ya limita el volumen; se pagina con "Cargar más".
export function useOperations(pageSize = 500, initialFilters: DrilldownFilters = {}) {
  const { firebaseUser, appUser } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<OperationRow[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Filtros iniciales desde el drill-down del dashboard (parámetros de URL, §11).
  const [filters, setFilters] = useState<FilterValues>(() => {
    const f: FilterValues = {};
    if (initialFilters.tipo) f.tipo = initialFilters.tipo;
    if (initialFilters.cliente) f.cliente = initialFilters.cliente;
    return f;
  });
  const [search, setSearch] = useState('');
  // Rango de fijación (mismo filtro que el correo Ecommerce): ISO yyyy-mm-dd.
  const [fijacionDesde, setFijacionDesde] = useState(initialFilters.weekStart ?? '');
  const [fijacionHasta, setFijacionHasta] = useState(initialFilters.weekEnd ?? '');
  // Filtros de drill-down específicos del avance operativo Ecommerce.
  const [pendingCheck, setPendingCheck] = useState<CheckKey | null>(initialFilters.pendingCheck ?? null);
  const [statusFilter, setStatusFilter] = useState<OperationalStatus | null>(initialFilters.status ?? null);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'saving'>('idle');
  const [showCancelled, setShowCancelled] = useState(false);

  const actor = useMemo(
    () =>
      firebaseUser && appUser ? { uid: firebaseUser.uid, email: appUser.email } : null,
    [firebaseUser, appUser],
  );

  // Ventana operativa: por defecto mes anterior, actual y siguiente. Si el
  // usuario fija Desde/Hasta (válidos), se usan esos. El servidor acota por la
  // fecha de retirada (windowFrom) para no perder campañas continuas; el límite
  // superior (windowTo) se afina en cliente.
  const defaultWindow = useMemo(() => getMonthWindow(todayIso(), 1, 1), []);
  const rangeOk = !isInvalidRange(fijacionDesde, fijacionHasta);
  const windowFrom = rangeOk && fijacionDesde ? fijacionDesde : defaultWindow.start;
  const windowTo = rangeOk && fijacionHasta ? fijacionHasta : defaultWindow.end;

  const [reloadNonce, setReloadNonce] = useState(0);

  // Carga (reset) al cambiar la ventana de servidor (windowFrom) o al recargar.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchOperationsPage(pageSize, null, { from: windowFrom })
      .then((page) => {
        if (cancelled) return;
        setRows(page.rows);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : 'Error desconocido.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [windowFrom, pageSize, reloadNonce]);

  const loadMore = useCallback(() => {
    if (!cursor) return;
    fetchOperationsPage(pageSize, cursor, { from: windowFrom })
      .then((page) => {
        setRows((prev) => [...prev, ...page.rows]);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : 'Error desconocido.');
      });
  }, [cursor, pageSize, windowFrom]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  const idsOf = (row: OperationRow) => ({
    campaign_line_id: row.line.campaign_line_id,
    campaign_space_id: row.line.campaign_space_id,
    campaign_group_id: row.line.campaign_group_id,
  });

  const toggleCheck = useCallback(
    async (row: OperationRow, key: CheckKey) => {
      if (!actor || isLineFullyCancelled(row.line, todayIso())) return;
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
      if (!actor || isLineFullyCancelled(row.line, todayIso())) return;
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

  const setComment = useCallback(
    async (row: OperationRow, value: string) => {
      if (!actor || isLineFullyCancelled(row.line, todayIso())) return;
      const comentarios = value.trim();
      if (comentarios === (row.comentarios ?? '')) return;
      await updateOperationComment(idsOf(row), row.comentarios ?? '', comentarios, actor);
      setRows((prev) =>
        prev.map((r) =>
          r.line.campaign_line_id === row.line.campaign_line_id ? { ...r, comentarios } : r,
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
      if (!showCancelled && isLineFullyCancelled(r.line, today)) return false;
      if (filters.cadena && (r.line.cadena ?? '') !== filters.cadena) return false;
      if (filters.tipo && (r.line.tipo_operacion ?? '') !== filters.tipo) return false;
      if (filters.continuidad && (r.line.tipo_campana_periodo ?? '') !== filters.continuidad) return false;
      if (filters.cliente && (r.line.cliente_original ?? '') !== filters.cliente) return false;
      if (filters.estado && statusLabelOf(r) !== filters.estado) return false;
      // Drill-down: check pendiente concreto (§11).
      if (pendingCheck) {
        const req = requiredChecksForLine(r.line);
        if (!req.includes(pendingCheck) || r.checks[pendingCheck]) return false;
      }
      // Drill-down: estado operativo Ecommerce (§11).
      if (statusFilter && rowEcommerceStatus(r.line, r.checks, today) !== statusFilter) return false;
      // Rango operativo (§12): cruce con la ventana activación → periodo → fechas.
      if (!windowIntersects(campaignLineWindow(r.line), windowFrom, windowTo)) return false;
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
          r.comentarios ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, filters, statusLabelOf, windowFrom, windowTo, pendingCheck, statusFilter, today, showCancelled]);

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
      if (!actor || savingLineId || isLineFullyCancelled(row.line, today)) return;
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
    [actor, savingLineId, today],
  );

  // Líneas filtradas (visibles) que aún tienen checks obligatorios pendientes.
  const visibleRowsWithPending = useMemo(
    () =>
      filtered.filter(
        (r) =>
          !isLineFullyCancelled(r.line, today) &&
          requiredChecksForLine(r.line).some((key) => !r.checks[key]),
      ),
    [filtered, today],
  );

  const cancelledCount = useMemo(
    () => rows.filter((row) => isLineFullyCancelled(row.line, today)).length,
    [rows, today],
  );

  const setLineCancellation = useCallback(
    async (row: OperationRow, command: CancellationCommand) => {
      if (!actor || savingLineId) return;
      setSavingLineId(row.line.campaign_line_id);
      try {
        const patch = await updateLineCancellation(idsOf(row), command, actor, today);
        setRows((prev) =>
          prev.map((candidate) =>
            candidate.line.campaign_line_id === row.line.campaign_line_id
              ? { ...candidate, line: { ...candidate.line, ...patch } }
              : candidate,
          ),
        );
      } finally {
        setSavingLineId(null);
      }
    },
    [actor, savingLineId, today],
  );

  // Rellena de una vez todos los checks obligatorios pendientes de TODAS las
  // líneas filtradas/visibles. Cada check se persiste con auditoría.
  const markAllVisibleChecks = useCallback(async () => {
    if (!actor || bulkStatus === 'saving' || visibleRowsWithPending.length === 0) return;
    setBulkStatus('saving');
    const updated = new Map<string, Pick<OperationRow, 'checks' | 'progress'>>();
    try {
      for (const row of visibleRowsWithPending) {
        const requiredChecks = requiredChecksForLine(row.line);
        const nextChecks = { ...row.checks };
        for (const key of requiredChecks) {
          if (nextChecks[key]) continue;
          await updateCheck(idsOf(row), nextChecks, key, true, actor, requiredChecks);
          nextChecks[key] = true;
        }
        updated.set(row.line.campaign_line_id, {
          checks: nextChecks,
          progress: computeProgress(nextChecks, requiredChecks),
        });
      }
      setRows((prev) =>
        prev.map((r) => {
          const u = updated.get(r.line.campaign_line_id);
          return u ? { ...r, ...u } : r;
        }),
      );
    } finally {
      setBulkStatus('idle');
    }
  }, [actor, bulkStatus, visibleRowsWithPending]);

  const filterFields = useMemo(
    () => [
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
    loadMore,
    reload,
    search,
    setSearch,
    filters,
    filterFields,
    setFilter: (key: string, value: string) => setFilters((f) => ({ ...f, [key]: value })),
    fijacionDesde,
    fijacionHasta,
    setFijacionDesde,
    setFijacionHasta,
    rangeInvalid: isInvalidRange(fijacionDesde, fijacionHasta),
    // Filtros de drill-down activos (para mostrar chips y poder limpiarlos, §11).
    pendingCheck,
    statusFilter,
    clearFilters: () => {
      setFilters({});
      setSearch('');
      setFijacionDesde('');
      setFijacionHasta('');
      setPendingCheck(null);
      setStatusFilter(null);
    },
    clearDrilldown: () => {
      setFilters((f) => ({ ...f, tipo: '', cliente: '' }));
      setFijacionDesde('');
      setFijacionHasta('');
      setPendingCheck(null);
      setStatusFilter(null);
    },
    isLineExpired,
    savingLineId,
    markLineChecks,
    visiblePendingCount: visibleRowsWithPending.length,
    bulkStatus,
    markAllVisibleChecks,
    showCancelled,
    setShowCancelled,
    cancelledCount,
    setLineCancellation,
    toggleCheck,
    setResponsable,
    setComment,
  };
}
