# eComFlow Next — DB First

Herramienta interna **database-first** para gestionar la operación de campañas
eCommerce. **Cloud Firestore es la única fuente de verdad**: el dashboard y el
seguimiento operativo consultan exclusivamente Firestore. Los archivos Excel/CSV
son solo un medio de entrada; una vez procesados, ninguna vista vuelve a leer el
archivo. Los datos históricos se conservan (toda baja es lógica).

La aplicación es una **SPA local** (React + Vite) que corre en el navegador del
usuario en `http://localhost:5173`. **No hay servidor propio, ni Firebase Admin
SDK, ni Service Accounts, ni Cloud Functions.** Toda escritura se realiza con el
**Firebase Web SDK** desde el navegador, protegida por Firestore Security Rules.

> Esta entrega corresponde al **alcance inicial (§58)** de la especificación:
> base técnica, dominio + pruebas de identidad, autenticación, layout, dashboard
> conectado a Firestore, catálogo básico y reglas/índices iniciales. Las vistas
> de importación, operación, cambios y administración tienen sus **contratos
> (tipos, esquemas, repositorios) preparados** y una pantalla que declara
> explícitamente que se implementan en fases posteriores — **no se muestran
> datos simulados como reales**.

---

## Requisitos

- Node.js ≥ 20 (probado con Node 22) y npm.
- Un proyecto de Firebase con **Authentication (correo/contraseña)** y
  **Cloud Firestore** habilitados.
- (Opcional) Firebase CLI para emuladores, reglas e índices:
  `npm i -g firebase-tools`.

## Instalación

```bash
npm install
```

## Variables de entorno

Copie `.env.example` a `.env` y complete con los datos de su app Web de Firebase
(Consola de Firebase → *Configuración del proyecto* → *Tus apps* → *Web*):

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_USE_FIREBASE_EMULATORS   # "true" para usar el Emulator Suite
```

Son **claves públicas de cliente**. Nunca coloque aquí credenciales
administrativas, Service Accounts ni archivos JSON secretos. Si faltan
variables, la app muestra un mensaje de configuración claro en el login en lugar
de fallar de forma opaca.

## Configuración de Firebase (desde la Consola)

Como no hay backend propio, todo se configura en la **Consola de Firebase**:

1. **Authentication** → habilitar *Correo electrónico/contraseña*.
2. **Firestore** → crear la base de datos (modo producción).
3. Registrar una **app Web** y copiar la config al `.env`.

### Creación del primer usuario (§27)

La app **no crea administradores desde el navegador**. Cree el usuario
manualmente:

1. **Authentication → Usuarios → Agregar usuario** (correo + contraseña). Copie
   el `UID`.
2. En **Firestore**, cree el documento `users/{UID}` con:

```jsonc
{
  "user_id": "<UID>",
  "name": "Nombre Apellido",
  "email": "correo@dominio.com",
  "role": "admin",          // admin | manager | operator | viewer
  "active": true,
  "permissions": []
}
```

Un usuario **sin** documento `users/{uid}` o con `active: false` **no obtiene
datos**: la app se lo indica explícitamente.

## Ejecución local

```bash
npm run dev
```

Abra `http://localhost:5173`.

## Emulator Suite

Con Firebase CLI instalado:

```bash
firebase emulators:start          # Auth :9099, Firestore :8080, UI :4000
```

Ponga `VITE_USE_FIREBASE_EMULATORS=true` en `.env` para que la app se conecte a
los emuladores. Cree en el emulador el usuario de Auth y su documento
`users/{uid}` igual que en producción.

Datos de demostración (solo emulador, requiere confirmación):

```bash
SEED_CONFIRM=yes npm run seed:dev
```

## Despliegue de reglas e índices

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Las reglas están en `firestore.rules` y los índices en `firestore.indexes.json`.
Se recomienda **probar las reglas con el Emulator Suite** antes de desplegar.

## Pruebas

```bash
npm run lint         # ESLint (0 warnings)
npm run typecheck    # TypeScript estricto
npm run test         # Vitest (unitarias de dominio)
npm run test:e2e     # Playwright (flujo crítico; levanta el dev server)
```

Las pruebas unitarias cubren las **pruebas obligatorias de identidad (§51)** y de
**dashboard (§52)**: normalización, claves canónicas, estados calculados,
clasificación de importación y métricas.

## Estructura del proyecto

```text
src/
  app/            App.tsx, router.tsx
  pages/          auth, dashboard, placements, PlaceholderPage (fases 5–8)
  components/     layout, dashboard, feedback
  features/       auth (contexto/provider/guarda), dashboard (hook de datos)
  hooks/          useAuth, usePermissions, useConnectivity
  lib/            firebase.ts, env.ts, hashing.ts, dates.ts, connectivity.ts, collections.ts
  domain/         normalization, identity, campaign-status, dashboard-metrics,
                  import-classification, progress   (lógica pura, testeable)
  repositories/   acceso a Firestore por colección
  schemas/        validación Zod (import.schema.ts)
  types/          modelos de datos
  tests/          suites Vitest
scripts/          seed-dev.ts (solo emulador)
e2e/              pruebas Playwright
firestore.rules  firestore.indexes.json  firebase.json  .env.example
docs/mockup.html  (referencia visual del diseño)
```

