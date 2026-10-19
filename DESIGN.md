---
name: "Tactical Air"
description: "An illustrated military field map with an inspectable intelligence notebook."
colors:
  friendly-blue: "#245d78"
  enemy-vermilion: "#a24132"
  report-violet: "#665381"
  cloth-olive: "#3e4b3a"
  ink: "#343e2e"
  muted-ink: "#59664e"
  control-green: "#425c3f"
  notebook-paper: "#f0e9d3"
  map-paper: "#eee6ca"
  toolbar-paper: "#e9e1c7"
  button-paper: "#eee8d2"
  button-hover: "#d9d3bb"
  rule: "#c8c0a4"
  selected-olive: "#46533c"
  selected-paper: "#f5efd9"
  action-olive: "#42573b"
  action-paper: "#f8f0d8"
  overlay-paper: "#f7efd8"
  field-paper: "#f1ead1"
  notes-paper: "#fbfcf6"
  probability-track: "#d8d0b5"
  probability-fill: "#a5a78b"
  history-blue: "#416a7c"
  history-track: "#ddd4b8"
  history-baseline: "#8b8f72"
  cover-earth: "#b0aa85"
  cover-ink: "#444d3b"
  annotation-paper: "#f4ecd5e8"
typography:
  display:
    fontFamily: "\"Barlow Condensed\", sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: ".01em"
  headline:
    fontFamily: "\"Barlow Condensed\", sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: ".01em"
  notebook-title:
    fontFamily: "Kalam, cursive"
    fontSize: "23px"
    fontWeight: 400
    lineHeight: 1.2
  report-title:
    fontFamily: "Kalam, cursive"
    fontSize: "17px"
    fontWeight: 400
  body:
    fontFamily: "\"Source Sans 3\", system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  control:
    fontFamily: "\"Source Sans 3\", system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  label:
    fontFamily: "\"Source Sans 3\", system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: ".04em"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
    fontSize: "10px"
    fontWeight: 400
  metric:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
    fontSize: "18px"
    fontWeight: 400
  canvas-essential:
    fontFamily: "\"Source Sans 3\", sans-serif"
    fontSize: "10px"
    fontWeight: 600
rounded:
  square: "0"
  control: "2px"
  field: "4px"
  notes: "6px"
  experiments: "7px"
spacing:
  fine: "4px"
  tight: "6px"
  compact: "8px"
  control: "10px"
  standard: "12px"
  gutter: "14px"
  roomy: "16px"
  panel: "18px"
  wide: "20px"
  section: "24px"
components:
  button-standard:
    backgroundColor: "{colors.button-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 11px"
  button-standard-hover:
    backgroundColor: "{colors.button-hover}"
  button-action:
    backgroundColor: "{colors.action-olive}"
    textColor: "{colors.action-paper}"
    rounded: "{rounded.control}"
    padding: "9px 20px"
  button-memory:
    backgroundColor: "transparent"
    rounded: "{rounded.square}"
    padding: "0"
  mode-control:
    backgroundColor: "transparent"
    rounded: "{rounded.square}"
    padding: "8px 11px"
    typography: "{typography.control}"
  mode-control-selected:
    backgroundColor: "{colors.selected-olive}"
    textColor: "{colors.selected-paper}"
  notebook-tabs:
    backgroundColor: "transparent"
    rounded: "{rounded.square}"
    padding: "8px 0 10px"
  movement-select:
    backgroundColor: "{colors.field-paper}"
    rounded: "{rounded.control}"
    padding: "7px 25px 7px 8px"
    typography: "{typography.control}"
  notes-field:
    backgroundColor: "{colors.notes-paper}"
    rounded: "{rounded.field}"
    padding: "10px"
    typography: "{typography.control}"
  state-tag:
    rounded: "{rounded.square}"
    padding: "3px 5px"
  notebook-sheet:
    backgroundColor: "{colors.notebook-paper}"
    rounded: "{rounded.square}"
  evidence-row:
    rounded: "{rounded.square}"
    padding: "15px 0"
  probability-bar:
    backgroundColor: "{colors.probability-track}"
    rounded: "{rounded.control}"
    height: "4px"
  briefing-sheet:
    backgroundColor: "{colors.overlay-paper}"
    rounded: "{rounded.square}"
    padding: "22px 24px"
    width: "min(390px, calc(100% - 44px))"
---

# Design System: Tactical Air

## Overview

**Creative North Star: "The Illustrated Field Map"**

