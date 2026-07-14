# Resultados Ecommerce (Kevel)

Módulo **independiente** (dominio aislado del operativo, §3) para procesar
reportes CSV de **Kevel**, consolidarlos por **periodo ecommerce semanal
(viernes→jueves)** y analizarlos en un dashboard. Firestore es la única fuente
de verdad; el CSV se lee/valida **en el navegador** (Web Worker) y solo se
guardan datos procesados, agregados, incidencias y auditoría.

## Rutas

| Ruta | Pantalla |
|------|----------|
| `/resultados/dashboard` | Dashboard de resultados |
| `/resultados/nueva-carga` | Importar CSV Kevel |
| `/resultados/historial` | Historial de importaciones |
| `/resultados/validaciones` | Incidencias por importación |
| `/resultados/periodos` | Catálogo de periodos (sembrado) |

## Aislamiento (§3)

- Código en `src/{domain,repositories,features,pages}/results/` + `components/results/`.
- Colecciones exclusivas `results_*` (escritura) + lectura de `ecommerce_periods`
  / `placements` / `users`. Nunca escribe colecciones operativas.
- Permisos `results.*` independientes (KAM = operator). Auditoría en
  `results_change_history` / `results_adjustment_history`.
- Reglas de Firestore separadas: `results_daily` inmutable, issues/auditoría
  append-only, sin borrados (salvo reset flag-gated).

## Importación y validación (§5–§11)

- **Contrato exacto**: fila 1 metadatos (`Start Date` / `End Date`), filas 2-3
  vacías, fila 4 con las **42 columnas** en orden; cada fila con 42 valores.
- **Fechas**: acepta ISO y `DD/MM/YYYY` (desambigua día/mes; contexto MX) con o
  sin hora. El rango declarado que no coincide con el real es **aviso** (se usa
  el rango real de la columna `Date`).
- **Bloqueantes**: archivo ya procesado (`file_hash` SHA-256), traslape de
  rangos, IDs obligatorios faltantes, métricas imposibles, `Unfiltered <
  filtradas`, CTR recalculado fuera de tolerancia, nombres materialmente
  distintos por ID.
- **No bloqueantes** (avisos): clics con cero impresiones, `Date` fuera del
  Flight, clics sospechosos, dispositivo desconocido, campaña sin número, etc.
- **Claves repetidas** dentro del archivo → se **agrupan** sumando (no bloquea).
- **Fuera de catálogo**: fechas sin periodo se conservan pero **no se
  consolidan** (aviso), como la hoja "Fuera catalogo" del reporte real.
- **Consolidación semanal**: agrupa por periodo + dimensiones, **suma** métricas
  absolutas, **recalcula** CTR (nunca promedia), reconcilia daily↔weekly. El
  dashboard consulta `results_weekly`.

## Reglas de negocio validadas contra el reporte real

- **Espacio / Artículo = columna `Flight`** (p. ej. `CATEGORY BANNER <N1
  JUGUETES>`). Se separa en **artículo** (antes de `<>`) y **categoría** (dentro).
- **Cliente = Advertiser** (mientras no haya mapping).
- **Clics = Unique Clicks** (base del reporte); **CTR = Σ clics / Σ impresiones**.
- **Mes/trimestre** por el **inicio (viernes)** del periodo.
- **Device** de la columna `Ad` (APP/MOBILE/DESKTOP), con respaldo AdType/Site.

## Impresiones estimadas (§14, mejora solicitada)

Cuando una línea tiene clics y **cero impresiones reales** (Soriana no siempre
las envía), se estima:

```
CTR_ref = Σ(unique_clicks) / Σ(impressions) de CATEGORY BANNER del periodo
impresiones_estimadas = round(unique_clicks / CTR_ref)
```

La impresión **real de Kevel se conserva en 0**; el estimado vive en un campo
**separado y marcado** (`impressions_estimated`). El dashboard ofrece el toggle
**Real Kevel** vs **Efectiva (con estimadas)** — las dos verdades, siempre
distinguibles.

## Dashboard (§15)

- KPIs: Impresiones, Clics (únicos), CTR, Clientes, Campañas, Artículos,
  Categorías, Periodos.
- **Evolución por periodo** (impresiones en área + clics en línea) con el
  **pico de clics marcado**.
- **Categorías más visitadas**, **clientes**, **campañas** y **artículos** por
  clics; **distribución por dispositivo**.
- Tabla consolidada Mes · Semana · Cliente · Campaña · Artículo · Categoría ·
  Device · Impresiones · Clics · CTR (paginada).
- **Filtros dinámicos** (como el dashboard operativo): Periodo, Mes, Cliente,
  Campaña, Artículo, Categoría, Dispositivo, Site + búsqueda; actualizan KPIs,
  gráficas y tabla.

## Validación de la lógica (contra el reporte digerido del cliente)

Sobre el mismo CSV, la digestión reproduce el **CTR general 0.19%** idéntico; los
totales difieren solo por la versión del archivo. Reglas confirmadas con la hoja
"Control": agrupar por Semana + Periodo + Cliente + Campaña + Artículo, sumar
Impressions y Unique Clicks, CTR recalculado.

## Pendiente (fases siguientes)

- Vinculación opcional con eComFlow y mapeos (§13) — Fase 3.
- Ajustes comerciales semanales con distribución proporcional y aprobación
  (§16–§25) — Fase 4.
