# Generated game artwork

## Scope and selection

Use `scummvm-shell/games.json` as the bundled catalog. A request for the remaining
bundled games excludes personal imports, supported engines and unbundled titles.
Share artwork across editions; keep platform/language metadata separate and demo
titles ending in `(Demo)`. Generate heroes or covers only as requested.

Run the read-only inventory from the repository root:

```sh
node .codex/skills/scummweb_game-assets/scripts/inventory-bundled.mjs
node .codex/skills/scummweb_game-assets/scripts/inventory-bundled.mjs --role hero --missing
node .codex/skills/scummweb_game-assets/scripts/inventory-bundled.mjs --role cover --missing
node .codex/skills/scummweb_game-assets/scripts/inventory-bundled.mjs --needs-apply
```

The tracked `data/generated-artwork.json` registry is authoritative for whether
ScummWEB creatively generated an image. Filename hints alone do not establish
provenance. The inventory resolves live presentation mappings through the R2
manifest and checks matching local/published bytes against registered hashes.
It reports applied generated art separately from saved candidates. `--missing`
selects roles with neither applied generated art nor a saved candidate, avoiding
duplicate generation. `--needs-apply` lists saved candidates whose live mapping
is still original/unknown. If asked to replace all currently non-generated art,
reuse matching saved candidates before generating new ones. Missing or changed
candidate bytes must be reported and recovered, not treated as available.

## Reference hierarchy

1. Resolve the existing original hero/banner through `data/artwork-storage.json`
   and inspect its bytes. Existing composites may contain a logo, inset screenshot
   or blurred fill: use the underlying original illustration, not that layout.
2. If no usable original hero exists, use official box art/key art or other
   official promotional material. For card covers, the actual original box front
   is mandatory and is the primary reference; promotional art or a generated hero
   is not a substitute for it.
   Preserve the game-specific illustration medium rather than imposing a shared
   style on every title.
3. Search official developer/publisher material when needed, retaining exact URLs
   and credits. A scan hosted by an archive is still original box art; identify
   the host honestly rather than calling it the publisher. If no trustworthy
   original artwork exists, report the reference gap rather than inventing one.

Load local references with `view_image` before giving their paths to imagegen.
Distinguish reference art from an edit target in the prompt. Previously generated
art can guide an approved revision, but retain the original reference chain.
Do not use gameplay screenshots as edit targets or generate substitute captures.

## Composition and dimensions

Inspect current `.hero-stage`, `.hero-backdrop-image`, gradients, copy placement,
and `.poster-grid .poster-card` in `app/styles/home-shell.css`. A responsive hero
has no single viewport size; verify representative desktop and narrow layouts.
Current export defaults are **1600 × 960 (5:3)** for a hero and **900 × 1200 (3:4)**
for a portrait card cover. Re-evaluate these defaults if the consumer changes.
Choose and record the exact delivery dimensions before generating.

Hero prompt requirements:

- Faithful original character identity, clothing, faces, palette, medium and mood.
- Quiet, naturally dark, low-detail left roughly 42% for the real white title,
  summary and green Play button. Place main subjects on the right with faces and
  important hands/emblems safely inset; avoid critical detail at the far edges.
- Allow roughly 9% quiet space at the top for navigation and 12% at the bottom
  for the fade. Check the actual cover crop rather than assuming those guides
  guarantee a mobile composition.
- Full-bleed illustration; remove embedded game-title typography, logos, borders,
  signatures, watermarks, screenshot insets and UI. The application renders copy.

Cover prompt requirements:

- **All box art must regenerate the original box front to improve quality.**
  This is a restoration/recreation task, not an opportunity to design a new cover.
  Use the original front as the primary image input and preserve its composition,
  character designs, palette, original title lettering, logos and publisher
  credits. Do not replace a minimalist original cover with character art from
  a banner, even when that banner belongs to the same game.
- Improve resolution, line clarity, typography legibility and print fidelity;
  remove scan borders, skew, blur, scratches and non-original distributor/retailer
  stickers. Keep intentional illustration texture and the original design.
  Reproduce title text verbatim; inspect spelling and distinctive letterforms.
- Render the flat front face only, without a 3D mockup, spine or added badges.
  Fit the live card ratio with minimal neutral margin adjustments when necessary;
  do not crop away the original title/artwork or rearrange the layout to force a
  ratio. If faithful fit or sufficient source resolution is unavailable, report
  the limitation instead of inventing a substitute design.
- Verify important original artwork, typography and credits survive the card's
  hover zoom. Screenshots remain original and outside this generation workflow.

The hero-specific ban on baked-in lettering/logos applies only to heroes. It must
never be applied to original box-front regeneration. The original box front
takes precedence over the title already supplied by the card UI.

Use the `imagegen` skill and built-in tool, one call per image; no CLI fallback
without the authorization required by that skill. Prompt for the chosen ratio and
sufficient native resolution. Inspect every output and read decoded dimensions.
The generator has returned 1619 × 971 despite a 1920 × 1152 prompt, and once
returned an ultrawide 3:1 image: never infer dimensions from the prompt.

