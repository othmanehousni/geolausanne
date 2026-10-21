# GeoLausanne: overview

GeoLausanne is a voxel ("Minecraft-style") 3D model of the whole city of
Lausanne in which the community maps halal food: anyone can explore, search
and read; members add spots, vote them up or down (a spot that enough people
judge wrong is removed), review them and confirm how they checked the halal
status; moderators handle reports and verify certificates.

## Principles

1. **Real geometry, blocky look.** Terrain, buildings with their roofs, streets,
   trees and the lake come from official Swiss geodata and OpenStreetMap,
   voxelised offline; the city must be recognisable.
2. **Community trust is not certification.** Votes say "this listing is
   right"; only a moderator-checked certificate is shown as verified.
3. **Privacy by default.** No tracking; pseudonyms; location stays on the device.
4. **Accessible.** WCAG 2.2 AA: the 3D map has a keyboard model and a list
   alternative; Base UI primitives everywhere.
5. **Free to run.** Only free tiers; a domain name is the only optional cost.
6. **Everything documented.** Every decision has a record in
   [decisions](decisions/README.md).

## What people can do

| | Without an account | Members | Moderators |
| --- | --- | --- | --- |
| Explore the 3D city (rotate, tilt, zoom, day/night, my location) | ✓ | ✓ | ✓ |
| Search spots, streets, places, postcodes | ✓ | ✓ | ✓ |
| Spots list with filters, spot details, directions, share link | ✓ | ✓ | ✓ |
| Read reviews and halal confirmations | ✓ | ✓ | ✓ |
| Add a spot (tap the map, use the centre or my location; address suggested; duplicates flagged) | | ✓ | ✓ |
| Vote up/down (removal at ≥ 5 downvotes and score ≤ −5) | | ✓ (not on own spots) | ✓ |
| Review with rating, text and a halal confirmation (how it was checked) | | ✓ | ✓ |
| Report a spot or a review | | ✓ | ✓ |
| Change display name | | ✓ | ✓ |
| Moderation console: reports, removed and hidden spots, log; restore, hide, delete, verify certificates, suspend | | | ✓ |

Languages: French (default) and English. Themes: light and dark (dark is
night in the 3D city). Demo mode runs everything in the browser when no
backend is configured.

## Milestones

The blueprint's six milestones ([review](research/blueprint-review.md)):

| | Deliverable | Status | Evidence |
| --- | --- | --- | --- |
| **M1** | Rotatable 3D view with real terrain | ✅ done | `components/world/*`, swissALTI3D terrain in every tile; map controls, keyboard and toolbar |
| **M2** | Flon with voxelised buildings and streets | ✅ done | the committed demo (`apps/web/public/city/flon`, 181 tiles, 11 MB): swissBUILDINGS3D solids by ray parity, OSM streets |
| **M3** | Chunk streaming, LOD, zooming across the city | ✅ done | quadtree LOD with screen-space error and hysteresis, worker decoding, GPU budget ([streaming](architecture/streaming-and-lod.md)); unit tests |
| **M4** | Entire municipality with acceptable performance | ✅ done | 6 482 tiles at 1–8 m, 190 MB served (2.9 GB raw) + horizon; first views 5–10 MB and 56–107 MB of GPU memory ([performance](operations/performance.md)); frame rates still to be measured on real devices |
| **M5** | Clickable places, submissions, map search | ✅ done | pins, panel, deep links, submit flow with reverse geocoding and duplicates, search (spots + swisstopo); end-to-end tests |
| **M6** | Halal confirmations, reviews, moderation, launch | ✅ done in code | reviews with confirmation methods, votes with auto-removal, reports, moderation console, auth, legal pages, CI and deployment workflows; **launch needs the owner's accounts** ([deployment](operations/deployment.md)) |

## What is left for the project owner

These cannot be done from the repository:

* create the Supabase, Cloudflare and Vercel projects and add the secrets
  ([deployment](operations/deployment.md));
* set up a free SMTP provider (magic links) and, optionally, OAuth apps and
  Turnstile;
* decide on a domain (optional);
* make the repository public (the site links to it), or set a contact e-mail;
* name the first admin and moderators;
* test on real phones and with screen readers before announcing the site
  ([testing](operations/testing.md#manual-checks-before-a-release));
* review the open Dependabot pull requests.

## Known limitations

* Frame rates were not measured on real GPUs (the build machine has none).
* swissBUILDINGS3D sheets date from 2015–2020: the newest buildings may be
  missing until swisstopo updates them.
* No photos on spots (storage, moderation and privacy costs on free tiers).
* The 3D scene is not described to screen readers beyond the spot list,
  addresses, and the heading and spot count announced after keyboard moves.
* Vercel's Hobby plan is non-commercial ([ADR 0018](decisions/0018-free-tier-only.md)).

## Where to go next

* Running it: [getting-started.md](getting-started.md)
* How it works: [architecture](architecture/README.md), [pipeline](pipeline/README.md), [backend](backend/data-model.md)
* Why it is this way: [decisions](decisions/README.md), [research](research/README.md)
* Operating it: [operations](operations/deployment.md)
