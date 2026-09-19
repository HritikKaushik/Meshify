# @meshify/authz

The permission catalog, the built-in roles, and the functions that resolve a
role or an API-key scope list into a set of permissions.

Zero dependencies and no I/O, on purpose: platform-api enforces with it, and the
web app imports the same catalog to decide which controls to render, so the two
can never disagree about what a role may do.

- `permissions.ts` - every permission, with its scope (`org` or `project`) and tier.
- `roles.ts` - the org roles and the built-in project roles, as permission sets.
- `resolve.ts` - role key(s) to effective permissions. An unknown role key resolves to nothing.
- `scopes.ts` - API-key scope grammar (`documents:write`, `documents:*`, `*`, and the legacy `admin` / `read` / `write`).

Adding a permission means adding a catalog entry AND a code check for it; a
permission nothing checks is meaningless. Adding a built-in project role is one
entry in `roles.ts` and needs no migration (`project_memberships.role_key` is
format-checked, not enum-checked).