Olive cloth frames ivory survey paper, military map counters, graphite contours, and a ruled intelligence notebook. The illustrated terrain supplies the hand-drawn military character; condensed headings announce actions, while handwritten titles connect the map to its reports.

This is a dense operating surface: the battlefield leads, controls sit close to play, and evidence stays inspectable in the notebook. The user-selected world replaces the pale generic dashboard. Paper sheets, thin rules, and restrained physical depth organize the interface without turning every datum into a floating card.

**Key Characteristics:**
- Illustrated terrain with exact, separately drawn collision geometry.
- Blue friendly units, vermilion enemies, and violet report delivery.
- Condensed action headings, handwritten notebook titles, and readable sans-serif controls.
- A large battlefield beside or above a ruled evidence notebook.
- Visible learning changes grounded in actual encounter outcomes.

Recorded from the arena styles, renderer, controls, mission loop and policy display.

## Colors

The palette combines warm paper and olive ink with distinct operational colors; the frontmatter owns their exact values.

### Primary
- **Friendly Blue** marks the player, player fire, health, and explicit control focus.
- **Control Green** marks selected notebook tabs and ordinary document focus.
- **Action Olive / Action Paper** form the solid action button on briefing and pause sheets.

### Secondary
- **Enemy Vermilion** marks enemies, enemy fire, the active tactic bar, and unread reports. Text, shape, and selection state accompany the color.

### Tertiary
- **Report Violet** connects the scout, its route, and the relay destination.

### Neutral
- **Cloth Olive** is the surrounding stage, not a content panel.
- **Ink / Muted Ink** provide primary and supporting text.
- **Notebook Paper / Map Paper / Toolbar Paper** distinguish adjacent physical surfaces.
- **Button Paper / Button Hover** distinguish resting and hovered ordinary controls.
- **Selected Olive / Selected Paper** identify the chosen play mode.
- **Overlay Paper** holds briefing, pause, and encounter completion copy.
- **Field Paper / Notes Paper** distinguish the movement selector and writing area.
- **Rule** divides evidence and groups without surrounding each item in a card.
- **Probability Track / Probability Fill** show inactive tactic odds; the selected tactic uses Enemy Vermilion.
- **History Track / History Blue / History Baseline** show empty slots, adaptive survival results, and uniform-baseline results. Blind experiments conceal the condition color until debrief.
- **Cover Earth / Cover Ink** make colliders legible over the terrain.
- **Annotation Paper** is a translucent backing for essential canvas labels.

**The Operational Color Rule.** Preserve the blue player, vermilion enemy, and violet scout/relay assignments, with labels or counter shapes carrying identity alongside color.

## Typography

**Display Font:** Barlow Condensed, sans-serif fallback; local bold face (700).
**Body Font:** Source Sans 3, system-ui and sans-serif fallback; local regular and semibold faces (400/600).
**Handwritten Font:** Kalam, cursive fallback; local regular face (400).
**Label/Mono Font:** ui-monospace, SFMono-Regular, monospace for numerical evidence, keyboard labels, and HUD data.

The condensed face gives short commands a military print character. Kalam identifies map notes and report titles; operational controls and essential map labels remain in Source Sans 3. All local faces use `font-display: swap`.

### Hierarchy
- **Display:** the wordmark uses the frontmatter display role; it becomes (27px) at widths up to (760px) and (25px) up to (520px).
- **Headline:** briefing/pause headings use the uppercase headline role, reducing to (28px) and (25px) at those same breakpoints.
- **Notebook title:** the handwritten title uses the notebook-title role, changing to (24px) up to (760px). The report-title role is (14px) up to (520px).
- **Body:** briefing prose uses the body role and a maximum measure of (35ch), reducing to (12px) up to (760px). Evidence prose is (11px) with (1.5) line height, becoming (10px) up to (520px).
- **Controls and labels:** controls commonly use (12px); role headings use semibold uppercase labels. Functional labels identify fields and state rather than introducing decorative headings.
- **Data and metrics:** tactic values use the data role; observation totals and report probabilities use the metric role. Report probabilities adapt through (17px), (15px), and (21px) at the (1100px), (760px), and (520px) breakpoints.
- **Canvas essentials:** role, scout, relay, and aiming annotations use the canvas-essential role in CSS pixels. Their drawing size is multiplied by `max(1, 920 / canvas.clientWidth)` before world scaling. Map titles, the north mark, and the survey scale are decorative annotations, not the essential-label floor.

