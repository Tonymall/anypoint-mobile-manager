# MuleOps Backend

Thin backend for server-side MuleOps services.

## Current scope

- `GET /health`
- `POST /api/bug-reports`
- `GET /api/admin/bug-reports`
- `POST /api/alerts`
- `GET /api/alerts`
- `GET /api/config/mobile`
- `GET /api/admin/alerts`
- `GET /api/admin/config/mobile`
- `PUT /api/admin/config/mobile`

The mobile app should call this backend for bug reporting so the EmailJS private key stays server-side.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in the EmailJS values
3. Set `ADMIN_API_KEY` if you want to read stored reports
4. Install dependencies:

```powershell
npm install
```

4. Start in development:

```powershell
npm run dev
```

Default port is `4000`.

## Stored bug reports

Bug reports are persisted to:

```text
backend/data/bug-reports.json
```

The backend stores every report before attempting email delivery. If email fails, the report still remains stored.

Set `DATA_DIR` if you want storage outside the repo path, for example on a mounted Render disk.

## Free database option

This backend now supports Turso as an optional hosted database.

If these env vars are set:

```text
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

bug reports are stored in Turso instead of the local JSON file.

If Turso is not configured, the backend falls back to file storage in `DATA_DIR`.

## Admin report access

List recent reports:

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Headers @{ "x-admin-key" = "your_admin_key" } `
  http://localhost:4000/api/admin/bug-reports
```

List recent alert events:

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Headers @{ "x-admin-key" = "your_admin_key" } `
  http://localhost:4000/api/admin/alerts
```

Read mobile remote config:

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Headers @{ "x-admin-key" = "your_admin_key" } `
  http://localhost:4000/api/admin/config/mobile
```

Update mobile remote config:

```powershell
Invoke-WebRequest -Method Put -UseBasicParsing `
  -Headers @{
    "x-admin-key" = "your_admin_key"
    "Content-Type" = "application/json"
  } `
  -Body '{"releaseStage":"beta","alertSyncEnabled":true}' `
  http://localhost:4000/api/admin/config/mobile
```

## Deploy

This backend is suitable for Railway or Render.

- Start command: `npm start`
- Build command: `npm run build`
- Root directory: `backend`

### Render

- Root directory: `backend`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/health`
- Persistent disk mount path: `/var/data/muleops`
- Set `DATA_DIR=/var/data/muleops`

If you enable Turso, you can keep `DATA_DIR` as a fallback only and your primary storage will be the hosted database.

### Railway

- Root directory: `backend`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/health`
- Set the same env vars as `.env.example`

Railway does not provide the same simple mounted disk flow as Render, so if you want persistent server-side report history there, plan to move bug report storage to a real database next.
