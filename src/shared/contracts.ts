/**
 * Shared engine contract types for Harness.
 *
 * These mirror the subset of `server/contracts.ts` from BotFleet that the
 * driver / bridge code in this repo needs.  The canonical definitions live in
 * BotFleet (the harness runtime); this file is a *type-level* re-export so
 * Harness's own code can typecheck in isolation.
 *
 * BotFleet's `wireHarnessContracts()` (called once at app boot) does the
 * runtime replacement via `setContracts()`.  Until that wire-up happens, the
 * types below are the source of truth and the runtime stubs throw.
 */

export type EffortLevel = "none" | "low" | "medium" | "high" | "max";

export interface ModelCatalog {
  default: string;
  options: Array<{ id: string; label: string; contextWindow?: number; custom?: boolean }>;
}

export type ProviderErrorCode =
  | "invalid_credentials"
  | "inactive_subscription"
  | "quota_or_region_restriction"
  | "upstream_outage"
  | "model_catalog_outage"
  | "unknown";