## Definiciones de campaña, espacio y línea

```text
Cliente → Campaña → Espacio operativo → Línea operativa → Piezas requeridas
```

- **Campaña**: agrupación por `Cliente + Número de campaña`.
- **Espacio**: identidad = grupo + placement + fecha de fijación + título +
  descripción de creatividad. Cambiar *Panadería* por *Refrescos* crea **otro**
  espacio. La **fecha de retirada NO forma parte de la identidad**.
- **Línea**: una `Creatividad ID` dentro de un espacio. La misma Creatividad ID
  en dos espacios = **1 creatividad única, 2 espacios, 2 líneas**.

Los identificadores (número de campaña, Creatividad ID) se guardan como **texto**
y conservan ceros a la izquierda (`000125` no se convierte en `125`). La
normalización técnica solo recorta/colapsa espacios, normaliza Unicode y compara
sin distinguir mayúsculas: **nunca corrige ortografía ni relaciona nombres
parecidos**.

## Proceso de importación (Fase 6 — implementado)

Flujo completo, todo en el navegador; el archivo nunca se sube a Storage:

```text
Seleccionar archivo → leer en memoria (hash SHA-256) → validar estructura →
validar filas → resolver placement (exacto/alias) → construir identidad →
detectar duplicados → comparar con Firestore → vista previa con cambios
proyectados → confirmar → escribir por lotes → actualizar dashboard
```

Implementado y en la vista **«Nueva carga»** (`/nueva-carga`):

- Lectura local con SheetJS (`lib/excel.ts`, `lib/file-reader.ts`); rechazo
  estructural estricto (una sola hoja, encabezados exactos, sin adivinar).
- Validación por fila con motivo exacto y acción sugerida
  (`schemas/import.schema.ts`); resolución de artículo → placement por
  coincidencia exacta/alias, sin fuzzy (`domain/placement-index.ts`).
- Detección de duplicados en el archivo, claves/`content_hash`
  (`domain/identity.ts`) y clasificación contra Firestore
  (`domain/import-pipeline.ts`): `new_campaign`/`new_space`/`new_line`/
  `updated_line`/`unchanged`/`creativity_change`.
- Vista previa con conteos proyectados y **confirmación previa** obligatoria.
- Escritura por lotes con `writeBatch` + `serverTimestamp`, **progreso visible**,
  IDs deterministas (idempotencia) y bloqueo por `file_hash`
  (`repositories/import-processing.repository.ts`). Crea grupos, espacios,
  líneas, operación inicial (checks en false), snapshots de requisitos,
  `change_history`, `import_rows`, `detected_changes` y el registro de `imports`.
- Reporte de errores descargable en CSV, generado localmente (`lib/error-report.ts`).
- Historial de cargas en `/historial`.

Una nueva Creatividad ID en un espacio existente **no** sobrescribe la anterior:
crea una nueva línea y registra un cambio detectado `pending_review` (posible
sustitución) para revisión manual.

## Limitaciones conocidas

- **Fase 6 (importador) implementada** además del alcance inicial (§58).
  Operación, cambios detectados, detalle de campaña, configuración y
  administración de usuarios siguen **preparados a nivel de contrato**; su UI se
  implementa en fases posteriores (marcadas explícitamente en la app).
- El importador escribe con IDs deterministas y bloqueo por `file_hash`, lo que
  evita duplicar entidades al reintentar; la **reanudación fina desde el último
  lote confirmado** queda como limitación conocida (§25).
- El dashboard agrega en cliente sobre líneas actuales/activas (con `limit`).
  Para volúmenes grandes se prevén **agregados precalculados** (§54) — no se
  introducen de forma prematura.
- El bundle supera 500 kB (Firebase + Recharts); se puede optimizar con
  *code-splitting* cuando sea necesario. No afecta el uso local.
- Las Cloud Functions quedan **fuera** de la primera versión por diseño.

## Seguridad

- Autenticación obligatoria; autorización por rol respaldada por
  **Firestore Security Rules** (no solo por ocultar botones).
- **Sin eliminaciones físicas**: no existe ninguna regla `allow delete`; toda
  baja es lógica (`active: false`).
- `created_at` / `created_by` son inmutables; `updated_by` / `created_by` deben
  coincidir con el usuario autenticado; un usuario no puede cambiar su propio
  rol; las colecciones no declaradas se rechazan (default deny).
- No se instala `firebase-admin`; no hay Service Accounts ni credenciales
  administrativas en el repositorio.

## Respaldo recomendado

Al ser Firestore la única fuente de verdad, programe **exportaciones
periódicas** de Firestore (Consola de Firebase → *Firestore* → *Importar/Exportar*,
o `gcloud firestore export`) a un bucket de respaldo. Conserve además copias de
`firestore.rules` e `firestore.indexes.json` versionadas en este repositorio.
