# Upload this project to GitHub

1. Extract `formula-foundation-source.zip` on your computer.
2. Create an empty **private** GitHub repository for this personal-use project.
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

At export, **443 offline tests** and **184 actual PostgreSQL integration tests** passed. Prisma format/validate/generate, typecheck, lint and production build passed. This export includes the private-use real-life identity pass and Phase 12A real-circuit Race viewer. All ten migrations, the schema and simulation source remain unchanged. See `docs/private-use-naming-report.md` and `docs/phase-12a-report.md` for scope, exact checks and screenshots.

Run `npm run db:seed` against your development database to update source identities. Existing Career snapshots are not renamed; new Careers use the updated source names. This delivery requires no new migration. Nothing has been uploaded or published for you.
