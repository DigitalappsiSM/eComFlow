import { useEffect, useState } from 'react';
import { X, Trash2, Send } from 'lucide-react';
import {
  addComment,
  archiveComment,
  fetchComments,
  fetchLineHistory,
  type OperationRow,
} from '@/repositories/operations.repository';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { LoadingState } from '@/components/feedback/States';
import type { CampaignComment } from '@/types/operations';
import type { ChangeHistoryEntry } from '@/types/audit';

function fmt(ts: { toDate?: () => Date } | null): string {
  return ts?.toDate ? ts.toDate().toLocaleString('es-MX') : '—';
}

/** Panel lateral con comentarios (§13) e historial (§24) de una línea. */
export function LineDetailDrawer({
  row,
  onClose,
}: {
  row: OperationRow;
  onClose: () => void;
}) {
  const { firebaseUser, appUser } = useAuth();
  const { can } = usePermissions();
  const canWrite = can('operations.write');

  const [comments, setComments] = useState<CampaignComment[] | null>(null);
  const [history, setHistory] = useState<ChangeHistoryEntry[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const ids = {
    campaign_line_id: row.line.campaign_line_id,
    campaign_space_id: row.line.campaign_space_id,
    campaign_group_id: row.line.campaign_group_id,
  };

  async function refresh() {
    const [c, h] = await Promise.all([
      fetchComments(row.line.campaign_line_id),
      fetchLineHistory(row.line.campaign_line_id),
    ]);
    setComments(c);
    setHistory(h);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.line.campaign_line_id]);

  async function submitComment() {
    if (!firebaseUser || !appUser || draft.trim() === '') return;
    setBusy(true);
    try {
      await addComment(ids, draft.trim(), { uid: firebaseUser.uid, email: appUser.email });
      setDraft('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    if (!firebaseUser || !appUser) return;
    setBusy(true);
    try {
      await archiveComment(commentId, ids, { uid: firebaseUser.uid, email: appUser.email });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalle de línea">
      <button className="flex-1 bg-black/30" aria-label="Cerrar" onClick={onClose} />
      <div className="flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {row.line.cliente_original} · {row.line.numero_campaña_original}
            </p>
            <p className="text-xs text-slate-500">
              {row.line.placement_name_snapshot} · Creatividad {row.line.creatividad_id_original}
            </p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <section className="border-b border-slate-200 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Comentarios</h3>
          {canWrite && (
            <div className="mb-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitComment()}
                placeholder="Escribir comentario…"
                className="focus-ring flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                aria-label="Nuevo comentario"
              />
              <button
                onClick={() => void submitComment()}
                disabled={busy || draft.trim() === ''}
                className="focus-ring rounded-lg bg-accent-blue px-3 py-1.5 text-white disabled:opacity-50"
                aria-label="Enviar comentario"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          {comments === null ? (
            <LoadingState label="Cargando comentarios…" />
          ) : comments.length === 0 ? (
            <p className="text-xs text-slate-400">Sin comentarios.</p>
          ) : (
            <ul className="space-y-2">
              {comments.map((c) => (
                <li key={c.comment_id} className="rounded-lg bg-slate-50 p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-slate-700">{c.comment}</p>
                    {canWrite && (
                      <button
                        onClick={() => void remove(c.comment_id)}
                        className="focus-ring rounded p-1 text-slate-400 hover:text-red-500"
                        aria-label="Archivar comentario"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{fmt(c.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Historial</h3>
          {history === null ? (
            <LoadingState label="Cargando historial…" />
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-400">Sin historial.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((h) => (
                <li key={h.change_id} className="text-xs text-slate-600">
                  <span className="font-medium text-slate-700">{h.change_type}</span>
                  {h.field_name ? ` · ${h.field_name}` : ''} · {fmt(h.created_at)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
