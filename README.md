# eComFlow Next — DB First

Herramienta interna **database-first** para gestionar la operación de campañas de
retail media / eCommerce. **Cloud Firestore es la única fuente de verdad**: todas
las vistas consultan exclusivamente Firestore. Los archivos Excel/CSV son solo un
medio de entrada; una vez procesados, ninguna vista vuelve a leer el archivo. Los
datos se conservan (bajas lógicas) salvo la herramienta de reinicio de pruebas.

Es una **SPA** (React + Vite + TypeScript) que corre en el navegador. **No hay
servidor propio, ni Firebase Admin SDK, ni Service Accounts, ni Cloud Functions.**
Toda escritura se realiza con el **Firebase Web SDK** desde el navegador,
protegida por Firestore Security Rules.

- **App publicada:** https://digitalappsism.github.io/eComFlow/
- **Repositorio:** `DigitalappsiSM/eComFlow`
- **Proyecto Firebase:** `ecomflowv3`

---

## Estado actual (resumen)

Todos los módulos del menú están implementados: **Dashboard, Seguimiento
operativo, Nueva carga, Cambios detectados, Historial de cargas, Detalle de
campaña, Catálogo de artículos, Configuración, Administración de usuarios**, más
una herramienta **oculta** de reinicio de datos de prueba.

Además del alcance de la especificación, se adaptó a los **datos reales**:

- **Importador con detección de plantilla**: reconoce la plantilla del ejemplo de
  la especificación (§11) o el **export real "Ekon"** (39 columnas).
- **Plantilla Ekon**: mapea columnas reales, agrupa las filas de "material" de una
  misma creatividad en una sola línea, y captura el **Periodo** (semana/catorcena).
- **Tipos de operación** por artículo (GRÁFICA, ECOMMERCE, DIGITAL SIGNAGE,
  TOMATURNOS, extensibles) con **gate de clasificación**: si aparece un artículo
  nuevo, la app pide clasificarlo antes de procesar.
- **Solo digital**: al importar se **excluye GRÁFICA**; solo se guardan tipos
  digitales (ECOMMERCE, DIGITAL SIGNAGE, TOMATURNOS).
- **Filtros dinámicos** (Periodo, Cadena, Tipo, Cliente, Estado + búsqueda) en
  Dashboard y Seguimiento operativo.
- **Reinicio de datos de prueba** oculto y protegido por interruptor.

Pruebas: **72** unitarias en verde. Lint, TypeScript y build de producción limpios.

---

## Requisitos

- Node.js ≥ 20 y npm (solo para desarrollo local; el uso final es por navegador).
- Un proyecto de Firebase con **Authentication (correo/contraseña)** y **Cloud
  Firestore**.
- (Opcional) Firebase CLI para desplegar reglas/índices o correr emuladores.

## Ejecución local (opcional)

```bash
npm install
cp .env.example .env   # completa la config Web de Firebase
npm run dev            # http://localhost:5173
```

## Scripts

```bash
npm run dev         # servidor de desarrollo Vite
npm run build       # tsc -b && vite build
npm run lint        # ESLint (0 warnings)
npm run typecheck   # TypeScript estricto (tsc -b)
npm run test        # Vitest (unitarias)
npm run test:e2e    # Playwright (flujo crítico)
```

---

## Despliegue (GitHub Pages + Firebase en la nube)

La app se publica automáticamente en **GitHub Pages** vía GitHub Actions:

- Workflow: `.github/workflows/deploy-pages.yml` (build de Vite con base
  `/eComFlow/`, fallback SPA `404.html`, y `configure-pages` con `enablement`).
- **Fuente de Pages:** *Settings → Pages → Source = GitHub Actions*.
- La config **pública** de Firebase (claves de cliente) está incrustada en el
  workflow. Son claves públicas por diseño; la seguridad la dan las reglas.
- Cada push a `main` re-despliega. URL: `https://digitalappsism.github.io/eComFlow/`.

### Configuración de Firebase (Consola)

1. **Authentication** → habilitar *Correo/contraseña*.
2. **Firestore** → crear la base de datos (modo producción).
3. Publicar `firestore.rules` (ver más abajo) y crear índices (ver §Índices).

### Primer usuario (§27)

La app **no crea usuarios**. Créalos en la Consola:

1. **Authentication → Users → Agregar usuario** (correo + contraseña). Copia el `UID`.
2. En **Firestore** crea `users/{UID}` con:

```jsonc
{
  "user_id": "<UID>",
  "name": "Nombre",
  "email": "correo@dominio.com",
  "role": "admin",     // admin | manager | operator | viewer
  "active": true       // ¡BOOLEAN, no string!
}
```

