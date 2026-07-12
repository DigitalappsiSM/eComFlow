# Changelog

Registro de cambios relevantes de eComFlow Next. Fechas en formato ISO.

## 2026-07-12 (iteración 3)

### Navegación (UX)
- **Menú agrupado** por área: Operación · Cargas · Herramientas · Administración.
- **Sidebar colapsable** en escritorio (rail de iconos con tooltips), con la
  preferencia recordada en `localStorage`.
- **Navegación móvil**: el sidebar se vuelve un **drawer** con hamburguesa en el
  header y fondo oscurecido; se cierra al navegar o tocar fuera.
- **Renombrado**: "Detalle de campaña" → **"Correo Ecommerce"** (coincide con su
  función).
- **Badge y campana con datos reales**: contador de **cambios detectados
  pendientes** (consulta a Firestore, sin datos simulados) en el menú y en la
  campana del header, que ahora enlaza a `/cambios`.

## 2026-07-12 (iteración 2)

### Dashboard: gráficas siempre visibles (rediseño)
- Las barras de "% cumplido" salían **vacías** porque casi ninguna línea tiene
  los 7 checks al 100 %. Se reemplazaron por **conteos apilados por estado**
  (Cumplidas / En proceso / En riesgo / Futuras) y **avance promedio (%)**, que
  siempre muestran datos y son más accionables.
- Gráficas: **Estado por cliente** (apilado), **Estado por periodo** (apilado),
  **Avance por cliente**, semáforo (dona) y cuellos de botella por check.
- KPIs encabezados por **Avance prom.**, **En riesgo**, **En proceso**,
  **Cumplidas**. `ComplianceStat` ahora incluye `futuras`.

### Correo Ecommerce: filtro-primero, entre campañas y HTML para Outlook
- `/campanas` deja de ser lista campaña-por-campaña: ahora es un **generador
  filtro-primero** que agrega líneas Ecommerce de **todas** las campañas según
  Cliente / Periodo / **rango de fechas** / Cadena / Anunciante / Artículo.
- **Correo en HTML** con tabla estilizada (estilos en línea) para pegar directo
  en **Outlook** (`buildEmailHtml`, copia `text/html` + `text/plain`), además del
  **texto plano** tabulado. Vista previa visual del correo.
- Nuevo `fetchActiveCampaignLines` (todas las campañas). Doc:
  [`docs/correo-ecommerce.md`](docs/correo-ecommerce.md).

## 2026-07-12

### Correo de especificaciones Ecommerce (Detalle de campaña)
- La pantalla **Detalle de campaña** (`/campanas/:id`) para operativa **Ecommerce**
  ahora genera un **correo técnico listo para copiar** que pide materiales
  creativos al cliente.
- Solo aplica a líneas **Ecommerce**; si la campaña no tiene, se muestra un estado
  vacío claro y no se rompen otras operativas.
- **Catálogo fijo de medidas de artes** (`src/pages/campaigns/ecommerceMeasures.ts`)
  con normalización tolerante de artículos (mayúsculas, sin acentos, niveles
  N1/N2/N3, signos). Las medidas NO dependen de `campaign_line_requirements`.
- El correo agrupa por creatividad, une periodos (p. ej. `S29, S30`), toma la
  mínima fijación y máxima retirada, y calcula la **fecha límite de materiales**
  (2 días antes de la primera fijación).
- Tabla con columnas exactas incluida **"Creatividad descripción"**; se copia con
  tabulaciones (`\t`). Input de destinatario y **copiar al portapapeles** con
  feedback.
- Helpers en `src/pages/campaigns/ecommerceEmail.ts`; pruebas en
  `src/tests/ecommerce-email.test.ts`.

### Dashboard de cumplimiento operativo
- El dashboard principal (`/`) pasó de conteos a **estatus real de cumplimiento
  (SLA)**: une cada línea activa con su operación (`campaign_operations`) para
  medir el avance real de checks.
- **Cumplida** = todos los checks obligatorios completos (DIGITAL SIGNAGE solo
  exige Artes; el resto los 7). **En riesgo** = periodo vencido e incompleta;
  **en proceso**, **futura**; **a tiempo** = completada antes del fin de periodo.
- KPIs: % cumplimiento, % a tiempo, en riesgo, avance promedio, cumplidas, en
  proceso, clientes, periodos. Gráficos (Recharts): cumplimiento por cliente y
  por periodo, semáforo, cuellos de botella por check; tabla de detalle por
  cliente·periodo·tipo. Filtro nuevo de **Cumplimiento**.
- Doc: [`docs/dashboard-operativo.md`](docs/dashboard-operativo.md).

### Seguimiento operativo
- El control "Marcar todos los checks del periodo vencido" pasó de ser **global**
  a un botón **por línea** ("Marcar todos") en la columna Avance, solo en líneas
  con periodo vencido y checks pendientes.
- Identidad operativa **separada por periodo** (S28 y S29 no se fusionan) y rango
  operativo (`periodo_inicio → periodo_fin`) en la tabla.
- Doc: [`docs/operations-period-tracking.md`](docs/operations-period-tracking.md).

### Despliegue
- GitHub Pages vía Actions (`deploy-pages.yml`) desde `main`. Verificaciones en
  cada cambio: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
