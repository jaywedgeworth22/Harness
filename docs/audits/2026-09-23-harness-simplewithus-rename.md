# 2026-09-23 — Harness macOS Bundle ID Rename to `com.simplewithus.harness.mac`

> Author: [MINIMAX] seat, `minimax/simplewithus-rename` branch on
> `jaywedgeworth22/Harness`.  Closes Jay's 2026-09-23 consumer-rebrand
> ticket (bundle id, empty-state whale, top-left header gap).

## Context

On 2026-09-23 Jay reported four `Harness.app` issues in one shot:

1. **Bundle id must move from `services.jays.harness` to
   `com.simplewithus.harness.mac`.**  Ownership of the product is
   transferring from a personal domain (`services.jays.*`) to the
   consumer brand at `simplewithus.com` (which already resolves to
   Cloudflare IPs `104.21.42.208` and `172.67.166.74`).  The matching
   marketing page will live at `harness.simplewithus.com` (NXDOMAIN as
   of 2026-09-23 — the Cloudflare DNS zone for `simplewithus.com` does
   not yet carry a `harness` record).
2. **The DeepSeek whale still renders centered in the conversation
   empty state** ("Into the Unknown").  This glyph lives in the
   upstream `@deepseek-ai/dsh-client-ui-conversation` skeleton
   (`EmptyHero.HeroFish`, CSS-module class `pXSMma_fish` /
   `pXSMma_fishHitbox`).  Harness does not fork upstream DSH, so the
   fix has to land in the consumer CSS layer that the WKWebView already
   injects (`HarnessWindow.swift`'s `css` block).
3. **Top-left blank area where the sidebar whale used to be.**  The
   MM + DS + HARNESS co-brand header that commit #7 introduced sits
   inside a sidebar row whose original height accommodated the
   24 px whale SVG; once the SVG is hidden via the existing rule, the
   upstream `brandMark` wrapper leaves a residual inline-flex gap.
4. **(Already fixed earlier this session.)**  Fleet Recall preset
   crashed at tool registration with `tool "undefined" must declare
   output { schema, render, presentationMeta? }` because
   `~/.dsh/.agent-presets/fleet-recall/plugins/fleet-recall-tools.mjs`
   called `ctx.tools.register(name, definition)` (two-arg form) instead
   of `ctx.tools.register(definition)` (one-arg, defined-tool form).
   Three call sites at lines 85, 121, and 143 now use the one-arg form.
   This audit does not touch that file.

## What Shipped This Pass

### 1.  Bundle ID Rename

Every `services.jays.harness` literal in the worktree is replaced with
`com.simplewithus.harness.mac`.  Five sites in five files plus the
Swift `NSWindow.setFrameAutosaveName` argument (which must follow the
same reverse-DNS pattern or the saved frame is silently dropped):

- `scripts/install-dock-app.sh` — `CFBundleIdentifier` value at line 63
  plus the history comment block at lines 4-9 (newest first, all three
  historical ids preserved).
- `scripts/open-harness.sh` — header comment at line 4.
- `src/web/install-dock-app.ts` — header comment at line 4.
- `src/web/open-harness.ts` — header comment at line 4.
- `src/web/dock-app/HarnessWindow.swift:109` — autosave name changed
  from `"ServicesJaysHarnessMain"` to `"ComSimplewithusHarnessMacMain"`.

The audit trail lives in `docs/bundle-id-history.md` (new file this
pass); the README's `## Marketing page` section is updated to
"`harness.simplewithus.com` (TBD)" so the next operator sees where the
DNS work belongs.

### 2.  Strip the Empty-State Whale

`HarnessWindow.swift`'s `css` block already hid the upstream sidebar
whale SVG.  This pass extends it with two new rules that target the
empty-state fish by CSS-module suffix (so they survive an upstream
class-name re-hash):

```css
[class*="_fishHitbox"], [class*="_fish"]:not([class*="brandMark"]):not([class*="railMark"]) {
  display: none !important;
}
```

`pXSMma_fishHitbox` is the `<span>` that wraps the 34 px `HeroFish`
SVG and its hover-swim animation; hiding it removes the glyph entirely
without touching the `pXSMma_titleGroup` sibling that carries the
"Into the Unknown" headline.  The `:not(...)` clauses deliberately
keep `brandMark` and `railMark` (which carry "fish" in the parent
context) untouched — the existing rules already strip their inner SVG.

### 3.  Tighten the Top-Left Header

Two new rules close the post-whale gap:

```css
[class*="_brandMark"]  { display: none !important; }
[class*="_brandIdentity"] { gap: 0 !important; }
[data-harness-ds]      { margin-right: 4px !important; }
```

`brandMark` is the upstream `inline-flex` wrapper whose only purpose
was hosting the whale SVG; hiding it lets the row collapse.  The
`brandIdentity` `gap: 8px` between `brandMark` and `brandName` is
zeroed out (single remaining child, so the gap has no visible effect
once the wrapper is gone).  The DS chip's right margin is tightened
from 6 px to 4 px so the `[MM][DS] HARNESS` row reads as one cluster
instead of two.

## Verification

```
$ cd ~/apps/harness-mm-simplewithus-rename
$ git grep -nE 'services\.jays\.harness'
scripts/install-dock-app.sh:8:#   2026-09-19 — services.jays.harness (interim owner-personal id).
$ git grep -nE 'ServicesJaysHarnessMain'
(no matches)
$ git grep -nE 'com\.simplewithus\.harness'
scripts/install-dock-app.sh:5:#   2026-09-23 — com.simplewithus.harness.mac (consumer rebrand; ownership
scripts/install-dock-app.sh:63:  <key>CFBundleIdentifier</key><string>com.simplewithus.harness.mac</string>
scripts/open-harness.sh:4:# `com.simplewithus.harness.mac`.
src/web/install-dock-app.ts:4: * `scripts/install-dock-app.sh` (bundle id `com.simplewithus.harness.mac` so
src/web/open-harness.ts:4: * On-disk name is `Harness.app`; bundle id `com.simplewithus.harness.mac`.

$ pnpm typecheck
> tsc --noEmit
(clean)

$ bash scripts/install-dock-app.sh
installed /Users/jay/Applications/Harness.app

$ /usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" \
    ~/Applications/Harness.app/Contents/Info.plist
com.simplewithus.harness.mac
```

Manual visual checks (post-merge, post-`bash scripts/install-dock-app.sh`):

- Sidebar top-left shows `[MM logo][DS] HARNESS` flush; no residual
  gap above, below, or between the marks.
- New-conversation screen centers "Into the Unknown" + "Preview" badge
  with the whale SVG gone; the rest of the empty state (workspace
  chip, composer, etc.) is unchanged.
- Dock pin and saved window frame are dropped after the rename — the
  install script's `dockutil` block re-pins `Harness.app` automatically,
  but the frame's saved geometry is lost (same caveat the 2026-09-19
  rename carried).