3. **Authentication → Settings → Authorized domains** → agrega
   `digitalappsism.github.io`.

> El `UID` del documento debe coincidir EXACTAMENTE con el de Authentication, y
> `active` debe ser **boolean** `true`. Si es texto `"true"`, la app te deja
> entrar (JS lo ve como verdadero) pero las reglas deniegan las lecturas.

---

## Modelo de datos e identidad

Jerarquía: **Cliente → Campaña → Espacio → Línea → (piezas)**.

- **Campaña** = Cliente + Número de campaña.
- **Espacio** = grupo + placement + fecha de fijación + creatividad (título/desc).
- **Línea** = una Creatividad ID dentro de un espacio.

Las claves son deterministas (hash de una forma canónica), lo que hace las
escrituras **idempotentes** (reimportar no duplica). Los identificadores se
guardan como **texto** (conservan ceros a la izquierda). La normalización técnica
solo recorta/colapsa espacios, normaliza Unicode y compara sin distinguir
mayúsculas; nunca corrige ortografía ni relaciona nombres parecidos.

### Plantilla Ekon (archivo operativo real)

El export real trae 39 columnas. Mapeo (`src/schemas/ekon.schema.ts`):

| Concepto | Columna Ekon |
|---|---|
| Cliente (agrupación) | `Cliente` (empresa anunciante) |
| Número de campaña | `Campaña` |
| Placement / espacio | **`Cadena` + `Artículo`** (p. ej. `CHEDRAUI / ALARM-MEDIA`) |
| Anunciante | `Anunciante` |
| Fechas | `Fecha Fijación`, `Fecha Retirada` (ISO o DD/MM/YYYY) |
| Creatividad | `Creatividad Id`, `Creativitad Título` (opcional), `Creatividad Desc.` (opcional) |
| Piezas/soportes | `Nº Soportes` |
| Periodo | `Periodo` (`C16 - 28/07/2026 a 10/08/2026`) |

- La **línea operativa** se identifica por **Creatividad Id**; las múltiples filas
  de *material* de una misma creatividad se **agrupan** en una sola línea (no se
  rechazan como duplicados).
