# Estado actual (snapshot 2026-07-13)

Respaldo documentado del estado de **eComFlow Next** a la fecha. Este documento
resume qué hay, dónde vive y cómo restaurarlo.

## Qué es

App interna **database-first** para operar campañas de retail media. Firestore es
la única fuente de verdad; Excel/CSV son solo entrada. Stack: React + Vite +
TypeScript (estricto), Tailwind, React Router, Firebase Web SDK (Auth +
Firestore), Zod, SheetJS, Recharts, Lucide, Vitest.

- **Producción:** https://digitalappsism.github.io/eComFlow/ (GitHub Pages vía
  Actions `.github/workflows/deploy-pages.yml`, se despliega al hacer push a `main`).
- **Proyecto Firebase:** `ecomflowv3` (config pública en el workflow).

## Módulos (rutas)

| Ruta | Pantalla | Permiso |
|------|----------|---------|
| `/` | Dashboard de **cumplimiento operativo** | dashboard |
| `/operacion` | Seguimiento operativo (checks por línea) | operations |
| `/nueva-carga` | Importación de Excel/CSV (plantilla Ekon) | imports |
| `/cambios` | Cambios detectados / sustituciones | changes |
| `/historial` | Historial de cargas | history |
| `/campanas` | **Correo de especificaciones Ecommerce** (filtro-primero) | campaigns |
| `/catalogo` | Catálogo de artículos (tipos de operación) | catalog |
| `/configuracion` | Configuración | settings |
| `/usuarios` | Administración de usuarios | users |
| `/reiniciar-datos` | Reinicio de datos de prueba (oculto, flag-gated) | users |

## Navegación

Sidebar **agrupada** (Operación / Cargas / Herramientas / Administración),
**colapsable** en escritorio (rail de iconos con tooltips, preferencia en
`localStorage`) y **drawer** con hamburguesa en móvil. Badge y campana con el
conteo real de cambios detectados pendientes.

## Dónde vive la lógica (dominio, puro y testeado)

- `src/domain/dashboard-metrics.ts` — métricas y **cumplimiento** (SLA) del dashboard.
- `src/domain/ekon-pipeline.ts` — importación plantilla Ekon (identidad por periodo).
- `src/domain/operation-rules.ts` — checks obligatorios por tipo de operación.
- `src/domain/progress.ts` — cálculo de avance de checks.
- `src/domain/articulo-tipos.ts` — clasificación Artículo → tipo (solo digital).
- `src/pages/campaigns/ecommerceEmail.ts` + `ecommerceMeasures.ts` — correo Ecommerce.
- Repositorios en `src/repositories/*` (solo Firestore).

## Documentación

- [`README.md`](../README.md) — visión general y puesta en marcha.
- [`CHANGELOG.md`](../CHANGELOG.md) — registro de cambios.
- [`docs/dashboard-operativo.md`](dashboard-operativo.md) — dashboard de cumplimiento.
- [`docs/correo-ecommerce.md`](correo-ecommerce.md) — generador de correo Ecommerce.
- [`docs/operations-period-tracking.md`](operations-period-tracking.md) — identidad por periodo.

## Estado de calidad

- **117 pruebas** unitarias en verde (Vitest).
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` limpios (el
  build solo emite el warning no bloqueante de tamaño de chunk de Vite).

## Cómo restaurar este respaldo

Este estado quedó fijado en la rama de respaldo **`backup-2026-07-13`**. Para
descargar u obtener el código exacto:

- **ZIP del código:** `https://github.com/DigitalappsiSM/eComFlow/archive/refs/heads/backup-2026-07-13.zip`
- **Restaurar a este punto localmente:**
  ```bash
  git fetch origin backup-2026-07-13
  git checkout backup-2026-07-13            # inspeccionar el snapshot
  # o crear una rama de trabajo desde el respaldo:
  git checkout -b restore-2026-07-13 origin/backup-2026-07-13
  ```
- **Datos (Firestore):** el código no respalda los datos. Para respaldar datos,
  exportar la base desde Firebase Console (Firestore → Export) o `gcloud
  firestore export`.
