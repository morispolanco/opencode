# Asistente con memoria - publicación de prueba 0.7

Versión genérica, sin claves ni notas de ninguna persona. **Publicación de prueba, no versión estable.** La instalación limpia completa está comprobada en Linux x64 (30 de octubre de 2026); pendiente una ejecución completa en Windows real.

## Para una persona que lo instala

1. Windows 11 de 64 bits y conexión a internet. Se usan dependencias nativas y varios GB de disco; no hay un mínimo medido de RAM o disco. La instalación no necesita administrador. Descarga `Instalar-Gracian.cmd` desde la publicación **v0.7.0** del repositorio (sección Assets) y ejecútalo. En un solo paso: instala Git y **Bun 1.4.4** si faltan (desde sus sitios oficiales: https://git-scm.com y https://bun.sh), descarga el código de memoria fijado al commit `db768f5990cb54845efff5806a7197fc1bb45e9b`, instala sus dependencias con el lockfile, copia la conexión y registra el comando `gracian` en el PATH de tu usuario (comprobado releyendo el registro). No usa una carpeta de desarrollo existente ni modifica otro OpenCode. El destino es `Asistente con memoria` dentro de tu usuario. Si ya existe una instalación completa, no toca nada; si un intento anterior quedó a medias, lo limpia y reintenta; si algo falla a mitad, deshace lo hecho. No uses el instalador general de OpenCode: instalaría otra distribución.
2. En la carpeta creada, abre `Configurar.cmd`. Usa **tu propia cuenta y clave OpenRouter**, y el modelo que elijas. El ejemplo inicial es `openai/gpt-4.1-mini`. El campo de clave es oculto y se guarda cifrado con DPAPI para tu usuario Windows. No la envíes por chat ni la escribas en documentos.
3. Antes de conectar, configura en OpenRouter un límite monetario finito para esa clave, con gasto BYOK incluido. Tú eliges el importe y su reinicio, no hay una cifra impuesta. El lanzador verifica ese límite en cada arranque y se detiene si no puede verificarlo, falta clave o el límite está agotado. **El límite es de gasto, no una cuota fija de tokens.** No se compra saldo ni se recarga automáticamente. El saldo de la cuenta o los límites de proveedor pueden detener el uso antes.
4. Abre `Abrir.cmd` o escribe `gracian` en una terminal nueva. Puedes crear manualmente un acceso directo a ese archivo en el Escritorio. No cambies a otro proveedor: este candidato permite solo OpenRouter. No hay cambio automático a pago desde un servicio gratuito ni a otro proveedor. Los modelos gratis de OpenRouter, si los eliges, siguen sujetos a sus cuotas y políticas; no se garantiza uso gratuito ilimitado.

## Uso cotidiano

- Conversar, redactar, analizar y organizar, con instrucciones en español. La interfaz mantiene textos en inglés.
- `Recuerda que prefiero respuestas breves en todos mis proyectos`. Revisa el texto y el alcance; `Allow once` aprueba y `Reject` cancela. El permiso de escritura se pide por defecto. No uses aprobación automática.
- `¿Qué tienes guardado sobre mis preferencias?`, `Corrige esta nota...` o `Olvida la nota...`.
- Las notas son del proyecto por defecto. Las globales se comparten entre carpetas de **esta instalación**. No se sincronizan entre equipos ni usuarios. No es memoria completa de cada conversación.
- El acceso habitual usa una carpeta propia de trabajo. Para otro proyecto, ejecuta `Abrir.cmd "C:\ruta\del\proyecto"`. Una carpeta distinta tiene otra conversación estable; las notas globales siguen disponibles.
- Para RAM o espacio: `Consulta RAM total y libre y espacio libre por disco. No cambies nada`. Lee y aprueba el comando de consulta una sola vez. Para ordenar archivos, pide primero inventario y propuesta. Aprobar un comando puede autorizar todo lo que ese comando haga: no hay reversión universal.

## Seguridad y privacidad

Los comandos y archivos tienen los permisos de tu usuario Windows. No ejecutes como administrador para el uso normal. Cada herramienta solicita aprobación; el aislamiento de datos no es una barrera de seguridad contra comandos que autorices. Las configuraciones de proyecto se desactivan y no se importan claves del entorno. Políticas administradas del equipo pueden seguir aplicándose.

El historial y la memoria se guardan bajo la carpeta de instalación. **El cifrado DPAPI protege la clave, no la base de datos de notas ni las conversaciones.** La copia de seguridad de la carpeta puede contener datos privados: no la publiques. Las notas relevantes, conversación, archivos o salidas de herramientas que el asistente utilice se envían a OpenRouter y al proveedor del modelo. Revisa su política de privacidad. No guardes secretos en memoria.

No incluye correo, calendario, vigilancia permanente ni generación de imágenes. No funciona con el equipo apagado. No conecta cuentas de otras personas ni hereda conexiones de otro asistente. Para correo hace falta configurar aparte un conector revisado y autorizar una cuenta concreta.

## Lo comprobado y lo pendiente

Comprobado el 27 de octubre de 2026 en Linux x64: instalación limpia real del código fijado, dependencias con lockfile, ruta con espacios, rechazo de sobrescritura, CLI y TUI reales, agente Asistente, validación de esquema V2, 12 pruebas de memoria y 5 del lanzador. Comprobado además el 30 de octubre de 2026 en Linux x64: el instalador de un solo paso `Instalar-Gracian.cmd` completó una instalación limpia real (motor en el commit fijado, dependencias, biblioteca de 300 aforismos, consulta local, comando y PATH con relectura), probó idempotencia sin cambios al reejecutar, limpieza de un intento incompleto, rechazo de carpeta ajena sin tocarla y deshacer total ante un fallo de descarga. Sin clave propia la interfaz muestra que falta proveedor. Se comprobó además shell como herramienta directa, fuera de execute, con proveedor simulado local, solicitud de permiso en TUI y resultado real tras aprobar. No se llamó a un modelo externo ni se gastó saldo.

**Pendiente antes de una publicación estable:** instalación limpia en Windows real, guardado/lectura DPAPI con la misma cuenta, conversación con cuenta del probador y guardado/recuperación de memoria con ese modelo, rechazo de permisos y apertura posterior. El objetivo es ofrecer las mismas funciones básicas, no respuestas idénticas. Esta verificación no sustituye esas pruebas.

## Contenido de esta publicación

Los scripts y pruebas de software del lanzador están incluidos en este paquete. El instalador descarga el motor y la memoria desde el repositorio público, fijados al commit indicado arriba. No instala la distribución oficial ni copia una instalación personal existente. No contiene claves, notas, conversaciones, bases de datos ni registros de ejecución. Consulta `REVISION-Y-PRUEBAS.md` en la raíz del paquete para los límites de verificación.

Fuentes: https://github.com/morispolanco/opencode/tree/memoria-global · https://opencode.ai/v2/docs/providers/ · https://openrouter.ai/docs/api-reference/limits
