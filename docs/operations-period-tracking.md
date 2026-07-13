# Seguimiento operativo por periodo (Ekon)

Esta nota describe cómo eComFlow Next maneja el **periodo operativo** (semana /
catorcena) del archivo Ekon en el seguimiento operativo, y el control masivo
**"Marcar todos los checks del periodo vencido"**.

## 1. Identidad operativa separada por periodo

Cuando el Excel Ekon trae la columna **`Periodo`** (formato
`C16 - 28/07/2026 a 10/08/2026` o `S29 - 17/07/2026 a 23/07/2026`), el importador
**separa la identidad de la línea por periodo**. Concretamente, la clave de
identidad usa las fechas del periodo cuando existen:

```ts
fechaFijacionIso: n.periodo.inicioIso || n.fechaFijacionIso,
fechaRetiradaIso: n.periodo.finIso   || n.fechaRetiradaIso,
```

**Motivo:** una misma campaña puede tener la **misma Fecha de Fijación** en
varios periodos consecutivos. Sin separar por periodo, una línea `S29` podría
**absorber/fusionar** una línea `S28` que comparte campaña, creatividad, artículo
y Fecha de Fijación. Separando por periodo, cada semana/catorcena se coordina
desde la semana en que inicia.

- `periodo_inicio` / `periodo_fin` → se usan para la **identidad operativa** y
  para determinar el **vencimiento operativo**.
- `fecha_fijacion` / `fecha_retirada` → siguen siendo las **fechas globales de la
  campaña** (se conservan en cada línea y se muestran como referencia).

La continuidad entre periodos se marca en `tipo_campana_periodo`:
`fijacion` (inicia en ese periodo) o `continua` (el periodo inmediatamente
anterior tenía la misma campaña/artículo/creatividad/descripción).

## 2. "Rellenar todo" (por línea y global)

En **Seguimiento operativo** (`/operacion`) hay dos formas de completar checks en
bloque:

- **Por línea**: cada línea con checks obligatorios **pendientes** muestra, en la
  columna **Avance**, un botón **"Rellenar todo"** que completa los checks de
  **esa** línea (aplica a líneas vencidas, en curso o futuras; no aparece si ya
  está completa).
- **Global**: encima de la tabla, cuando hay líneas filtradas con pendientes,
  aparece **"Rellenar todo lo filtrado (N)"**, que completa los checks
  obligatorios de **todas las líneas visibles/filtradas** de una vez.

Reglas:

- Requieren **permiso de escritura** (`operations.write`).
- El global respeta los **filtros activos**: solo toca lo que está visible.
- Mientras guardan, los botones quedan deshabilitados ("Rellenando…").
- Cada check se persiste con auditoría (mismo flujo que un check individual).

## 2b. Columna "Comentarios"

La columna antes llamada "Responsable" es ahora **"Comentarios"**: un campo de
texto por línea donde el usuario escribe notas. Se guardan en la operación
(`campaign_operations.comentarios`) con auditoría (`comment_edited`) y quedan
visibles de forma persistente.

## 3. Validación en producción (después del merge)

1. Abrir **https://digitalappsism.github.io/eComFlow/operacion**.
2. Recargar fuerte con **Ctrl + Shift + R**.
3. Confirmar que en las líneas con **periodo vencido** aparece, en la columna
   **Avance**, el botón **"Marcar todos"** (por línea, no un control global).
4. Reimportar el Excel de **CONTROLADORA MABE** (Nueva carga). Si aparece
   advertencia de `file_hash` duplicado, confirmar el reprocesamiento.
5. Validar por periodo, con el filtro **Periodo**:
   - Cliente **CONTROLADORA MABE**, Periodo **S28** y Periodo **S29** deben verse
     **por separado** (no fusionados/absorbidos).
   - La columna **Periodo** muestra el rango operativo (`periodo_inicio →
     periodo_fin`) y la etiqueta de continuidad (Fijación / Continua).
