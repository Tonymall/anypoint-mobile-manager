# MuleOps Backend

Thin backend for server-side MuleOps services.

## Current scope

- `GET /health`
- `POST /api/bug-reports`
- `GET /api/admin/bug-reports`

The mobile app should call this backend for bug reporting so the EmailJS private key stays server-side.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in the EmailJS values
3. Set `ADMIN_API_KEY` if you want to read stored reports
3. Install dependencies:

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

## Admin report access

List recent reports:

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Headers @{ "x-admin-key" = "your_admin_key" } `
  http://localhost:4000/api/admin/bug-reports
```

## Deploy

This backend is suitable for Railway or Render.

- Start command: `npm start`
- Build command: `npm run build`
- Root directory: `backend`