Normalize a sufficiently large, correctly composed result to the exact chosen
export size with the installed Sharp encoder, without upscaling. A negligible
edge trim to normalize rounding is acceptable; do not stretch or use a destructive
crop to rescue the wrong composition. For a materially wrong ratio, missing
headroom or insufficient native resolution, ask imagegen to correct that one
issue, inspect again, and then export. If repeated correction fails, report the
limitation rather than marking the dimension gate passed. Keep the generated
master privately and record both master and export hashes/dimensions.

## Naming and provenance

New logical source filenames follow:

```text
<game-slug>-scummweb-generated-YYYY-MM-DD-r<N>-hero.webp
<game-slug>-scummweb-generated-YYYY-MM-DD-r<N>-cover.webp
```

Use the actual generation date, not the publication date; increment the revision
for another generation of that game/role/date. Keep `-hero`/`-cover` at the end:
the current optimizer and poster generator require role suffixes there. Normal
format/size derivatives retain the same stem. R2 object paths still add their
content hash. Do not rename already mapped assets just to retrofit this convention.

Registry version 1 has an `assets` array. Each entry records:

- `target`: stable catalog target; `role`: `hero` or `cover`; `asset`: logical
  `/launcher/...webp` source path; `generatedOn`: actual ISO date; `generator`.
- `master`: generated master's `sha256`, `width`, `height`.
- `targetSize`: chosen exact `width` and `height`; `deliveryOptimized`: whether
  the published delivery optimization and verification gates have passed.
- `output`: source export's `sha256`, `width`, `height`, `format`, `quality`,
  `effort`; `stage`: `preview` or `ready`. A ready export passed exact dimensions,
  visual checks and delivery optimization. Early previews may have nonfinal
  dimensions/encoding and must remain explicitly marked preview.
- `references`: original logical paths or exact source URLs, with hashes and
  credits when known. Preserve inherited provenance; never claim generated art
  is official. Use `prompt` for the exact generation prompt and revision prompts;
  `promptSummary` is permitted for earlier work whose full prompt was not retained.

Keep every revision; don't infer active state from a manually maintained flag.
The live presentation mapping plus matching bytes determines whether a revision
is applied. Existing `*-hero-v2.webp` previews from the initial run are registered
under their original names. Their 1619 × 971, WebP quality 90 exports are previews,
not evidence that the final dimension/optimization gates passed.

When finalizing a legacy preview whose name lacks the required role suffix,
export from its master under the dated convention and add a registry record for
that export, preserving the actual generation date and the earlier record. This
enables the existing optimizer without renaming a live preview or pretending the
encoding step was another creative generation.

For previews store an export copy under ignored
`.internal/evidence/generated-artwork/<source-filename>` so inventory can verify
availability; keep masters and per-run evidence under ignored `.internal/evidence/`.
Local applied or
upload inputs use ignored `scummvm-shell/launcher/`. Keep the registry and source
credits in Git, but do not commit binaries, private prompts containing local
context, temporary paths or browser evidence. Public provenance must be portable.

## Encoding and R2 publication

Follow [Delivery encoding and sizing](../../../../docs/maintaining-scummweb.md#delivery-encoding-and-sizing)
and the skill's publishing procedure. Preserve a master outside Git and export
promotional WebP at **quality 80, effort 6** from that master, at the verified
target size. Do not repeatedly transcode a lossy preview. Generate poster
renditions with `pnpm run generate:artwork` and inspect the small-card result.

The current optimizer reads only registered, published source records. For new
names use two publication passes, with the same dedicated
`SCUMMWEB_ARTWORK_WORKSPACE` slug throughout:

1. Prepare the verified source export and poster renditions; plan, publish and
   activate their immutable objects under the existing authorization/credential
   rules. Preserve old live mappings until replacement objects are verified.
2. Run `pnpm run optimize:artwork` against those published originals. It creates
   responsive WebP sizes without upscaling and evaluates AVIF at quality 70/60,
   effort 6, 4:4:4 chroma. Accept AVIF only with ≥10% savings, RGB PSNR ≥35 dB,
   visual inspection and complete coverage of the WebP width set. Keep WebP if
   those gates fail. Do not force AVIF or rerun encoders during normal builds.
3. Plan/publish/activate the optimized delivery map, switch the intended logical
   presentation mapping, verify direct R2 loads in Brave and run relevant checks.
   Retire only verified inputs under the existing guarded retirement procedure.

Source publication alone is not completion of delivery optimization. If a
credential route blocks publication, finish local reviewable work, retain
`stage: preview`, and report the blocked step without bypassing credential policy.
Generation or local application does not itself request publication or deployment.

Screenshot originals stay untouched throughout. Lossless full-size conversions
must match decoded source pixels; smaller lossless variants retain original
framing. Encoding/resizing is not creative generation and must never add a
screenshot to this generated-artwork registry.
