# Conciliación de fuente EKON (campañas y líneas)

Concilia de forma segura las líneas de Firestore contra una exportación EKON:
detecta líneas que existían y dejaron de aparecer en un archivo que cubre **el
mismo alcance confirmado**, las da de baja lógica como `not_in_source`, las
excluye de operación/dashboards/KPIs conservando todo su avance, y las restaura
automáticamente si vuelven a aparecer.

## Principios

- **Nunca borra** físicamente. Toda baja es lógica (`active:false`).
- La ausencia sólo es significativa cuando el usuario **confirma** que el archivo
  es completo para los periodos, cadenas y tipos detectados.
- Estado de fuente independiente de `cancelled`:
  `source_status ∈ { present, not_in_source, restored }`.
- `is_current` y `cancelled` **no se tocan** por esta lógica.

## Modos de importación

- **Aditivo** (por defecto, seguro): crea/actualiza líneas y refresca su
  presencia (`touch`). No desactiva nada.
- **Autoritativo**: trata el archivo como fotografía completa del alcance
  detectado. Requiere un checkbox de confirmación. Las líneas activas dentro del
  alcance que no aparecen se marcan `not_in_source`.

La conciliación autoritativa se **bloquea** (sin desactivar nada) si: no hay
periodos con fechas válidas, falta cadena, no hay tipos conciliables, o la
consulta de comparación falla. El modo aditivo nunca depende de la elegibilidad.

Las **filas rechazadas NO bloquean** la conciliación (decisión de negocio): no
se importan, pero no impiden conciliar los tipos elegibles. Riesgo residual: si
un rechazo era en realidad una línea conciliable activa, podría marcarse
`not_in_source`; la baja es reversible y se restaura al reaparecer correcta.

## Tipos conciliables

Sólo se marcan como no incluidas las líneas cuyo `tipo_operacion` es
**conciliable**: `ECOMMERCE`, `DIGITAL SIGNAGE`, `TOMATURNOS`
(`RECONCILABLE_OPERATION_TYPES` en `src/domain/reconciliation.ts`, fijo en
código). Cualquier otro tipo se importa pero nunca se desactiva por ausencia.

## Alcance por periodos discretos

El alcance se deriva de los periodos **exactos** del archivo (código + inicio +
fin), no de `min/max`. Un archivo con S33 y S35 no marca S34 como ausente.

## Estrategias de retailer

- `period_range` (Soriana / genérico): pertenece al alcance por coincidencia
  **exacta** de periodo (inicio + fin [+ código]) con cadena y tipo incluidos.
- `campaign_range` (La Comer): la línea consolida activaciones diarias en un
  solo documento. Pertenece al alcance sólo si su **rango de activación queda
  contenido por completo** en la ventana confirmada; y como cualquier fila de la
  campaña la mantiene presente, omitir días sueltos nunca la desactiva.

> Nota de diseño: por indicación de negocio, La Comer (`campaign_range`) **sí**
> participa de la conciliación (a diferencia de la propuesta original §5.2 del
> documento de especificación, que la excluía). Se implementó con la regla de
> contención total anterior para minimizar falsos positivos, y la baja es
> reversible (lógica + restauración automática con avance conservado).

## Orden transaccional (`runImport`, por fases)

1. Crear el registro de importación (`processing`).
2. Escribir/actualizar entidades presentes en el archivo.
3. `touch` de presencia de filas `unchanged`.
4. Restaurar líneas `not_in_source` que reaparecieron.
5. Sólo si `authoritative` y elegible: baja lógica de ausencias.
6. Recalcular actividad de espacios/grupos afectados.
7. Cerrar el registro de importación con conteos y estado de conciliación.

Cada fase es idempotente: la baja sólo ocurre si la línea seguía activa; la
restauración sólo si seguía `not_in_source`. Reprocesar el mismo archivo/alcance
no duplica historial ni entidades (IDs deterministas).

## Auditoría

Por cada baja se registra un evento `change_history` `source_missing`; por cada
restauración, `source_restored`. El registro `imports` guarda `missing_rows`,
`restored_rows`, `reconciliation_status` y `reconciliation_blocked_reasons`, y
siempre el `import_scope` efectivo confirmado.

## Índices

**No requiere índices compuestos nuevos.** La lectura de conciliación consulta
`active + is_current` (mismo patrón que el dashboard) y filtra la ventana de
periodos, cadenas y tipos en memoria. El recálculo de padres usa consultas de
una sola igualdad (auto-indexadas).

## Compatibilidad

Todos los campos nuevos son opcionales al leer documentos antiguos. Una línea sin
`source_status` y activa se trata como `present`. No hay migración destructiva:
la primera importación autoritativa de un periodo fija el estado real de ese
alcance.
