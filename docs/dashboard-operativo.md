# Dashboard de Avance Operativo Ecommerce

El dashboard principal (`/`) mide el **avance real de preparación y cierre por
creatividad** de la operación **Ecommerce**, organizado en **semanas de viernes
a jueves**. Cada creatividad reacciona a **cada check** (no sólo al completar los
siete) y las fechas límite se comparan en `America/Mexico_City`.

La lógica de negocio vive en una capa de dominio **pura y testable**
(`src/domain/ecommerce-dashboard/`), separada de la lectura de Firestore
(`src/repositories/ecommerce-dashboard.repository.ts`) y de la presentación
React (`src/pages/dashboard/DashboardPage.tsx`,
`src/components/dashboard/EcommerceDashboardCharts.tsx`).

## Alcance

Sólo se consideran líneas con:

```text
tipo_operacion == "ECOMMERCE"
active == true
is_current == true
cancelled != true
```

La **unidad de medición es la creatividad**, no la campaña ni el periodo diario.
Todos los checks aplicables pesan igual.

## Flujo de datos

1. `useEcommerceDashboard` → `fetchEcommerceDashboardLines` consulta **sólo
   Ecommerce** y **pagina hasta recuperar todas las líneas** (sin el antiguo tope
   de 1,500). Une cada línea con su `campaign_operations` en lotes de 10.
2. Las líneas se proyectan a `RawDashboardLine` (timestamps ya como epoch ms) y se
   **consolidan** en `DashboardCreative` (`consolidateCreatives`).
3. `DashboardPage` filtra por la semana seleccionada y calcula KPIs, gráficas y
   drill-down con funciones puras.

La recarga ocurre: al **entrar** al dashboard, al **volver** desde Seguimiento
operativo (la página se re-monta) y con el botón **«Actualizar»**. Se muestra la
**fecha/hora de la última actualización**. No hay listeners de tiempo real.

## Ventanas semanales (viernes→jueves)

Se muestran siempre cuatro tarjetas (`computeFourWeeks`), con la **actual
seleccionada** por defecto. Ejemplo con hoy = 11 ago 2026:

| Tarjeta | Rango |
|---------|-------|
| Semana anterior | 31 jul – 6 ago |
| Semana actual | 7 – 13 ago |
| Próxima semana | 14 – 20 ago |
| Segunda semana | 21 – 27 ago |

Al pulsar una tarjeta, todos los KPIs, gráficas y tablas se recalculan. El
**rango personalizado** existe como opción avanzada (no como control principal).

## Etapas y checks (§4)

| Etapa | Checks |
|-------|--------|
| **Preparación** | `correo_enviado`, `artes`, `validacion`, `link`, `kevel` (**Ad server**) |
| **Cierre operativo** | `testigos_app`, `testigos_web` |

```text
preparationProgress = prep completados / prep aplicables
closingProgress     = testigos completados / testigos aplicables
totalProgress       = todos completados / todos aplicables
```

**No se penalizan checks que no aplican**: el denominador se ajusta automáticamente
(p. ej. `SPONSORED PRODUCT` de La Comer no requiere `artes`, resuelto vía el
adaptador de retailer, no por condiciones dispersas `cadena === "LA COMER"`).

## Fechas límite (SLA, §5)

Comparación de timestamps en `America/Mexico_City`.

- **Ecommerce general** (semana viernes→jueves):
  - Preparación a tiempo si todo se completó hasta el **viernes de activación**,
    inclusive.
  - Testigos a tiempo si ambos se completaron hasta el **lunes inmediato
    posterior** a ese viernes, inclusive.
- **La Comer** (inicia cualquier día):
  - Preparación hasta la **primera fecha real de activación**, inclusive.
  - Testigos hasta el **primer lunes posterior** a esa primera activación,
    inclusive.

## Estados operativos (§7)

`operationalStatusOf` clasifica cada creatividad en: **Sin iniciar**, **En
preparación**, **Lista para activación**, **Lista con retraso**, **En ventana de
testigos**, **Testigos vencidos**, **Cerrada a tiempo**, **Cerrada con retraso**.
Una creatividad **futura con preparación completa** aparece como **Lista para
activación** (no simplemente «Futura»).

## KPIs de la semana seleccionada (§8)

