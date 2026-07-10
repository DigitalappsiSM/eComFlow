/**
 * Datos de demostración SOLO para desarrollo (§55).
 *
 * - No se ejecuta automáticamente.
 * - No apunta a producción: exige el Emulator Suite.
 * - Requiere confirmación explícita (SEED_CONFIRM=yes).
 * - Usa el SDK Web (nunca Admin SDK).
 *
 * Uso:
 *   1. firebase emulators:start
 *   2. SEED_CONFIRM=yes npm run seed:dev
 */

import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

async function main() {
  if (process.env.SEED_CONFIRM !== 'yes') {
    console.error(
      '[seed:dev] Cancelado. Ejecute con SEED_CONFIRM=yes y el Emulator Suite activo.',
    );
    process.exit(1);
  }

  const app = initializeApp({ projectId: 'ecomflow-next', apiKey: 'demo' });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  const now = serverTimestamp();
  const seededBy = 'seed-dev';

  const placements = [
    { placement_id: 'home_slider', nombre: 'Home Slider', descripcion: 'Carrusel principal' },
    { placement_id: 'category_banner', nombre: 'Category Banner', descripcion: 'Banner de categoría' },
    { placement_id: 'in_grid', nombre: 'In-Grid', descripcion: 'Dentro de la parrilla' },
    { placement_id: 'search_banner', nombre: 'Search Banner', descripcion: 'Banner de búsqueda' },
  ];

  for (const p of placements) {
    await setDoc(doc(db, 'placements', p.placement_id), {
      ...p,
      nombre_normalizado: p.nombre.toLowerCase(),
      aliases: [],
      active: true,
      created_at: now,
      created_by: seededBy,
      updated_at: now,
      updated_by: seededBy,
    });
  }

  console.log(
    `[seed:dev] Sembrados ${placements.length} placements en el emulador (proyecto de demo).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed:dev] Error:', err);
  process.exit(1);
});
