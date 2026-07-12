# Dashboard Operativo 360

El dashboard principal (`/`) da una visión 360 de la operación de retail media a
partir de las líneas operativas de Firestore. **Todas las métricas se calculan en
el cliente** sobre proyecciones `MetricLine` (funciones puras en
`src/domain/dashboard-metrics.ts`); no hay agregaciones en servidor y no se lee
ningún Excel.

## Flujo de datos

1. `useDashboardData` → `fetchActiveLinesForDashboard` carga de Firestore las
   líneas con `active == true` y `is_current == true` (límite por defecto 2000).
2. `toMetricLine` proyecta cada `CampaignLine` a `MetricLine` (incluye
   `periodoFin`, `tipoCampanaPeriodo`, `cancelled`).
3. `DashboardPage` aplica los filtros en memoria y calcula todas las métricas con
   funciones puras, sin re-consultar Firestore.

## KPIs

| KPI | Qué mide |
|-----|----------|
| **Clientes activos** | Clientes distintos con al menos una línea vigente que cruza el periodo. |
| **Campañas activas** | Campañas distintas (Cliente + Nº de campaña) activas. |
| **Líneas operativas** | Líneas activas (una Creatividad ID en un espacio). |
| **Piezas requeridas** | Suma de soportes/requisitos obligatorios de las líneas activas. |
| **Tipos activos** | Nº de tipos de operación distintos presentes. |
| **Periodos activos** | Nº de periodos (semana/catorcena) distintos presentes. |
| **Líneas vencidas** | Líneas cuyo periodo operativo ya terminó (pendientes de cierre). |
| **En curso** | Líneas cuyo periodo operativo incluye hoy. |

### ¿Qué es un "cliente activo"?

Un cliente con **al menos una línea activa y vigente** cuya ventana operativa
cruza el periodo seleccionado (regla de cruce §37:
`fecha_fijacion <= fin` y `fecha_retirada >= inicio`). Con el filtro amplio por
defecto, equivale a los clientes con líneas activas cargadas.

## Vencido / En curso / Futuro

El estado operativo se calcula por línea contra **hoy** usando el **periodo
operativo** (que vence antes que la campaña global):

- `inicio = periodo_inicio ?? fecha_fijacion`
- `fin = periodo_fin ?? fecha_retirada`

Clasificación (`operationalStatusOf`):

- **Vencido**: `fin < hoy`.
- **Futuro**: `inicio > hoy`.
- **En curso**: hoy cae dentro de `[inicio, fin]`.

`computeOperationalStatusBreakdown` cuenta estas tres categorías y **excluye las
líneas canceladas** (`cancelled == true`).

## Agrupación por mes

`computeMonthlyOperationTrend` agrupa las líneas por el **mes de su inicio
operativo** (`(periodo_inicio ?? fecha_fijacion)` recortado a `YYYY-MM`) y ordena
cronológicamente. Se pinta como área de evolución mensual.

## Gráficos (Recharts)

- **Principales clientes** — barras horizontales, top 8 por líneas.
- **Tipos de operación** — dona con la distribución de líneas.
- **Operación por mes** — área de evolución mensual.
- **Estado operativo** — dona Vencido / En curso / Futuro.
- **Carga por periodo** — barras por semana/catorcena (orden cronológico).
- **Clientes por tipo de operación** — barras apiladas (top 8 clientes).
- **Carga por cadena** — barras horizontales (top 10 cadenas).
- **Atención requerida** — tabla de líneas vencidas por Cliente · Periodo · Tipo
  con líneas vencidas, piezas y estado.

## Filtros

Se derivan dinámicamente de los datos cargados y se aplican en memoria:

- **Periodo** (semana/catorcena, orden cronológico)
- **Mes** (`YYYY-MM`)
- **Cadena**
- **Tipo** de operación
- **Cliente**
- **Estado** operativo (Vencido / En curso / Futuro)
- **Continuidad** (Fijación / Continua)

El botón **Limpiar** restablece todos los filtros. El contador muestra
"X de Y líneas".

## Validación en producción

1. Abrir **https://digitalappsism.github.io/eComFlow/** (dashboard es la ruta `/`).
2. Recargar fuerte con **Ctrl + Shift + R**.
3. Verificar los **8 KPIs** y que los **gráficos** se pintan con datos.
4. Probar los filtros (Periodo, Mes, Cadena, Tipo, Cliente, Estado, Continuidad)
   y confirmar que KPIs, gráficos y la tabla de **Atención requerida** reaccionan.
5. Confirmar que **Líneas vencidas** coincide con la sección Vencido de la dona
   de estado, y que la tabla lista los clientes/periodos con líneas vencidas.
6. Comprobar el comportamiento **responsive** (móvil: KPIs en 2 columnas, gráficos
   apilados) y los **estados vacíos** cuando un filtro no devuelve líneas.