- El **Periodo** se parsea a código (`C16`/`S29`), tipo (**catorcena**/**semana**)
  y fechas de inicio/fin, y se guarda en cada línea.
- La **identidad operativa se separa por periodo**: una misma campaña/creatividad
  con la misma Fecha de Fijación en `S28` y `S29` se mantiene como **líneas
  distintas** (no se fusionan). Ver
  [`docs/operations-period-tracking.md`](docs/operations-period-tracking.md).
- En Seguimiento operativo, **cada línea** con periodo vencido y checks
  pendientes tiene su propio botón **"Marcar todos"** (por línea, no global) que
  completa todos sus checks obligatorios de una vez.

---

## Tipos de operación y "solo digital"

- Catálogo base Artículo→tipo en `src/domain/articulo-tipos.ts` (40 artículos
  conocidos). Las clasificaciones adicionales se guardan en
  `app_settings.articulo_tipos` (tienen prioridad).
- Tipos: **GRÁFICA, ECOMMERCE, DIGITAL SIGNAGE, TOMATURNOS** (extensibles).
- **Gate de clasificación**: si el archivo trae un artículo no catalogado, la
  importación se detiene y pide clasificarlo antes de continuar (se guarda para
  futuras cargas).
- **Exclusión de gráfica**: al importar solo se guardan tipos **digitales**
  (ECOMMERCE, DIGITAL SIGNAGE, TOMATURNOS). Las líneas GRÁFICA se marcan como
  *excluidas* en la vista previa y **no se escriben**.

---

## Filtros dinámicos

Barra reutilizable (`src/components/filters/`) con opciones derivadas de los datos:

- **Periodo** (semana/catorcena, orden cronológico), **Cadena**, **Tipo de
  operación**, **Cliente**, **Estado**, y **búsqueda** combinable.
- Chips de filtros activos removibles + "Limpiar" + contador de resultados.
- Aplicados hoy en **Dashboard** (recalcula KPIs/desgloses) y **Seguimiento
  operativo** (filtra las líneas cargadas). El Dashboard usa el filtro de Periodo
  como control temporal (no la semana de calendario).

---

## Importación (flujo)

Todo ocurre en el navegador; el archivo nunca se sube a Storage:

```text
Seleccionar → leer en memoria (hash) → validar estructura → validar filas →
clasificar artículos (gate) → construir identidad → agrupar material →
excluir no digital → comparar con Firestore → vista previa → confirmar →
escribir por lotes → actualizar dashboard
```

- Escritura por lotes con `writeBatch` + `serverTimestamp`, IDs deterministas
  (idempotencia), **deduplicación** de grupos/espacios y bloqueo por `file_hash`.
- Reporte de errores descargable en CSV.
- Historial de cargas en `/historial`.

---

## Seguridad (Firestore Rules)

`firestore.rules`:

- Autenticación obligatoria; autorización por rol (`users/{uid}` activo).
- Sin borrados físicos en producción; toda baja es lógica (`active: false`).
- `created_at`/`created_by` inmutables; `updated_by`/`created_by` deben coincidir
  con el usuario; nadie cambia su propio rol; default deny para colecciones no
  declaradas.
- **Interruptor de reinicio de pruebas** (`canResetData()`): permite `delete` en
  colecciones operativas **solo** si eres admin **y** `app_settings.dev_reset_enabled == true`.
  Por defecto está apagado → borrado bloqueado.

Publicar reglas: `firebase deploy --only firestore:rules` o pegarlas en
*Firestore → Reglas → Publicar*.

## Reinicio de datos de prueba (oculto)

Ruta **oculta** (fuera del menú), solo admin: **`/reiniciar-datos`**.

1. Publica las reglas actualizadas (una vez).
2. En `/reiniciar-datos`, **Paso 1**: enciende el interruptor "Habilitar borrado".
3. **Paso 2**: escribe `BORRAR TODO` y confirma → borra por lotes las colecciones
   operativas (no toca `users`, `app_settings` ni `placements`).
4. **Apaga el interruptor** al terminar.

---

## Índices de Firestore

`firestore.indexes.json` incluye los índices compuestos usados (líneas por
active/is_current/fecha, comentarios por línea, historial por línea, etc.).
Despliégalos de una vez con `firebase deploy --only firestore:indexes`, o crea
cada uno con el enlace de "crear índice" que aparece la primera vez que una vista
lo necesita.

---

## Estructura del proyecto

```text
src/
  app/            App.tsx, router.tsx (incluye ruta oculta /reiniciar-datos)
  pages/          auth, dashboard, operations, imports, changes, campaigns,
                  placements, settings, users, admin (ResetDataPage)
  components/     layout, dashboard, operations, feedback, filters
  features/       auth, dashboard, operations, imports
  hooks/          useAuth, usePermissions, useConnectivity
  lib/            firebase, env, hashing, dates, excel, file-reader, connectivity,
                  error-report, collections
  domain/         normalization, identity, campaign-status, dashboard-metrics,
                  progress, import-classification, import-pipeline, ekon-pipeline,
                  placement-index, articulo-tipos
  repositories/   campaign-lines, campaigns, operations, imports, placements,
                  users, history, settings, detected-changes,
                  import-processing, maintenance
  schemas/        import.schema, ekon.schema
  types/          campaign, import, placement, user, operations, audit
  tests/          suites Vitest
firestore.rules  firestore.indexes.json  firebase.json  .env.example
.github/workflows/deploy-pages.yml
docs/             PRUEBA-EMULATOR.md, ejemplo-importacion.csv, mockup.html
```

## Emulator Suite (opcional, para probar reglas localmente)

Ver **[`docs/PRUEBA-EMULATOR.md`](docs/PRUEBA-EMULATOR.md)** — guía paso a paso con
CSV de ejemplo y datos de catálogo. Datos de demostración:

```bash
SEED_CONFIRM=yes ADMIN_EMAIL=admin@demo.mx ADMIN_PASSWORD=secret123 npm run seed:dev
```

---

## Limitaciones conocidas

- **Piezas/soportes**: la etiqueta de "piezas" se retiró de los desgloses por no
  aportar; el dato `Nº Soportes` sigue guardado por línea.
- Filtros aplicados hoy en Dashboard y Seguimiento operativo; falta extenderlos a
  Detalle de campaña, Cambios detectados e Historial.
- El Seguimiento operativo carga hasta ~500 líneas y filtra en cliente; para
  volúmenes grandes se prevé paginación/consulta server-side.
- La reanudación fina desde el último lote confirmado queda pendiente (los IDs
  deterministas + bloqueo por `file_hash` evitan duplicar al reintentar).
- El reinicio de datos hace borrado físico; es una herramienta **solo para
  pruebas**, apagada por defecto.
- Persistencia de filtros en URL: pendiente.

## Seguridad y respaldo

- No se instala `firebase-admin`; no hay Service Accounts ni credenciales
  administrativas en el repositorio (las claves Web de Firebase son públicas).
- Programa **exportaciones periódicas** de Firestore (Consola → Importar/Exportar
  o `gcloud firestore export`) y conserva `firestore.rules` / `firestore.indexes.json`
  versionados.
