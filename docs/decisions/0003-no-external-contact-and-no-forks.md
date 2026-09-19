# Decision 0003 — No external contact without owner approval; no forks of other repositories

**Date:** 2026-09-19
**Status:** Accepted (standing rule)
**Author:** [HARNESS]

## Context

When Harness was created as a friendly adaptation of the upstream
DeepSeek Harness (`@deepseek-ai/dsh`), the question of how the new repo
should *relate to* the upstream project came up.  Two related decisions
needed codification:

1. **External contact.**  Should Harness (or any seat working on it)
   submit a PR upstream, file an issue, comment on a discussion, or
   otherwise initiate communication to `deepseek-ai/deepseek-harness`
   (or any other third-party repo / org / service) on the owner's behalf?

2. **Forking.**  Should Harness be created as a GitHub fork of
   `deepseek-ai/deepseek-harness`?  Or as an independent repo that
   consumes the upstream via `npm install` and credits it via in-repo
   attribution?

These are not new questions in the fleet.  BotFleet already has a
relationship to OpenMausBot that follows the *independent repo +
attribution* pattern, and the owner has explicit preferences on this
subject that should be RAG-discoverable to future seats.

## Decision

**1. No external contact.**  No seat working on Harness (or any other
fleet repo) initiates contact with a third-party repository, org, or
service without explicit per-case owner approval.  This covers (non-
exhaustive):

- `gh pr create --repo <other-org>/<repo>` and equivalents
- `gh issue create --repo <other-org>/<repo>`
- Comments on issues, PRs, or discussions in any repo the owner does not
  own
- `gh repo fork <other-org>/<repo>` (forks are a form of contact — they
  create a public artifact the owner is associated with)
- `npm publish` to a registry other than the owner's own
- Any social-media post or email that "represents" the owner to a
  third party
- Any auto-posting bot or webhook that touches an external surface

What is *not* external contact, and is therefore fine:

- Reading public repositories
- Pinning upstream packages via `npm install`
- Referencing upstream repos in code comments, decision records, and
  in-repo documentation (`NOTICE`, README, AGENTS.md)
- Filing in-repo work that documents the relationship (this file is an
  example)

**2. No forks.**  Harness is an *independent* GitHub repository that
consumes `@deepseek-ai/dsh` via `npm install`.  It is not a fork of
`deepseek-ai/deepseek-harness` and never will be.  The relationship is
documented in `NOTICE` and the README "Acknowledgements" section, both
in-repo, neither reaching out to the upstream.

The closest analogue in the fleet today is BotFleet's relationship to
OpenMausBot: BotFleet is its own original repo, not a GitHub fork, and
its README credits OpenMausBot as the spiritual predecessor.  Harness
follows the same pattern.

## Consequences

- Future seats that join Harness find the rule in `AGENTS.md` and can
  cite this decision record from RAG.
- The rule is portable to other fleet repos; the wording is generic
  enough to mirror into BotFleet, ai-fleet-coordinator, and Fleet-OPS
  AGENTS files if the owner chooses.
- The rule does *not* require an explicit owner check for in-repo work.
  Filing a NOTICE file, adding a README Acknowledgements section, or
  pinning a new upstream version are all in-repo work that does not
  reach out to anyone.  Those are fine to do autonomously.
- The rule *does* require owner check for the following situations,
  which a seat should pause and surface:

  - "I found a bug in `@deepseek-ai/dsh` and want to report it upstream."
  - "We should propose a feature to the upstream maintainers."
  - "The license terms are unclear; we should ask upstream."
  - "A security vulnerability in the upstream affects us; we should
    disclose it."
  - "We should fork the upstream because we need a custom build."

  Each of these is a real situation that may warrant external contact,
  but only after the owner reviews the proposed contact in full and
  explicitly agrees.  Standing approval does not exist.

## Related decisions

- 0001 — Bridges stay Python (independent; unrelated to external contact)
- 0002 — ACP core stays in BotFleet (independent; unrelated to external
  contact)
