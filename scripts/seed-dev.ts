/**
 * Datos de demostración SOLO para desarrollo (§55).
 *
 * - No se ejecuta automáticamente.
 * - No apunta a producción: exige el Emulator Suite.
 * - Requiere confirmación explícita (SEED_CONFIRM=yes).
 * - Usa el SDK Web (nunca Admin SDK) y se AUTENTICA como admin, por lo que
 *   respeta las reglas de seguridad igual que la app real.
 *
 * Requisitos previos (una sola vez, ver docs/PRUEBA-EMULATOR.md):
 *   1. firebase emulators:start
 *   2. En la UI del emulador (http://127.0.0.1:4000):
 *      - Authentication → agregar un usuario admin (correo + contraseña).
 *      - Firestore → crear users/{uid} con role:"admin", active:true.
 *
 * Uso:
 *   SEED_CONFIRM=yes ADMIN_EMAIL=admin@demo.mx ADMIN_PASSWORD=secret123 \
 *     npm run seed:dev
 */

import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

async function main() {
  if (process.env.SEED_CONFIRM !== 'yes') {
    console.error('[seed:dev] Cancelado. Ejecute con SEED_CONFIRM=yes y el Emulator Suite activo.');
    process.exit(1);
  }
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('[seed:dev] Faltan ADMIN_EMAIL / ADMIN_PASSWORD (usuario admin del emulador).');
    process.exit(1);
  }

  const app = initializeApp({ projectId: 'ecomflow-next', apiKey: 'demo' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  const cred = await signInWithEmailAndPassword(auth, email, password).catch((err) => {
    console.error(
      '[seed:dev] No se pudo iniciar sesión como admin. ¿Creó el usuario en el emulador y su doc users/{uid} con role:"admin", active:true?',
    );
    throw err;
  });
  const uid = cred.user.uid;
  const now = () => serverTimestamp();
  const audit = { created_at: now(), created_by: uid, updated_at: now(), updated_by: uid };

  const batch = writeBatch(db);

  const placements = [
    { placement_id: 'home_slider', nombre: 'Home Slider', descripcion: 'Carrusel principal' },
    { placement_id: 'category_banner', nombre: 'Category Banner', descripcion: 'Banner de categoría' },
    { placement_id: 'in_grid', nombre: 'In-Grid', descripcion: 'Dentro de la parrilla' },
    { placement_id: 'search_banner', nombre: 'Search Banner', descripcion: 'Banner de búsqueda' },
  ];
  for (const p of placements) {
    batch.set(doc(db, 'placements', p.placement_id), {
      ...p,
      nombre_normalizado: p.nombre.toLowerCase(),
      aliases: [],
      active: true,
      ...audit,
    });
  }

  // Requisitos de Home Slider: 3 dispositivos obligatorios (§36 → 3 piezas/línea).
  const reqs = [
    { requirement_id: 'home_slider_desktop', dispositivo: 'Desktop', ancho: 1920, alto: 344 },
    { requirement_id: 'home_slider_mobile', dispositivo: 'Mobile', ancho: 640, alto: 242 },
    { requirement_id: 'home_slider_app', dispositivo: 'App', ancho: 320, alto: 93 },
  ];
  for (const r of reqs) {
    batch.set(doc(db, 'placement_requirements', r.requirement_id), {
      requirement_id: r.requirement_id,
      placement_id: 'home_slider',
      canal: 'web',
      dispositivo: r.dispositivo,
      variante: 'default',
      ancho: r.ancho,
      alto: r.alto,
      peso_maximo: null,
      unidad_peso: null,
      formatos_permitidos: ['jpg', 'png'],
      obligatorio: true,
      active: true,
      fecha_inicio_vigencia: '2020-01-01',
      fecha_fin_vigencia: null,
      ...audit,
    });
  }

  batch.set(doc(db, 'app_settings', 'global'), {
    risk_days: 3,
    week_start_day: 5,
    week_end_day: 4,
    required_checks: ['correo_enviado', 'artes', 'validacion', 'link', 'kevel', 'testigos_app', 'testigos_web'],
    import_template_version: 'v1',
    allowed_file_extensions: ['.xlsx', '.xls', '.csv'],
    max_file_size: 10 * 1024 * 1024,
    pagination_size: 50,
    updated_at: now(),
    updated_by: uid,
  });

  await batch.commit();
  console.log(`[seed:dev] Sembrados ${placements.length} placements, ${reqs.length} requisitos y app_settings en el emulador.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed:dev] Error:', err);
  process.exit(1);
});
