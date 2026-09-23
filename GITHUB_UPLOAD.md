# Upload this project to GitHub

1. Extract `formula-foundation-source.zip` on your computer.
2. Create an empty GitHub repository.
3. Upload the **contents of the extracted `formula-foundation` folder** to the repository root. Upload the source files, not just the ZIP archive.
4. Include hidden configuration files `.gitignore` and `.env.example`. On macOS, Command-Shift-Period shows hidden files in Finder.
5. Never upload a real `.env` file, database credentials, `node_modules`, or `.next`.

The archive contains the complete maintained project source, lockfile, Prisma schema/migration, seed data, translations, tests and documentation. Installed dependencies, generated Prisma client, build output and caches are intentionally excluded; they are recreated by the commands below.

## Run after downloading or cloning

Use Node.js 24 LTS and npm:

```sh
npm ci
npm run dev
```

`npm ci` generates the Prisma client automatically. Open http://localhost:3000. The standalone development dashboard works without PostgreSQL.

## Verify the source

```sh
npm run db:format
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

## Configure PostgreSQL separately

Copy `.env.example` to `.env`, replace its example DATABASE_URL with your own PostgreSQL connection, then run:

```sh
npm run db:migrate
npm run db:seed
```

Use a separate disposable PostgreSQL database for TEST_DATABASE_URL, then run `npm run test:db`. The integration suite creates and removes only its uniquely named test schema.

At export, all **258 offline tests** and **112 actual PostgreSQL integration tests** passed. Prisma format/validate/generate, TypeScript, lint and the production build passed. All six checked-in migrations applied on a disposable local PostgreSQL database; previous migrations remain unchanged. Browser checks covered version-3 creation, real overtakes, DRS, closing gaps, blocked time, exact refresh/language isolation and persisted final classification. See `docs/phase-7-report.md`.