## Rollback Plan

`git revert` the merge commit on `main`, then re-run `bash
scripts/install-dock-app.sh` to rewrite the live `.app`'s
`Info.plist`.  Saved window frame and Dock pin WILL be lost on the
revert, identical to the 2026-09-19 rename that this audit supersedes.
No persisted state outside macOS's per-bundle-id sandbox is touched.

## Future Work

- **Apple Developer portal registration for
  `com.simplewithus.harness.mac`.**  The current `.app` is ad-hoc
  signed via `codesign --force --deep -s -`; a Developer ID
  Application identity under the new bundle id is the next step before
  notarization and outside-Mac distribution.
- **`harness.simplewithus.com` marketing page.**  Add a CNAME
  (`harness` -> the BotFleet / Harness static host), a Cloudflare DNS
  record, and the consumer-facing page.  Out of scope for this audit.
- **iOS variant of Harness.**  Jay raised it as a future item; the
  bundle-id naming rule (`com.simplewithus.harness.<platform>`) and
  the Swift `extraStyle` consumer-CSS pattern carry over without
  modification.

## Resolves

- Bundle id rebrand ticket (board filed as P2 if not already present
  on `https://mac.jays.services/board`).
- Empty-state whale regression (commit #6/#7 left the sidebar whale
  hidden but missed the `HeroFish` glyph).
- Top-left header gap regression from commit #7's MM + DS + HARNESS
  co-brand block.