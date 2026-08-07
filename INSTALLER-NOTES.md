# ForgeEngine Installer Integration Notes

The desktop packaging layer was added without changing ForgeEngine's editor/API design.

## Changed behavior

`core/index.js` now distinguishes between:

- `APP_ROOT`: read-only application files shipped with ForgeEngine.
- `DATA_ROOT`: writable account, project, scene and uploaded-asset data.

Normal `npm run dev` behavior remains HTTPS on `127.0.0.1:4173` with the existing certificates.

Electron sets:

- `FORGE_DATA_ROOT` to Electron's per-user application data directory.
- `FORGE_LOCAL_HTTP=1` to use HTTP on loopback only.
- `PORT=0` so the operating system selects a free port.

The Express server now returns its server object and URL when started programmatically. This allows the desktop process to stop it cleanly when ForgeEngine exits.

## Why local HTTP is acceptable here

The Electron build binds only to `127.0.0.1`, so the service is not exposed on the LAN. Avoiding self-signed HTTPS also avoids certificate trust problems in the packaged desktop application. The existing HTTPS mode is retained for browser development.

## Future desktop-only features

Good candidates for the desktop shell later are native open/save dialogs, recent-project integration, file associations, auto-update, crash reporting and OS menus. Engine modules themselves should remain independent from Electron where possible.
