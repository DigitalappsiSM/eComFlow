import { Construction } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  phase: string;
}

/**
 * Vista de fase posterior. Se declara explícitamente como pendiente para NO
 * presentar funcionalidad simulada como terminada (§58). Los contratos
 * (tipos, esquemas, repositorios) ya están preparados.
 */
export function PlaceholderPage({ title, description, phase }: PlaceholderPageProps) {
  return (
    <AppLayout title={title} description={description}>
      <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
        <Construction className="h-10 w-10 text-slate-300" aria-hidden="true" />
        <h2 className="text-base font-semibold text-slate-700">Vista preparada para {phase}</h2>
        <p className="max-w-md text-sm text-slate-500">
          Esta sección tiene sus tipos, esquemas y servicios definidos, pero su interfaz se
          implementa en una fase posterior. No se muestran datos simulados.
        </p>
      </div>
    </AppLayout>
  );
}
