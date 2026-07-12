# Correo de especificaciones Ecommerce

La pantalla **Detalle de campaña** (`/campanas`) es un **generador de correo
filtro-primero** para operativa **Ecommerce**: en lugar de entrar campaña por
campaña, se selecciona con filtros (cliente, periodo, fechas…) y el correo se
arma con **todas las líneas Ecommerce** que apliquen, aunque sean de varias
campañas.

## Flujo

1. `fetchActiveCampaignLines` carga las líneas `active == true` y
   `is_current == true` de todas las campañas.
2. Se filtran en cliente a **operativa Ecommerce** (`tipo_operacion == 'ECOMMERCE'`).
3. El usuario acota con filtros; el correo y la tabla reflejan solo lo filtrado.
4. Las líneas se agrupan por creatividad (cliente · cadena · artículo · id ·
   nivel · descripción), uniendo periodos (p. ej. `S29, S30`) y tomando la mínima
   fijación y la máxima retirada.
5. Las filas se ordenan por **cliente** y luego por **periodo** (cronológico, por
   la fijación más temprana de la fila).

## Título para tracking

Encima de la vista previa se muestra **un título por cliente** para copiar, con
el formato:

```
# de campaña(s) | cliente | Campañas Soriana.com
```

Ejemplo: `24490, 24491 | PROXIMO NATAL | Campañas Soriana.com`. Une los números
de campaña del cliente (sin duplicados) con comas; cada título tiene su botón
**Copiar título**.

## Filtros

- **Cliente**, **Periodo**, **Cadena**, **Anunciante**, **Artículo** (selects
  poblados dinámicamente) y **búsqueda libre**.
- **Rango de fechas de fijación** (Desde / Hasta).
- Contador: "Mostrando X de Y líneas Ecommerce". Botón **Limpiar** reinicia todo.
- Si no hay coincidencias, se muestra un estado vacío sin romper la UI.

## Correo generado

- **Saludo** editable: "Hola [nombre]," o "Hola," si se deja vacío.
- Narrativa con número(s) de campaña, **Soriana.com**, fechas de inicio/fin (la
  mínima fijación y la máxima retirada) y periodos involucrados.
- **Tabla** con columnas exactas: Cadena · Cliente · Anunciante / Marca ·
  Periodo(s) · Artículo · **Creatividad descripción** · Nivel · Fijación ·
  Retirada · Desktop · Mobile · App 1 · App 2.
- Las **medidas** salen del **catálogo fijo** (`ecommerceMeasures.ts`), con
  búsqueda tolerante (mayúsculas, acentos, niveles N1/N2/N3, signos). No dependen
  de `campaign_line_requirements`.
- **Fecha límite de materiales** = 2 días antes de la primera fijación.
- Fechas en español: tabla `dd/mm/yyyy`, narrativa "15 de julio de 2026".

## Copiar

- **Copiar para Outlook**: copia el correo como **HTML** (tabla con estilos en
  línea) y como texto plano (`ClipboardItem` con `text/html` + `text/plain`).
  Al pegar en Outlook conserva el formato. Si el navegador no soporta HTML en el
  portapapeles, cae a texto plano.
- **Copiar texto**: copia solo texto plano, con la tabla **tabulada** (`\t`) para
  pegar bien en cualquier documento.
- Feedback visual "Copiado (HTML)" / "Copiado (texto)" / error.

## Validación en producción

1. Abrir **https://digitalappsism.github.io/eComFlow/campanas** → Ctrl + Shift + R.
2. Filtrar por un **Cliente** (y/o Periodo o rango de fechas) con líneas Ecommerce.
3. Verificar la vista previa: saludo, narrativa, tabla con **Creatividad
   descripción** y medidas fijas, fecha límite y cierre.
4. **Copiar para Outlook** y pegar en un correo nuevo: la tabla debe verse con
   formato.
5. Confirmar el conteo "Mostrando X de Y líneas Ecommerce" y que **Limpiar**
   reinicia filtros y fechas.
