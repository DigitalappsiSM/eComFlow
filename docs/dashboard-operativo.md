# Dashboard de cumplimiento operativo

El dashboard principal (`/`) muestra el **estatus real de operación** por cliente
y por periodo: qué está **cumplido**, qué está **en riesgo** (venció sin
completarse), qué está **en proceso** y dónde están los **cuellos de botella**.

A diferencia de un panel de conteos, aquí el estado se basa en el **avance real
de los checks** (correo, artes, validación, link, kevel, testigos), no solo en
fechas. **Todas las métricas se calculan en el cliente** con funciones puras
(`src/domain/dashboard-metrics.ts`); no hay agregaciones en servidor ni se lee
ningún Excel.

## Flujo de datos

1. `useDashboardData` → `fetchOperationalLinesForDashboard` carga de Firestore
   las líneas `active == true` y `is_current == true` (tope 1500) y **une cada
   línea con su operación** (`campaign_operations`, por `campaign_line_id`, en
   lotes de 10 en paralelo).
2. Cada línea se proyecta a `MetricLine` con su **avance real**: `progress`,
   `complete`, `pendingChecks`, `completedAtIso` (fecha en que quedó completa) y
   `responsable`.
3. `DashboardPage` aplica los filtros en memoria y calcula el cumplimiento.

## Checks obligatorios por tipo

El conjunto de checks obligatorios depende del tipo de operación
(`src/domain/operation-rules.ts`):

- **DIGITAL SIGNAGE**: solo **Artes**.
- **ECOMMERCE / TOMATURNOS / otros**: los **7** checks.

Una línea está **cumplida** cuando **todos sus checks obligatorios** están
completos.

## Estados de cumplimiento

`complianceStatusOf(line, hoy)` combina completitud y periodo operativo
(`periodo_inicio/fin`, con reserva a las fechas de campaña):

| Estado | Regla |
|--------|-------|
| **Cumplida** | Todos los checks obligatorios completos. |
| **En riesgo** | Periodo **vencido** y la línea **incompleta** (SLA incumplido). |
| **En proceso** | Periodo **en curso** y la línea incompleta. |
| **Futura** | Periodo **futuro** y la línea incompleta. |

**A tiempo** (`completedOnTime`): la línea está cumplida y se completó a más
tardar al **fin de su periodo** (`completedAtIso <= periodo_fin`). Si no hay
fecha de completado, se asume a tiempo. Las líneas **canceladas** se excluyen de
todos los cálculos.

## KPIs

Se muestran métricas que **siempre tienen valor** (avance y conteos), no solo el
% de "todo completo" que en la práctica suele ser bajo.

| KPI | Qué mide |
|-----|----------|
| **Avance prom.** | Promedio del avance de checks (0–100 %; verde ≥90, ámbar ≥60, rojo <60). |
| **En riesgo** | Líneas vencidas aún incompletas (pendientes de cierre). |
| **En proceso** | Líneas en curso todavía incompletas. |
| **Cumplidas** | Nº de líneas con todos sus checks obligatorios completos. |
| **% A tiempo** | Líneas completadas a tiempo ÷ líneas cuyo periodo ya venció. |
| **Líneas** | Total de líneas en el filtro actual (excluye canceladas). |
| **Clientes** | Clientes distintos en el filtro actual. |
| **Periodos** | Periodos (semana/catorcena) distintos en el filtro actual. |

## Gráficos y tabla (Recharts)

Las gráficas usan **conteos por estado** y **avance**, que siempre se ven —a
diferencia de un "% cumplido" que sale vacío cuando casi nada está al 100 %.

- **Estado por cliente** — barras **apiladas** con las líneas por estado
  (Cumplidas / En proceso / En riesgo / Futuras), top 10, mayor riesgo primero.
- **Semáforo de cumplimiento** — dona Cumplidas / En proceso / En riesgo / Futuras.
- **Estado por periodo** — barras apiladas por semana/catorcena (cronológico).
- **Cuellos de botella** — barras del nº de líneas con cada check obligatorio
  pendiente (dónde se atora la operación).
- **Avance por cliente** — barras del **avance promedio (%)** por cliente, menor
  primero, coloreadas por umbral.
- **Detalle de cumplimiento** — tabla por Cliente · Periodo · Tipo con total,
  cumplidas, % de cumplimiento y líneas en riesgo (mayor riesgo primero).

## Filtros

Se derivan de los datos y se aplican en memoria: **Periodo, Mes, Cadena, Tipo,
Cliente, Cumplimiento** (Cumplida / En riesgo / En proceso / Futura), **Estado**
operativo (Vencido / En curso / Futuro) y **Continuidad** (Fijación / Continua).
El botón **Limpiar** restablece todo; el contador muestra "X de Y líneas".

## Validación en producción

1. Abrir **https://digitalappsism.github.io/eComFlow/** (dashboard es la ruta `/`).
2. Recargar fuerte con **Ctrl + Shift + R**.
3. Verificar que aparece **"Cumplimiento operativo"** y que los KPIs muestran
   porcentajes (no solo conteos).
4. Confirmar que **En riesgo** coincide con la sección roja del semáforo y con la
   suma de la columna **En riesgo** de la tabla.
5. Cruzar contra **Seguimiento operativo**: una línea con todos sus checks
   marcados debe contar como **Cumplida**; una con periodo vencido y checks
   pendientes debe salir **En riesgo**.
6. Probar los filtros (sobre todo **Cumplimiento**, **Cliente** y **Periodo**) y
   ver que KPIs, gráficos y tabla reaccionan.
7. Comprobar el comportamiento **responsive** y los **estados vacíos**.
