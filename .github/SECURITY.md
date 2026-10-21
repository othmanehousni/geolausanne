# Security policy

Please report vulnerabilities **privately**: use GitHub's "Report a
vulnerability" button in the repository's Security tab. Do not open a public
issue for security problems.

Useful to include: what an attacker can do, the steps or request that show it,
and the commit you tested.

In scope: the web app (`apps/web`), the database functions and row-level
security (`supabase/`), the deployment workflows (`.github/workflows`) and the
geodata pipeline (`pipelines/geodata`). Only the `main` branch is supported.

The security model is described in
[`docs/backend/data-model.md`](../docs/backend/data-model.md#security-model)
and [`docs/backend/auth.md`](../docs/backend/auth.md).
