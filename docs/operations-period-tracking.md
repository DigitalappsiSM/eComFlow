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

## 2. Control "Marcar todos los checks del periodo vencido"

En **Seguimiento operativo** (`/operacion`), antes de la tabla, aparece un
control que marca de una vez todos los checks obligatorios pendientes de las
líneas **filtradas** cuyo **periodo ya venció**.

Reglas:

- Aplica **solo a las líneas filtradas** en pantalla (respeta los filtros
  activos: periodo, cadena, tipo, etc.).
- Aplica **solo cuando el periodo ya venció**: usa **`periodo_fin`** si existe
  (el periodo operativo vence antes que la campaña global); si no, cae a
  `fecha_retirada`.
- **No afecta** líneas futuras ni en curso (esas se marcan manualmente check por
  check).
- Requiere **permiso de escritura** (`operations.write`). Si no hay permiso, no
  hay líneas vencidas pendientes, o ya se está guardando, el control queda
  deshabilitado.
- Cada check se persiste con auditoría (mismo flujo que un check individual).

## 3. Validación en producción (después del merge)

1. Abrir **https://digitalappsism.github.io/eComFlow/operacion**.
2. Recargar fuerte con **Ctrl + Shift + R**.
3. Confirmar que aparece el control **"Marcar todos los checks del periodo
   vencido"** encima de la tabla.
4. Reimportar el Excel de **CONTROLADORA MABE** (Nueva carga). Si aparece
   advertencia de `file_hash` duplicado, confirmar el reprocesamiento.
5. Validar por periodo, con el filtro **Periodo**:
   - Cliente **CONTROLADORA MABE**, Periodo **S28** y Periodo **S29** deben verse
     **por separado** (no fusionados/absorbidos).
   - La columna **Periodo** muestra el rango operativo (`periodo_inicio →
     periodo_fin`) y la etiqueta de continuidad (Fijación / Continua).
