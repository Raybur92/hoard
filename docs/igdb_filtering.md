# Hoard — IGDB Upcoming Feed: Filtering Strategy

## Problem

IGDB's database is comprehensive but undiscriminating. Without filtering, the upcoming releases feed is flooded with asset flips, student projects, abandoned early access titles, and mobile shovelware. This document defines the filtering strategy to be implemented on the backend.

---

## Filtering layers

### Hard filters — always applied, non-negotiable

**Category whitelist**
Only return games of the following IGDB categories:

| Value | Label |
|---|---|
| `0` | Main game |
| `2` | DLC / Expansion — shown in main feed, marked with a `DLC` label |
| `8` | Remake |

Exclude all others explicitly:

| Value | Label | Reason |
|---|---|---|
| `1` | Bundle | Not a release |
| `3` | Standalone expansion | Borderline — exclude for now, revisit |
| `4` | Mod | Not a release |
| `5` | Episode | Too granular |
| `6` | Season | Too granular |
| `7` | Demo | Not a release |

**Hypes threshold**
IGDB tracks how many users have marked a game as anticipated. Default minimum is `hypes > 5`. This single filter removes the bulk of unnoticed shovelware. The threshold is user-configurable via a stepper in Settings → Preferences. Default value is `5`.

**Version deduplication**
Exclude entries where `version_parent` is set. These are edition variants (e.g. "Deluxe Edition", "GOTY Edition") of a game that already appears in the feed as its parent entry.

---

### Soft filters — applied by default, user can relax

**Platform scoping**
Default the feed to games releasing on platforms the user has connected in Hoard. A user with Steam and PS5 should not see Nintendo DS or mobile releases by default.

This is the default, not a hard lock. The user should be able to expand to all platforms via a filter control in the Upcoming screen.

**Rating count floor**
For games that have already released (in case the feed includes recently released titles alongside upcoming ones), require a minimum `total_rating_count` to avoid obscure releases that slipped through the hypes filter.

Suggested minimum: `total_rating_count > 10` when the field is present.

---

## Decisions locked

| Decision | Value |
|---|---|
| Default platform scope | User's connected platforms |
| Show everything toggle | Yes — available in Upcoming filter controls |
| Primary noise filter | `hypes > 5` (default) |
| Hypes threshold | User-configurable via Settings → Preferences, default `5` |
| Category filter | Whitelist: 0, 2, 8 |
| DLC display | Shown in main feed, marked with a `DLC` label |
| Version deduplication | Yes, exclude entries with `version_parent` |

---

## Implementation notes

- All filtering happens server-side in the IGDB API query — do not fetch unfiltered results and filter client-side.
- Cache upcoming results and refresh periodically (suggested: every 24 hours). IGDB has rate limits and upcoming releases don't change by the minute.
- The IGDB query should combine filters using `where` clauses. Example structure:

```
fields name, cover, first_release_date, hypes, platforms, category;
where (category = (2, 8) | category = null)
  & hypes > 5
  & version_parent = null
  & first_release_date > {now}
  & platforms = ({user_platform_ids});
sort first_release_date asc;
limit 50;
```

> **Note:** IGDB omits the `category` field entirely for main games (category 0 is the implicit default). Using `category = (0, 2, 8)` returns zero results because the equality match only fires when the field is present. The correct pattern is `(category = (2, 8) | category = null)` — DLCs/remakes have an explicit value; main games have no field.

- `{user_platform_ids}` should be resolved server-side from the user's connected platform accounts to their corresponding IGDB platform IDs.
- Expose a separate endpoint for the unfiltered/all-platforms variant used when the user disables platform scoping.

---

## IGDB platform ID reference (relevant platforms)

| Platform | IGDB ID |
|---|---|
| PC (Windows) / Steam | 6 |
| PlayStation 5 | 167 |
| PlayStation 4 | 48 |
| Xbox Series X/S | 169 |
| Xbox One | 49 |
| Nintendo Switch | 130 |


