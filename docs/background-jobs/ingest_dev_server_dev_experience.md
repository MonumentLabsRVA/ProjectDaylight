# Inngest Dev Server: One-Command Local Setup

*Created: December 8, 2025*

This doc explains how running `npm run dev` automatically starts **both** the Nuxt app and the **Inngest dev server**, and how the wiring works under the hood.

## How to Run Everything Locally

From the `src` directory:

```bash
cd src
npm install      # first time only
npm run dev      # Nuxt + Inngest dev server
```

What happens when you run `npm run dev`:

- Nuxt dev server starts on `http://localhost:3000`
- Inngest dev server starts via `inngest-cli` and connects to `http://localhost:3000/api/inngest`
- Inngest dashboard is available at `http://localhost:8288`

You can stop both with a single `Ctrl+C` in that terminal.

## The NPM Scripts

All of this wiring lives in `src/package.json`:

```jsonc
{
  "scripts": {
    "predev": "pkill -f 'inngest-cli.*dev' || true",
    "dev": "concurrently -n nuxt,inngest -c blue,magenta \"nuxt dev\" \"npx inngest-cli@latest dev -u http://localhost:3000/api/inngest\"",
    "dev:nuxt": "nuxt dev",
    "dev:inngest": "npx inngest-cli@latest dev -u http://localhost:3000/api/inngest"
  }
}
```

### `predev`: Cleaning Up Old Inngest Processes

When you run `npm run dev`, NPM automatically runs the **lifecycle script** `predev` first.

```bash
pkill -f 'inngest-cli.*dev' || true
```

What this does:

- Uses `pkill` (macOS/Linux) to kill any existing `inngest-cli ... dev` processes
- The `-f` flag matches on the full command line, so it catches `npx inngest-cli@latest dev ...`
- `|| true` ensures that if nothing is running (or `pkill` fails), the command still exits successfully and the dev script continues

This is what makes the experience **seamless**: you can restart `npm run dev` as much as you want without accumulating zombie Inngest processes.

### `dev`: Nuxt + Inngest via `concurrently`

```bash
concurrently -n nuxt,inngest -c blue,magenta \
  "nuxt dev" \
  "npx inngest-cli@latest dev -u http://localhost:3000/api/inngest"
```

Key points:

- `concurrently` runs both commands in one terminal, prefixing logs with names:
  - `nuxt` (blue) — the Nuxt dev server
  - `inngest` (magenta) — the Inngest dev server
- `npx inngest-cli@latest dev` pulls the latest `inngest-cli` if it is not installed
- `-u http://localhost:3000/api/inngest` points the CLI to our Inngest handler route

You still have the option to run them separately if you want:

```bash
npm run dev:nuxt
npm run dev:inngest
```

## How Inngest is Wired into the App

The Inngest HTTP handler is exposed at `GET/POST /api/inngest` via `src/server/api/inngest.ts`:

```ts
import { Inngest } from 'inngest'
import { serve } from 'inngest/h3'
import { eventHandler } from 'h3'
import { inngest } from '../inngest/client'
import { testJob, journalExtractionFunction } from '../inngest/functions'

const handler = serve({
  client: inngest,
  functions: [
    testJob,
    journalExtractionFunction
  ]
})

export default eventHandler(handler)
```

The `inngest-cli` dev server proxies all incoming events and function invocations to this route while exposing a local dashboard on port `8288`.

## Troubleshooting

- **Inngest dashboard not available**
  - Check that the `inngest` process is running in the `npm run dev` terminal output
  - If it crashed, you can run `npm run dev:inngest` separately to see more detailed errors
- **Port conflicts on 3000 or 8288**
  - Make sure you dont have another Nuxt or Inngest dev server already running
- **Non-Unix environment**
  - `pkill` is a Unix tool. The `predev` script is designed for macOS/Linux (our primary dev target). On Windows without WSL, you may need to manually stop any lingering `inngest-cli` processes.

Thats the whole setup: one command to run Nuxt + Inngest, with `predev` cleaning up old processes so you dont have to think about it.