**The Essential Annotation Rule.** Keep essential canvas labels at least (10 CSS px). Enemy labels follow their counters in adjacent space; evaluate right, left, above, then below, clamp within the map, reserve the HUD strip, and choose the candidate with least overlap against the actual cover rectangles.

## Layout

The desktop shell is centered with a maximum width of `min(1460px, calc((100svh - 275px) * 1.53333 + 300px))`, and padding (18px 22px 12px). The main grid contains a flexible map column and a notebook (286px), separated by (14px). The notebook grows to (310px) from (1450px); at widths up to (1100px) it narrows to (260px), shell padding becomes (14px), and toolbar controls wrap.

Mission progression and the current objective appear above the workspace. The map column contains its controls, input guidance, the battlefield, and a compact legend. The battlefield maintains the simulation's (920 / 600) aspect ratio; its backing canvas follows device pixel ratio. Paper panels generally use (12px–18px) padding with thin rules, while the larger breakpoint uses (20px) notebook padding.

At widths up to (760px), the shell uses (12px) padding without the viewport-height width cap, the notebook moves below the map, and the workspace gap becomes (12px). Mission information wraps, with its objective on a full-width row. Policy groups and recap groups use three columns between (521px) and (760px), then become single-column lists up to (520px). The operation subtitle disappears up to (1100px), and the header status disappears up to (520px).

On coarse pointers or widths up to (520px), initial mission play and newly started operations default to Watch demo. The visible guidance says that manual play requires keyboard and mouse; it replaces keyboard control hints. The mode remains selectable, so this is a default and explanation, not a touch-game control system. Demo movement is named by its behavior: Circle clockwise, Circle counterclockwise, or Use cover + dodge.

When the canvas itself is narrower than (520px), decorative cover names and handwritten tactic subtitles disappear. Essential role and scout/relay labels remain at their CSS-pixel floor. Enemy label candidates remain beside their counters and outside the reserved top HUD band; geometry still uses the unchanged world coordinates.

## Elevation & Depth

The interface uses paper tone, drawn rules, and soft sheet shadows. The map and notebook are rectangular physical layers, and the briefing/pause sheet is a local overlay anchored at the map's lower left. Evidence rows have no individual shadow. Terrain ink and counter outlines describe the map independently from DOM elevation.

### Shadow Vocabulary
- **Map sheet:** `0 6px 16px #202c1d38`.
- **Notebook sheet:** `0 6px 16px #202c1d30`.
- **Briefing sheet:** `0 5px 18px #343e2e45`.

**The Sheet Depth Rule.** Apply the observed soft depth to whole paper sheets; keep notebook evidence as ruled rows within its parent sheet.

## Shapes

Major sheets, mission bands, notebook tabs, and state tags are square. Controls use the control radius (2px); note fields use the field radius (4px). The collapsible notes container and experiment drawer retain their observed radii (6px and 7px). These exceptions do not change the square map/notebook form.

A player arrow, rectangular vanguard, diamond flanker, triangular ranger, envelope scout, and mast relay make military symbols identifiable without relying on hue. Health bars sit with their counters. Collision rectangles use earth fill, clipped diagonal hatching, a dark perimeter, and inset linework matching all corners. Decorative trees, contours, and tracks in `apps/arena/public/art/relay-field.webp` do not define collisions. Faint route dashes are tactical annotations.

**The Collision Truth Rule.** Draw every real cover rectangle from the simulation's `WALLS` geometry. Treat illustrated terrain as presentation only; never infer an obstacle from the raster art.

## Components

### Buttons

Compact, lightly bordered controls use warm button paper, ink text, and the control radius. Ordinary buttons have padding (8px 11px), with denser local actions using (7px 9px). Hover shifts the ordinary fill and border; background and border-color transitions last (.15s). Disabled controls use opacity (.4) and retain their ordinary fill/border on hover.

The briefing action uses Action Olive and Action Paper, padding (9px 20px), and (14px) text. Its scoped fill overrides ordinary button hover. Header controls are transparent with a light olive border; an expanded Experiments button gains an olive fill. Reset memory is a text button with an underline, rather than another solid action.

Buttons, selectors, and summaries use a blue focus outline (2px) with an offset (3px). The general document focus outline is green with those same dimensions. CSS transitions are removed when reduced motion is requested; the simulation remains a live canvas.

### Mode selection and notebook navigation

The mode selector is one bordered group with square internal buttons. Its selected button has Selected Olive fill and Selected Paper text; `aria-pressed` mirrors the state. Demo speed is disabled during manual play.

