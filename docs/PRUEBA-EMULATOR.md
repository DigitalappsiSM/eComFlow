# Guía de prueba end-to-end con Firebase Emulator Suite

Esta guía valida **reglas + índices + escrituras** juntos, sin tocar tu
proyecto real de Firebase. Todo corre en tu equipo.

## 0. Requisitos

- Node ≥ 20 y `npm install` ya ejecutado.
- **Firebase CLI**: `npm i -g firebase-tools`.
- **Java 11+** (lo exige el emulador de Firestore). Verifica con `java -version`.

## 1. Configura el `.env` para el emulador

Copia `.env.example` a `.env` y usa valores de demo (el emulador no valida las
claves, pero deben estar presentes y no vacías):

```dotenv
VITE_FIREBASE_API_KEY=demo
VITE_FIREBASE_AUTH_DOMAIN=localhost
VITE_FIREBASE_PROJECT_ID=ecomflow-next
VITE_FIREBASE_STORAGE_BUCKET=demo
VITE_FIREBASE_MESSAGING_SENDER_ID=demo
VITE_FIREBASE_APP_ID=demo
VITE_USE_FIREBASE_EMULATORS=true
```

> El `projectId` **debe** ser `ecomflow-next` para que la app, el emulador y el
> seed hablen del mismo proyecto.

## 2. Arranca el Emulator Suite

Desde la raíz del proyecto:

```bash
firebase emulators:start --project ecomflow-next
```

Deja esta terminal abierta. Verás:

- Auth → `127.0.0.1:9099`
- Firestore → `127.0.0.1:8080` (carga `firestore.rules` e `firestore.indexes.json`)
- Emulator UI → `http://127.0.0.1:4000`

## 3. Crea el primer usuario admin (una sola vez)

En la **UI del emulador** (`http://127.0.0.1:4000`) — la UI **omite las reglas**,
por eso la usamos para el arranque:

1. **Authentication → Add user**: correo `admin@demo.mx`, contraseña `secret123`.
   Copia el **UID** generado.
2. **Firestore → Start collection** `users` → **Document ID = ese UID** con campos:

```jsonc
{
  "user_id": "<UID>",
  "name": "Admin Demo",
  "email": "admin@demo.mx",
  "role": "admin",     // string
  "active": true       // boolean
}
```

## 4. Siembra catálogo, requisitos y configuración

En **otra terminal** (con el emulador corriendo):

```bash
SEED_CONFIRM=yes ADMIN_EMAIL=admin@demo.mx ADMIN_PASSWORD=secret123 npm run seed:dev
```

El script inicia sesión como admin (respetando las reglas) y crea 4 placements
(`Home Slider`, `Category Banner`, `In-Grid`, `Search Banner`), 3 requisitos
obligatorios para Home Slider (Desktop/Mobile/App → 3 piezas por línea) y
`app_settings/global`.

> Si falla el login, revisa que el paso 3 esté hecho (usuario en Auth **y**
> `users/{uid}` con `role:"admin"`, `active:true`).

## 5. Levanta la app y entra

En otra terminal:

```bash
npm run dev
```

Abre `http://localhost:5173`, inicia sesión con `admin@demo.mx` / `secret123`.
El indicador de conexión debe verse **En línea**. El dashboard cargará vacío
(base sin campañas todavía).

## 6. Importa el archivo de ejemplo

1. Ve a **Nueva carga** (`/nueva-carga`).
2. Selecciona `docs/ejemplo-importacion.csv`.
3. Revisa la **vista previa**. Con el catálogo sembrado, se esperan:

| Fila | Registro | Resultado | Motivo |
|------|----------|-----------|--------|
| 2 | Soriana 45872 · Home Slider · Panadería · 10025 | Nueva campaña | — |
| 3 | Soriana 45872 · Category Banner · Refrescos · 10025 | Nueva campaña\* | mismo grupo, otro espacio |
| 4 | Walmart 12000 · Home Slider · Lácteos · 20050 | Nueva campaña | — |
| 5 | Soriana 45872 · Home Slider (retirada 10/07) | **Rechazada** | retirada anterior a fijación |
| 6 | Chedraui 9001 · **Zócalo** | **Rechazada** | artículo no existe en el catálogo |

> \* Las filas se clasifican contra el estado de Firestore **previo** a la
> importación, no entre sí. Por eso las dos filas de Soriana muestran «Nueva
> campaña»; al escribir, el grupo `soriana|45872` se crea **una sola vez** (ID
> determinista) y quedan **2 espacios**.

4. Descarga el **reporte de errores** (botón) para ver las 2 filas rechazadas
   con su motivo y acción sugerida (§45).
5. Pulsa **Confirmar importación** y observa la barra de progreso por lotes.

## 7. Verifica los resultados

- **Dashboard** (semana 17–23 jul 2026): 2 clientes, 2 campañas, 3 espacios,
  3 líneas, **2 creatividades únicas** (10025 y 20050 — la 10025 se cuenta una
  vez aunque esté en 2 espacios, §36), y **6 piezas requeridas** (2 líneas Home
  Slider × 3; Category Banner no tiene requisitos sembrados).
- **Seguimiento operativo** (`/operacion`): 3 líneas con sus checks en falso,
  avance 0 %, estado calculado. Marca un check → el avance sube y en el panel de
  detalle aparece la entrada de historial. Asigna un responsable.
- **Historial de cargas** (`/historial`): la importación con sus totales.
- **Detalle de campaña** (`/campanas`): abre Soriana 45872 y verás 2 espacios.
- **Emulator UI → Firestore**: revisa `campaign_groups`, `campaign_spaces`,
  `campaign_lines`, `campaign_operations`, `campaign_line_requirements`,
  `change_history`, `import_rows`, `imports`.

## 8. (Opcional) Prueba un cambio de creatividad

Crea `docs/segunda-carga.csv` con una **nueva Creatividad ID** en un espacio
existente:

```csv
Cliente,Número de campaña,Artículo,Anunciante,Fecha de fijación,Fecha de retirada,Creatividad título,Creatividad descripción,Creatividad ID
Soriana,45872,Home Slider,Soriana,17/07/2026,30/07/2026,Panadería,Banner categoría panadería,10118
```

Impórtalo. La fila se clasifica como **Cambio de creatividad** (posible
sustitución). Tras confirmar, ve a **Cambios detectados** (`/cambios`): verás el
pendiente. Elige **«Es sustitución»**, selecciona la creatividad 10025 y
confirma → la línea 10025 se retira (`is_current=false`), la 10118 queda
vigente y se registra la auditoría (§9).

## 9. (Opcional) Prueba las reglas de seguridad

- Crea un segundo usuario **viewer** (Auth + `users/{uid}` con `role:"viewer"`).
  Al entrar, no debe poder marcar checks ni confirmar importaciones.
- Marca `active:false` en un usuario → al entrar verá «Acceso no autorizado».
- Intenta cambiar tu propio rol en **Administración de usuarios** → está
  bloqueado (UI y reglas).

## Limpieza

Detén el emulador con `Ctrl+C`. Los datos del emulador son efímeros salvo que
uses `firebase emulators:start --export-on-exit ./emulator-data`.
