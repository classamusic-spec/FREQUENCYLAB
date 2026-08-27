# Accessibility

Not an afterthought and not a checklist item — several of these constraints
shaped the components themselves.

## Text

Every string goes through one `Text` primitive with `allowFontScaling` on and a
1.6× cap. Layouts use flexible rows and wrapping rather than fixed heights, so
larger type reflows instead of clipping.

Readouts use tabular figures and fixed integer padding, which keeps a live value
from shifting the layout as it changes — a legibility win before it is an
aesthetic one.

## Screen readers

- The rotary encoder is `accessibilityRole="adjustable"` with min, max, current
  value and a spoken text form (`"7.830 Hz"`), plus increment, decrement and
  activate actions. Activate opens numeric entry.
- `ParameterControl` and the mini layer controls expose the same adjustable role
  and actions.
- `SessionRing` is a `progressbar` with a label that reads the progress and the
  live beat.
- Visualisers are `image` with a description of what they show, rather than
  being silently unlabelled decoration.
- Automation points are buttons with a hint describing drag and long-press.
- The tab bar transport announces the running protocol.
- Safety notices are `alert`.

## Alternatives to gestures

**Every rotary control has a numeric path.** Tapping the encoder or a parameter
value opens a keypad sheet with the valid range stated. Nothing in the product
can only be set by dragging.

Timeline stage reordering uses explicit ◀ / ▶ buttons rather than a drag-only
interaction. Stage duration can be typed as well as dragged.

## Colour

Status is never colour alone:

- evidence badges carry the rating **text** beside the dot;
- the selected segment in a `SegmentSelector` has a raised cap, a brighter type
  tone and an indicator bar;
- the signal meter uses segment position as well as colour;
- automation lanes label themselves; disabled lanes read "Disable"/"Enable".

Text tones are `#EDF1F5` primary and `#96A0AD` secondary on a `#141820` panel —
both comfortably above 4.5:1. Tertiary `#5C6673` is reserved for engraved labels
and supporting captions, never for content a user must read to act.

## Motion

`useReducedMotion` reads both the OS setting and the in-app preference; either
one wins. Reduced motion removes movement rather than shortening it: the encoder
stops scaling under press, and stack transitions become `none`.

## Touch targets

44 points minimum, enforced in the components. The automation point handle is a
44-point invisible circle over a 4.5-point drawn dot, so the target is large
while the graphic stays small enough not to obscure the curve.

## Haptics

Rate-limited so they inform rather than buzz, and fully disableable — the app
never depends on haptics to convey state.

## Not yet done

- Full VoiceOver and TalkBack passes on device.
- A high-contrast variant.
- Localisation. All strings are inline English; extracting them is a prerequisite.
