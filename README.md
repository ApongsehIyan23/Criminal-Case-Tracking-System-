# Criminal Case Tracking System (CCTS) v1.0 Pilot

A bilingual (English and French) web application that replaces paper case ledgers for the preliminary investigation and magistrate transmission stages of a criminal case. It is designed for judicial police stations and the Court of First Instance in the Mfoundi Division, Yaoundé, Cameroon.

**Live application:** https://ccts-seven.vercel.app (accounts are by invitation only)

> This is a pilot build. **Use fictitious data only.** See [Known limitations](#known-limitations).

## Contents

1. [What the system does](#what-the-system-does)
2. [Technology](#technology)
3. [Before you start](#before-you-start)
4. [Step 1: Get the code](#step-1-get-the-code)
5. [Step 2: Install the dependencies](#step-2-install-the-dependencies)
6. [Step 3: Create the configuration file](#step-3-create-the-configuration-file)
7. [Step 4: Set up the database](#step-4-set-up-the-database)
8. [Step 5: Set up email (SendGrid)](#step-5-set-up-email-sendgrid)
9. [Step 6: Set up evidence storage](#step-6-set-up-evidence-storage)
10. [Step 7: Set up database backups](#step-7-set-up-database-backups)
11. [Step 8: Fill in the remaining settings](#step-8-fill-in-the-remaining-settings)
12. [Step 9: Create the tables and the first account](#step-9-create-the-tables-and-the-first-account)
13. [Step 10: Run the application](#step-10-run-the-application)
14. [Step 11: Try the full workflow](#step-11-try-the-full-workflow)
15. [Running the tests](#running-the-tests)
16. [Deploying to Vercel](#deploying-to-vercel)
17. [Troubleshooting](#troubleshooting)
18. [Project structure](#project-structure)
19. [Security notes](#security-notes)
20. [Known limitations](#known-limitations)

## What the system does

| Role | Main tasks |
|---|---|
| System Administrator | Invite users, manage the user directory, read and export audit logs, check system health, create backups |
| Judicial Police Officer | Register cases and participants, track the 48-hour custody timer, upload evidence, transmit cases to the magistrate |
| Examining Magistrate | See analytics and urgent custody alerts, review transmitted cases and evidence, issue a ruling for each suspect |

All roles have sign-in, password reset, a 15-minute session limit, an English/French switch and a help panel.

## Technology

| Part | Tools |
|---|---|
| Frontend (`client/`) | React 19, Vite, Tailwind CSS 4, React Router |
| Backend (`server/`) | Node.js, Express 5, REST API |
| Database | PostgreSQL (Neon) |
| File storage | Neon Object Storage (S3 protocol), files encrypted with AES-256-GCM |
| Email | Twilio SendGrid |
| Hosting | Vercel |

## Before you start

### Software to install

| Software | Version | Needed for | Download |
|---|---|---|---|
| Node.js (includes npm) | 22.13 or later (22 LTS or 24 LTS recommended) | Running and testing | https://nodejs.org |
| Git | Any recent version | Getting the code | https://git-scm.com |
| PostgreSQL | 14 or later (18 was used in development) | **Running the server tests**, or using a local database | https://www.postgresql.org/download/ |

Check what you have:

```bash
node --version
npm --version
git --version
```

### Online accounts

| Service | Used for | Without it |
|---|---|---|
| [Neon](https://neon.tech) | Database, evidence storage, backups | You can use a local database, but evidence upload and backups will not work |
| [SendGrid](https://sendgrid.com) | Invitation, password reset and custody alert emails | Only the administrator can sign in, because new users receive their activation link by email |
| [Vercel](https://vercel.com) | Hosting (optional) | The application still runs on your computer |

To use **every** feature, set up Neon and SendGrid. Menu names on these websites can change over time.

## Step 1: Get the code

```bash
git clone https://github.com/ApongsehIyan23/Criminal-Case-Tracking-System-.git
cd Criminal-Case-Tracking-System-
```

All later commands start from this project folder.

## Step 2: Install the dependencies

The backend and the frontend are installed separately.

```bash
cd server
npm install
cd ../client
npm install
cd ..
```

## Step 3: Create the configuration file

All settings and secrets go in `server/.env`. Create it from the template.

macOS, Linux or Git Bash:

```bash
cp server/.env.example server/.env
```

Windows PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

Open `server/.env` in a text editor. Steps 4 to 8 explain how to fill it in.

- Never commit this file. Git already ignores it.
- Put quotes around any value that contains `#` or spaces.

## Step 4: Set up the database

The application uses **two** database connections:

| Variable | User | Purpose |
|---|---|---|
| `MIGRATION_DATABASE_URL` | Database owner | Creates tables and seed data. Used only by the setup commands |
| `DATABASE_URL` | Restricted user `ccts_app` | Used by the running application. It cannot change or delete audit records |

Choose **Option A** or **Option B**.

### Option A: Neon (recommended)

1. Sign in at https://console.neon.tech and create a project. Choose the region **AWS US East (Ohio)**, which this project uses.
2. On the project dashboard, click **Connect**.
3. Turn **Connection pooling off** and copy the connection string. Paste it as `MIGRATION_DATABASE_URL`.
4. Turn **Connection pooling on** and copy the string again. The host name now contains `-pooler`.
5. Create a long random password for the application user:

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```

6. In the pooled string, replace the user name with `ccts_app` and the password with the one you just created. Keep everything after `@`. Paste it as `DATABASE_URL`:

   ```
   DATABASE_URL=postgresql://ccts_app:YOUR_NEW_PASSWORD@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

**Do not create `ccts_app` in the Neon console.** The setup command in Step 9 creates it with limited rights. Users created in the console receive broad rights, and the setup command will refuse them.

### Option B: A local PostgreSQL database

1. Make sure PostgreSQL is running.
2. Create an empty database (you will be asked for the `postgres` password you chose during installation):

   ```bash
   psql -U postgres -h localhost -c "CREATE DATABASE ccts"
   ```

   If Windows says `psql` is not recognized, run it with its full path, for example `& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE ccts"` in PowerShell, or create the database with pgAdmin.

3. Set both variables. Replace `OWNER_PASSWORD` with your `postgres` password and choose any password for `ccts_app`:

   ```
   MIGRATION_DATABASE_URL=postgresql://postgres:OWNER_PASSWORD@localhost:5432/ccts
   DATABASE_URL=postgresql://ccts_app:CHOOSE_A_PASSWORD@localhost:5432/ccts
   ```

## Step 5: Set up email (SendGrid)

1. Sign in at https://app.sendgrid.com.
2. Go to **Settings > Sender Authentication**. Under **Single Sender Verification**, create a sender with an email address you can open.
3. Open the email SendGrid sends you and click the verification link.
4. Go to **Settings > API Keys > Create API Key**. Choose **Restricted Access** and give **Mail Send** full access.
5. Copy the key (it starts with `SG.`). SendGrid shows it only once.
6. In `server/.env`:

   ```
   SENDGRID_API_KEY=your key
   SENDGRID_VERIFIED_SENDER=the email address you verified
   ```

`SENDGRID_VERIFIED_SENDER` must be the **email address**, not the verification link.

## Step 6: Set up evidence storage

1. In the Neon console, select your project and branch, open **Object storage** and create a bucket named `ccts-evidence`. Keep it **private**.
2. In the project settings, open **Credentials** and create a credential with `storage:read` and `storage:write`. Copy both values; the secret is shown only once.
3. Click **Connect > Storage** and copy the **S3 endpoint**.
4. Create an encryption key:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

5. In `server/.env`:

   ```
   STORAGE_ENDPOINT=the S3 endpoint
   STORAGE_REGION=us-east-2
   STORAGE_ACCESS_KEY_ID=the access key ID
   STORAGE_SECRET_ACCESS_KEY=the secret access key
   STORAGE_BUCKET=ccts-evidence
   EVIDENCE_ENCRYPTION_KEY=the key from item 4
   ```

> **Keep a safe copy of `EVIDENCE_ENCRYPTION_KEY`.** If it is lost or changed, files already uploaded can never be read again.

## Step 7: Set up database backups

This lets the administrator create Neon snapshots from the application.

1. In the Neon console, open **Account settings > API keys** (or the organization's API keys) and create a key. Copy it.
2. Open your project, go to **Settings > General** and copy the **Project ID**.
3. In `server/.env`:

   ```
   NEON_API_KEY=your key
   NEON_PROJECT_ID=your project ID
   NEON_BRANCH_ID=
   ```

Leave `NEON_BRANCH_ID` empty to use the default branch. Neon's free plan limits the number of manual snapshots. If you reach the limit, delete an old snapshot in the Neon console.

## Step 8: Fill in the remaining settings

1. Create the key that signs sessions and password reset links:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   ```
   JWT_SECRET=the generated value
   ```

2. Keep these values for local use:

   ```
   APP_BASE_URL=http://localhost:5173
   PORT=3001
   ```

3. Choose the first administrator account. You will sign in with it. The password must be 8 to 72 characters.

   ```
   SEED_ADMIN_EMAIL=admin@example.com
   SEED_ADMIN_PASSWORD="ChooseAStrongPassword"
   SEED_ADMIN_FULL_NAME="System Administrator"
   ```

   Use a real address you can open if you want to test **Forgot password** for this account. There are no built-in default passwords.

### All settings at a glance

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Application database connection (restricted user) |
| `MIGRATION_DATABASE_URL` | For setup | Owner database connection |
| `JWT_SECRET` | Yes | At least 32 characters |
| `APP_BASE_URL` | Yes | Web address of the application, used in email links |
| `SENDGRID_API_KEY` | For email | SendGrid API key |
| `SENDGRID_VERIFIED_SENDER` | For email | Verified sender address |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET` | For evidence | Object storage connection |
| `EVIDENCE_ENCRYPTION_KEY` | For evidence | 32 random bytes, base64 |
| `NEON_API_KEY`, `NEON_PROJECT_ID` | For backups | Neon API access |
| `NEON_BRANCH_ID` | No | Defaults to the main branch |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_FULL_NAME` | For setup | First administrator |
| `PORT` | No | API port, default `3001` |

## Step 9: Create the tables and the first account

```bash
cd server
npm run db:setup
```

This runs three commands, which you can also run one at a time:

| Command | What it does |
|---|---|
| `npm run migrate` | Creates the tables and the restricted `ccts_app` user |
| `npm run seed:reference` | Adds sample police stations, courts and offense types |
| `npm run seed:admin` | Creates the first administrator |

Expected output includes `Migration complete.`, `Reference data ready: 5 units, 9 offense categories.` and `Created System Administrator ...`. The commands are safe to run again.

If you set up evidence storage, check it:

```bash
npm run check:storage
```

Expected output: `Evidence storage works: encrypted upload and download succeeded.`

## Step 10: Run the application

You need **two terminals**, both opened in the project folder.

Terminal 1 (API):

```bash
cd server
npm run dev
```

Wait for `CCTS API listening on http://localhost:3001`.

Terminal 2 (web app):

```bash
cd client
npm run dev
```

Open **http://localhost:5173** and sign in with the administrator email and password from Step 8.

Press `Ctrl+C` in each terminal to stop. After editing `server/.env`, restart the API.

The screens are designed for desktop browsers (at least 1180 pixels wide).

## Step 11: Try the full workflow

Each account needs its own email address that can receive mail. Sign out before signing in as someone else.

1. **Administrator:** open **System Health and Backups** and check that the items show **OK**.
2. **Administrator:** open **Users and Access**, click **Create Account**, and invite one **Judicial Police Officer** and one **Examining Magistrate**. Click **Send invitations**.
3. **Each new user:** open the invitation email (check spam), follow the link, set a password, then sign in. The link works once and lasts 24 hours.
4. **Police officer:** click **Log New Case** in the sidebar. Enter the incident, add a participant with the role Suspect, tick **Detained in Police Custody**, enter a National ID, then click **Save & Create Case Docket**. The 48-hour timer starts.
5. **Police officer:** upload a JPEG, PNG or PDF as evidence. The total for one case is limited to 500 KB.
6. **Police officer:** open the case, click **Transmit Case to Magistrate**, review the summary and click **Confirm & Transmit**. The case becomes read-only.
7. **Magistrate:** click **Inspect Case**, review the record and evidence, choose a decision, write the ruling notes and click **Issue Digital Mandate**. Confirm it. A ruling cannot be changed.
8. **Police officer:** open the case again to see the returned ruling.
9. **Administrator:** open **Global Audit Logs** to see every action, and export it as CSV.
10. **Any user:** on the sign-in screen, click **Forgot password?** to receive a reset link (valid for 30 minutes).

## Running the tests

The tests never use your Neon database or send real email.

### Backend tests

Requires PostgreSQL installed on your computer (Step 4 is not needed). The test command creates a temporary database server, runs the tests and removes it.

```bash
cd server
npm test
```

PostgreSQL is found automatically on the `PATH`, in `C:\Program Files\PostgreSQL` (Windows) or in `/usr/lib/postgresql` (Linux). If it is elsewhere, for example on macOS, set `PG_BIN` to the folder that contains `initdb`:

```bash
PG_BIN="/path/to/postgresql/bin" npm test
```

Alternatively, set `TEST_DATABASE_URL` to a local database with `test` in its name. **The tests erase everything in that database.**

### Frontend tests

```bash
cd client
npm test
```

### Production build

```bash
cd client
npm run build
```

The built files are written to `client/dist/`.

## Deploying to Vercel

The repository includes `vercel.json`, which builds the frontend and runs the API as a serverless function.

1. **Prepare the production database.** Complete Steps 4 and 9 with the production database settings in your local `server/.env`. Run `npm run db:setup` again whenever a new file is added to `server/db/migrations/`.
2. Push the code to your own GitHub repository (fork this one if needed).
3. In Vercel, click **Add New > Project** and import the repository.
4. Set **Framework Preset** to **Other** and leave **Root Directory** as the repository root. Do not override the build, output or install commands.
5. Under **Environment Variables**, add:
   - `DATABASE_URL` (the pooled `ccts_app` connection)
   - `JWT_SECRET` (create a new one for production)
   - `APP_BASE_URL`
   - `SENDGRID_API_KEY`, `SENDGRID_VERIFIED_SENDER`
   - `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`
   - `EVIDENCE_ENCRYPTION_KEY` (the **same** key as any environment that shares the same stored files)
   - `NEON_API_KEY`, `NEON_PROJECT_ID`

   Do **not** add `MIGRATION_DATABASE_URL` or the `SEED_ADMIN_*` values. The running application does not need them.
6. Click **Deploy**.
7. Copy the real address from the project's **Domains**. Set `APP_BASE_URL` to exactly that address, with no slash at the end, then **redeploy**. A wrong value sends invitation and reset links to the wrong website.
8. Sign in, open **System Health and Backups**, and check that the items show **OK**.

After this, every merge into `main` deploys automatically.

## Troubleshooting

| Problem | What to do |
|---|---|
| `npm error Missing script` | Run the command inside `server/` or `client/`, not the project folder |
| PowerShell says running scripts is disabled | Use `npm.cmd` instead of `npm`, or use another terminal |
| `Missing environment variables` | Check that the file is named `server/.env` and the listed values are filled in |
| `password authentication failed for user "ccts_app"` | `DATABASE_URL` and `MIGRATION_DATABASE_URL` may be swapped, or the password differs from the one used when the user was created. Correct the URL, or reset the role's password with the owner connection |
| `DATABASE_URL must use a different role` | `DATABASE_URL` must use `ccts_app`, not the database owner |
| `could not start: ... address already in use` | Another copy is running. Stop it, or change `PORT` and the proxy port in `client/vite.config.js` |
| Invitation or reset email does not arrive | Check spam, confirm the sender is verified, restart the API, then use **Resend invitation**. **Global Audit Logs** records failed emails |
| Reset email not sent a second time | Wait 2 minutes between requests. Only activated accounts receive reset links |
| Evidence upload fails | Run `npm run check:storage` |
| `PostgreSQL binaries not found` | Install PostgreSQL or set `PG_BIN` |
| Backup limit message | Delete an old snapshot in the Neon console |

## Project structure

```
.
├── api/index.js          Vercel serverless entry point
├── client/               React frontend
│   ├── src/              Pages, components, translations (i18n/)
│   └── test/             Frontend tests
├── server/               Express API
│   ├── db/               SQL migrations and reference data
│   ├── scripts/          Migration, seed and storage check commands
│   ├── src/              Routes, middleware and services
│   ├── test/             Backend tests
│   └── .env.example      Configuration template
├── vercel.json           Deployment configuration
└── Apongseh_Foghang_[Assignment2]_[10262026].pdf   Software requirements specification
```

## Security notes

- Passwords are hashed with bcrypt (cost factor 12) and never stored as text.
- Every route checks the user's role.
- Sessions end 15 minutes after sign-in unless the user chooses **Continue session** in the warning.
- Activation and password reset links work once and expire.
- Audit records and judicial mandates can be added and read, but never changed or deleted by the application.
- Evidence is checked by file content, fingerprinted with SHA-256 and encrypted before storage.
- Cases are never deleted.

## Known limitations

- Uploaded files are **not virus scanned yet**. They are shown as "scan pending".
- There is **no IP address restriction** and **no limit on failed sign-in attempts** yet.
- Custody alerts are calculated while the application is open; nothing is sent while nobody is using it.
- Notifications are by email and in the application. SMS is not included.
- Police stations, courts, offense types and Penal Code references are **sample data** that must be checked against official sources.
- Trial scheduling, sentencing, prison management and appeals are outside version 1.0.
