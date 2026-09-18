# Step 1 — Name the startup

The name threads through everything later (package name, Supabase/Vercel project names, the
Autumn account, OAuth app name, email `from`), so capture it first and persist it.

1. Ask the user for the startup name if they haven't given it. Keep it a plain conversational
   question — names are free-form.
2. Derive identifiers and confirm them before saving:
   - `name` — display name exactly as given (e.g. `Acme Analytics`)
   - `slug` — lowercase, hyphenated, safe for package names and project refs (e.g. `acme-analytics`)
   - `domain` — ask if they have one; leave empty if not (it decides the email provider in Step 4
     and the production URL in Step 6)
3. Persist to `startup.config.json` at the repo root so later steps and later sessions can read it:

   ```json
   {
     "name": "Acme Analytics",
     "slug": "acme-analytics",
     "domain": "",
     "createdStep": "naming"
   }
   ```

   If the file already exists, read it and confirm/update rather than overwriting silently.
4. Update the `name` field in `package.json` to the slug (it currently reads `startup-boilerplate`).

Once saved, tell the user the name is locked in and move to Step 2.