| KPI | Qué mide |
|-----|----------|
| **Preparación prom.** | Promedio de `preparationProgress`. |
| **Listas p/ activación** | Creatividades con preparación completa aún sin activar. |
| **Preparación pend.** | Creatividades con preparación incompleta. |
| **Checks compl./oblig.** | Checks completados sobre checks obligatorios aplicables. |
| **Cierre operativo prom.** | Promedio de `closingProgress`. |
| **Cerradas** | Creatividades con testigos completos. |
| **Preparación a tiempo** | De las que ya vencieron, las completadas en plazo. `No aplica` si aún no vence ninguna. |
| **Cierre a tiempo** | Ídem para testigos. |
| **Fuera de SLA** | Vencidas sin completar o cerradas con retraso. |
| **Clientes** | Clientes distintos. |
| **Creatividades** | Total en la semana. |

Reglas de presentación:

- Si **no venció** ninguna fecha límite, se muestra **`No aplica`** en vez de `0%`.
- Porcentajes con **un decimal** cuando el redondeo entero oculte cambios.
- Los KPIs reaccionan a **cada check**, no sólo al completar los siete.

## Gráficas (Recharts, tema oscuro)

- **Comparativo de cuatro semanas** — tarjetas con preparación, listas,
  pendientes, cierre, fuera de SLA y **variación** contra la semana anterior.
- **Avance por check** — completados vs pendientes (Correo, Artes, Validación,
  Link, Ad server, Testigos App, Testigos Web).
- **Preparación por cliente** — % promedio, **mayor pendiente primero**.
- **Matriz cliente × check** — % completado de cada check por cliente.
- **Distribución por estado** — creatividades por estado operativo.
- **Evolución histórica** — avance diario desde el lunes previo a la activación,
  preparación hasta la activación y testigos hasta el lunes límite, con
  comparación contra la semana anterior. Usa los timestamps reales de los checks;
  si no hay historial suficiente, muestra una advertencia discreta.

## Tratamiento especial de La Comer (§6)

La Comer carga **periodos diarios** que son **fechas de activación**, no líneas
independientes. `consolidateCreatives` normaliza **en memoria** (nunca escribe
Firestore) agrupando por:

```text
cliente/campaña + artículo/placement + Creatividad ID
```

Reglas aplicadas:

- `CARRUSEL HOME` y `SPONSORED PRODUCT` → **dos** creatividades.
- 20 periodos diarios del mismo artículo e ID → **una** creatividad.
- Cambio de **Creatividad ID** → **otra** línea.
- Título, descripción, periodo diario y fechas de fijación/retirada **no**
  separan la identidad.
- Fechas consolidadas en `activationDates`, respetando **huecos reales** (no se
  inventan días intermedios). Cuando falta `activation_dates`, se derivan de
  `periodo_original`, `periodo_inicio` y `periodo_fin`.
- Una creatividad cuenta **como máximo una vez por semana**; si participa en
  varias, se muestra **continua** sin reiniciar checks.

**Consolidación de checks históricos**: por cada check gana el valor de la
actualización **más reciente** (`checks.<key>.updated_at`; si falta, el
`updated_at` de la operación). Se conserva `legacyLineIds` para historial y
drill-down. No se modifica ni desactiva ninguna línea.

## Drill-down (§11)

Las gráficas y KPIs accionables abren Seguimiento operativo con filtros
precargados por URL, p. ej.:

```text
/operacion?tipo=ECOMMERCE&weekStart=2026-08-14&weekEnd=2026-08-20&cliente=MABE&pendingCheck=artes&status=en_preparacion
```

`OperationsPage`/`useOperations` leen `URLSearchParams` (`parseDrilldownParams`),
aplican semana, cliente, estado y check pendiente, muestran **chips** de los
filtros recibidos y permiten **limpiarlos**. Sin parámetros, el comportamiento es
el de siempre. Para agrupaciones históricas de La Comer, el drill-down evalúa las
líneas fuente individuales; no modifica checks de forma masiva.

## Rendimiento (§10)

- Sin límite arbitrario: `fetchAllPages` recorre todas las páginas Ecommerce.
- Join con `campaign_operations` en lotes seguros de 10.
- Índice compuesto requerido (en `firestore.indexes.json`):
  `campaign_lines (tipo_operacion ASC, active ASC, is_current ASC, fecha_fijacion ASC)`.
- Sin listeners de tiempo real; recarga bajo demanda.

## Pruebas

`src/tests/ecommerce-dashboard.test.ts` cubre los 20 escenarios obligatorios
(§13): ventanas semanales, fechas límite a tiempo/con retraso, «No aplica» en
periodos futuros, reacción por check, Sponsored Product sin Artes, consolidación
de La Comer (20 diarios → 1, Carrusel + Sponsored → 2, nueva Creatividad ID,
huecos, sin `activation_dates`, timestamp más reciente, continuidad multi-semana),
inicio en día distinto al viernes, drill-down por URL, paginación sin truncamiento
y métricas vacías.
