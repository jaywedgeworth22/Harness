# Profiles

Tracked cordis profile defaults.  Each profile is a fully independent cordis
tree (bundles + empty entry list + patch layer).  Four canonical profiles
ship in this repo:

| Profile | Bundles | Use case |
|---|---|---|
| `dsh-headless/` | `dsh-base` + `dsh-headless` | DeepSeek Harness headless (phone, Shellular spawn) |
| `dsh-web/` | `dsh-base` + `dsh-web-app` | DeepSeek Harness web UI on `:3080` |
| `mmh-headless/` | `dsh-base` | MiniMax Harness headless (phone, Shellular spawn) |
| `mmh-web/` | `dsh-base` + `dsh-web-app` | MiniMax Harness web UI on `:3081` (future) |

## Sync

`scripts/sync-profiles.ts` copies each profile directory to
`~/.dsh/profiles/<name>/` and writes the matching `~/.dsh/settings-<name>.yaml`
when present.  Run via `npm run sync` after every `npm ci` and every
profile change.

A per-machine override file (`~/.dsh/profiles/<name>/local.patch.yml`) wins
over the tracked default — the cordis patch loader applies the cascade in
order: bundles → tracked patch → local patch.

## Per-profile feature depth

The matrix is open-ended.  Any profile may independently:

- Disable plugins (`disabled: true`)
- Override plugin config (`thinking`, `reasoningEffort`, `model`)
- Set turn budgets (in the bridge file, not the cordis patch — bridges
  read env, profiles set up the engine)
- Set tool allowlists (in the registry, not the cordis patch — registry
  is the consumer-side gate)
- Pin a model for that profile only

The four shipped profiles are starting points, not final configurations.
Operators tune the matrix on each machine.

## Adding a profile

```bash
mkdir -p src/profiles/<engine>-<use-case>
# Copy cordis.yml + cordis.patch.yml + package.json + pnpm-workspace.yaml
# from the closest existing profile
# Edit package.json to set the bundle list
# Edit cordis.patch.yml to set the patch layer
# Add settings-<name>.yaml if the profile needs a settings override
```

Then `npm run sync` to push it to `~/.dsh/profiles/`.  Restart any pm2 job
that uses the new profile so the cordis patch loader picks it up.
