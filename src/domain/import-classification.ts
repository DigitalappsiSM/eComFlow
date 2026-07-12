/**
 * Clasificación de una fila válida contra el estado actual en Firestore
 * (§9, §20, §21).
 *
 * Resultados posibles (§20):
 *   new_campaign | new_space | new_line | updated_space | updated_line
 *   | unchanged | creativity_change | possible_replacement | rejected
 *
 * Reglas de content_hash (§21):
 *   misma clave + mismo hash      = sin cambios
 *   misma clave + hash diferente  = actualización
 *   clave diferente               = nuevo / cambio de identidad
 *
 * No se asume automáticamente sustitución (§9): una nueva Creatividad ID en un
 * espacio existente crea una nueva línea, conserva la anterior y queda como
 * cambio detectado pendiente de revisión.
 */

export type ImportResult =
  | 'new_campaign'
  | 'new_space'
  | 'new_line'
  | 'updated_space'
  | 'updated_line'
  | 'unchanged'
  | 'creativity_change'
  | 'possible_replacement'
  | 'excluded_by_type'
  | 'rejected';

/** Línea ya existente en Firestore, proyectada a lo mínimo necesario. */
export interface ExistingLineRef {
  campaignLineKey: string;
  creatividadIdKey: string;
  contentHash: string;
  isCurrent: boolean;
  active: boolean;
}

export interface ExistingState {
  groupExists: boolean;
  spaceExists: boolean;
  /** Línea con la MISMA `campaign_line_key`, si existe. */
  matchingLine?: ExistingLineRef;
  /** Otras líneas del mismo espacio (distinta Creatividad ID). */
  otherLinesInSpace: readonly ExistingLineRef[];
}

export interface ClassificationInput {
  contentHash: string;
  existing: ExistingState;
}

export interface Classification {
  result: ImportResult;
  /** true si el cambio de creatividad podría ser una sustitución (§9). */
  possibleReplacement: boolean;
}

export function classifyRow(input: ClassificationInput): Classification {
  const { contentHash, existing } = input;

  if (!existing.groupExists) {
    return { result: 'new_campaign', possibleReplacement: false };
  }

  if (!existing.spaceExists) {
    return { result: 'new_space', possibleReplacement: false };
  }

  // El espacio existe. ¿Existe la misma línea (misma creatividad_id)?
  if (existing.matchingLine) {
    if (existing.matchingLine.contentHash === contentHash) {
      return { result: 'unchanged', possibleReplacement: false };
    }
    return { result: 'updated_line', possibleReplacement: false };
  }

  // El espacio existe pero NO hay línea con esta Creatividad ID.
  const activePriorLines = existing.otherLinesInSpace.filter(
    (l) => l.active && l.isCurrent,
  );

  if (activePriorLines.length > 0) {
    // Nueva creatividad dentro de un espacio con creatividad(es) vigente(s):
    // se creará una nueva línea y queda pendiente de revisión si sustituye.
    return { result: 'creativity_change', possibleReplacement: true };
  }

  // El espacio existía pero sin líneas vigentes: simplemente una nueva línea.
  return { result: 'new_line', possibleReplacement: false };
}
