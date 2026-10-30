# Asistente con memoria: código del lanzador, la conexión y el comando «gracian»

Esta carpeta contiene el código fuente del «Asistente con memoria»: la variante local de OpenCode (memoria global y por proyecto, perfil de asistente en español) que se instala desde la publicación **v0.1.0-rc.1** de este repositorio.

## Contenido

- `launcher/`: instalador y lanzador de la terminal (`Instalar.cmd`, `Configurar.cmd`, `Abrir.cmd`, `install.mjs`, `launch.mjs`, `lib.mjs`, `secret.ps1`). Su guía está en `launcher/README.md`.
- `conexion/`: conexión por Telegram al mismo OpenCode del PC (`Servidor.cmd`, `Telegram.cmd`, `Emparejar.cmd`, `AbrirConectado.cmd` y sus `.mjs`), la biblioteca local de Gracián (`biblioteca.mjs`, `gracian-cli.mjs`) y el comando de terminal `gracian.mjs`.
- `conexion/gracian/oraculo.json`: los 300 aforismos con lectura actual. Fuente y licencia en `conexion/gracian/LICENCIA.md` (Wikisource, CC BY-SA 4.0).
- `bin/gracian.cmd`: comando `gracian` para la terminal de Windows.

## El comando «gracian»

Tras una instalación existente del Asistente con memoria (cualquier conexión 0.4.1 o 0.5):

1. Copia `conexion/gracian.mjs`, `conexion/gracian-cli.mjs`, `conexion/biblioteca.mjs`, `conexion/gracian/oraculo.json` y `bin/gracian.cmd` a las mismas rutas dentro de la carpeta de instalación.
2. Agrega la carpeta `bin` de la instalación al PATH del usuario de Windows. En PowerShell (una línea; ajusta la ruta si tu carpeta se llama distinto; el orden de los argumentos de `SetEnvironmentVariable` es nombre, valor, destino):

   `$b="$env:USERPROFILE\Asistente con memoria\bin"; $p=[Environment]::GetEnvironmentVariable('Path','User'); if (-not (($p -split ';') -contains $b)) { if ($p) { [Environment]::SetEnvironmentVariable('Path', "$p;$b", 'User') } else { [Environment]::SetEnvironmentVariable('Path', $b, 'User') } }`
3. Abre una terminal nueva y escribe `gracian`: abre tu OpenCode directamente con la voz de Gracián (misma memoria, sesiones, modelo y permisos; todo sigue pidiendo aprobación). Para volver al asistente normal: tecla Tab, o `Abrir.cmd`.

`gracian.mjs` levanta un servidor local privado solo en 127.0.0.1 mientras la ventana esté abierta y fija la sesión en el agente «gracian»; si ya hay un servidor del asistente en marcha, avisa y no abre otro (nunca dos servidores sobre la misma base). La voz consulta la biblioteca local con `gracian-cli.mjs` (sin modelo): cita texto exacto con su número y distingue siempre texto de Gracián, lectura actual (interpretación) y consejo propio.

## Avisos

- Versión de revisión, no estable. La instalación nueva en Windows aún está por validarse (ver `launcher/README.md`).
- Sin claves ni datos de ninguna persona: las claves se configuran en cada instalación y se guardan cifradas con DPAPI del propio usuario de Windows.
- El código de OpenCode conserva su licencia MIT (ver `LICENSE` en la raíz del repositorio).
