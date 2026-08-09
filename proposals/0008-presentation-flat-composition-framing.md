# 0008: Presentation Flat-Composition Framing

Status: **draft experimental profile**. This proposal is not a stable
specification and makes no conformance claim.

Depends on
[0002: Experimental Package and Container Profile](0002-experimental-package-profile.md)
and [0004: Embedding and Navigation Handoff](0004-embedding-navigation-handoff.md).

## 1. Purpose

Let a world package DECLARE how a flat (2D-in-3D) composition should be framed in
the viewport, so a generic Browser can keep that composition centered with a
deliberate margin across every viewport, orientation, resize transition, and
content state — without embedding any per-site geometry in the Browser.

## 2. Motivation

A world may present a flat composition (e.g. a pre-reveal homepage showing only a
chat surface and a countdown) that the Browser renders with its own camera. The
Browser cannot know which world-space region is the intended composition, so
absent a declaration it falls back to a default camera and clips or off-centers
the content.

The framing intent is publisher data: only the world knows the world-space bounds
of its composition and how much of the screen it should occupy. Today this can
only be conveyed through non-standard, out-of-band channels (an embed query
parameter), which the Browser must special-case. This proposal makes the framing
a package-owned, validated, declarative field so the Browser stays generic.

This is presentation metadata only. It changes no package byte content and does
not affect package integrity (it lives in the manifest, not the entry module).

## 3. Proposed manifest field

Add an OPTIONAL `composition` object to `presentation` in the world manifest:

```json
"presentation": {
  "backgroundColor": "#ffffff",
  "composition": {
    "frame": { "center": [0, 1.79, -3.78], "width": 5.2, "height": 3.53 },
    "occupancy": { "width": 0.94, "height": 0.82 }
  }
}
```

- `presentation.composition` — OPTIONAL. Absence means the world declares no flat
  framing and the Browser applies its own default (unchanged behavior).
- `frame.center` — a `vector3` (world-space) center of the composition.
- `frame.width`, `frame.height` — finite numbers `> 0`: the world-space extent of
  the composition rectangle that MUST remain fully visible.
- `occupancy.width`, `occupancy.height` — numbers in the open interval `(0, 1]`:
  the MAXIMUM fraction of the corresponding screen axis the composition may fill.
  The guaranteed minimum margin on each axis is `(1 - occupancy) / 2` per side; the
  limiting axis reaches its occupancy exactly and the other axis is looser.

`presentation` remains `additionalProperties: false`; `composition` (when present)
is `additionalProperties: false` with `frame` and `occupancy` required.

## 4. Semantics (generic Browser consumption)

When `presentation.composition` is present, the Browser MUST:

1. Keep `frame.center` at the center of the rendered viewport.
2. Scale the view so the `frame.width` × `frame.height` rectangle is fully visible
   and occupies at most `occupancy.width` of the horizontal axis and
   `occupancy.height` of the vertical axis; the more-constraining axis determines
   the scale, so the other axis gains additional margin.
3. Recompute the framing responsively on every viewport size / orientation change
   (it is not a one-time startup calculation).

The composition rectangle is content-state independent: state changes (e.g. a
countdown reaching different values) MUST NOT alter the declared `frame`.

The Browser MUST validate the field fail-closed (finite numbers, `width/height > 0`,
`0 < occupancy <= 1`) and treat a malformed value as absent or a typed error; it
MUST NOT hardcode any world's geometry.

## 5. Relationship to the embedding handoff (0004)

A transitional implementation may carry the same framing through the embedding
handoff as an out-of-band parameter. Once this field is adopted, the manifest is
the single source of truth and the embedding handoff SHOULD derive framing from
the loaded manifest rather than a separate parameter, so the package owns its
framing data.

## 6. Compatibility and integrity

- Optional and additive: existing manifests without `composition` are unaffected.
- Manifest metadata only: no entry-module or asset bytes change, so package
  integrity (`entry.integrity`) is unchanged by adopting this field.

## 7. Schema

`schemas/experimental/v0/world.schema.json` gains the `composition` property under
`presentation` (see the accompanying schema change).
