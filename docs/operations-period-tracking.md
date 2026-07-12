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

## 2. Botón por línea "Marcar todos"

En **Seguimiento operativo** (`/operacion`), **cada línea operativa** cuyo
**periodo ya venció** y que aún tenga checks obligatorios pendientes muestra, en
la columna **Avance**, un botón **"Marcar todos"** que completa de una vez todos
los checks obligatorios de **esa línea** (no de todas a la vez).

Reglas:

- Es **por línea**, no global: solo afecta a la línea de su propio botón.
- Aparece **solo cuando el periodo ya venció**: usa **`periodo_fin`** si existe
  (el periodo operativo vence antes que la campaña global); si no, cae a
  `fecha_retirada`.
- **No aparece** en líneas futuras ni en curso (esas se marcan manualmente check
  por check), ni en líneas que ya tienen todos sus checks completos.
- Requiere **permiso de escritura** (`operations.write`).
- Mientras guarda esa línea, su botón queda deshabilitado ("Marcando…").
- Cada check se persiste con auditoría (mismo flujo que un check individual).

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