Notebook tabs use text and a bottom rule (2px), not filled pills. Selected tabs are green; inactive tabs use muted olive. A vermilion dot marks a new report and clears when Last round is opened. The tabs expose `aria-selected`, tab panels, and arrow/Home/End keyboard navigation. These tabs switch inspection content without hiding the battlefield.

### Inputs / Fields

The movement selector is a native select with Field Paper, an olive border, control radius, (12px) type, and padding (7px 25px 7px 8px); its width is capped at (178px). The experiment checkboxes use Control Green and a (14px) box. The session-notes textarea uses Notes Paper, the field radius, (10px) padding, (12px) type, a blue caret, and vertical resizing. Notes remain local to the tab until exported.

### Tags and paper containers

State tags are square outlined labels with semibold (9px) type, letter spacing (.04em), and padding (3px 5px). They communicate ADAPTIVE, UNIFORM, report delivery, or a study state. The notebook is a single paper sheet with ruled subdivisions. Experiments are disclosed above the workspace; their options are arranged in three columns, then two, with memory controls moving to a full-width row at (1100px).

### Battlefield and local overlay

The map image is drawn first; real cover, routes, targeting, scout/relay, bullets, counters, labels, and effects are then drawn from simulation state. A top HUD shows player health and wave/round time on translucent paper. Essential annotations have their own paper backing and follow the placement rule above.

The local overlay presents briefing, pause, reinforcement, success, or failure text plus one action. Its desktop width is capped at (390px), with padding (22px 24px). At widths up to (760px), it is capped at (340px), inset (15px), and padded (16px 18px); up to (520px), it uses width `calc(100% - 24px)`, inset (12px), and padding (13px 15px). It covers part of the map only in a waiting or paused state.

### Intelligence notebook

Memory lists the authored tactics by enemy role. Each row contains its label, current next-round probability, a thin probability bar (4px), score, and observation count. The active tactic uses vermilion and selected text styling. Probability bars transition over (.6s); health bars over (.15s).

Last round uses ruled evidence rows: handwritten role/tactic titles, before-and-after probability, percentage-point delta, observed hits/damage, accepted reward, and an expandable Evidence reason. The report state names delivered, intercepted, direct, fixed-memory, or unavailable evidence. These are actual encounter records, not illustrative examples or scripted improvement. The survival strip contains (18) slots, latest at the left; the fill height represents remaining HP, with an observed-result minimum of (3%) so zero-health rounds remain visible. Hover titles supply round, health, and result.

**The Evidence Rule.** Keep policy odds, observed combat, report delivery, and survival results explicit. A missing or intercepted report means no new knowledge transfer; it does not erase earlier memory.

### Mission and memory state

A mission contains contact and reinforcements. The current wave is identified by both text and an underline; the objective is handwritten. Advancing to the next wave, retrying a lost mission, and deploying the next mission reuse the current operation policy. Combat statistics stay fixed.

Operation memory is session-local: returning to Sandbox or reloading ends it. Sandbox restores its separate saved policy from browser local storage (`tactical-air.memory.v1`); experiments use a fresh policy and preserve that Sandbox memory. Uniform baseline choices hold memory fixed. Reset memory resets the Sandbox policy and is disabled during missions and active experiments. The UI must retain these distinctions when describing memory; it must not promise cross-reload operation persistence.

## Do's and Don'ts

### Do:
- **Do** keep the battlefield dominant and controls close to play, with evidence in the adjacent or following notebook.
- **Do** preserve friendly blue, enemy vermilion, report violet, and distinct military counter shapes.
- **Do** keep essential canvas labels at least 10 CSS px and place enemy annotations beside counters using cover-overlap checks and the reserved HUD band.
- **Do** draw hatched cover from actual collider rectangles and treat illustrated terrain as decoration.
- **Do** show actual probabilities, deltas, observations, report status, and survival history in ruled notebook patterns.
- **Do** explain keyboard/mouse requirements and default coarse-pointer or narrow mission sessions to Watch demo.
- **Do** distinguish session-local operation memory, saved Sandbox memory, and fresh experiment memory.

### Don't:
- **Don't** replace the selected illustrated military-map world with the rejected pale generic dashboard.
- **Don't** imply that painted trees, paths, or contours are physical cover.
- **Don't** make color the sole identifier for unit roles or selected controls.
- **Don't** describe an intercepted report as erasing earlier learning, or claim that operation memory survives reload.
- **Don't** turn each notebook datum into a separate floating card; preserve the implemented ruled-sheet grouping.
