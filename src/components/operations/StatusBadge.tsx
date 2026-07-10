import { STATUS_LABELS, type CampaignStatus } from '@/domain/campaign-status';

const STYLES: Record<CampaignStatus, string> = {
  upcoming: 'bg-slate-100 text-slate-600',
  pending: 'bg-blue-50 text-accent-blue',
  incomplete: 'bg-amber-50 text-amber-700',
  at_risk: 'bg-red-50 text-red-600',
  live: 'bg-green-50 text-accent-green',
  completed: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-200 text-slate-500 line-through',
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
