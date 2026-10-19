# Arena art and typography

The illustrated map is an original AI-generated asset created on 2026-10-18. The [exact prompt](relay-field-prompt.txt) requests a top-down watercolor and ink terrain plate without units or obstacles. The shipping asset is `apps/arena/public/art/relay-field.webp`; its adjacent `.json` sidecar preserves the prompt. It was converted from the generated PNG to WebP at quality 90. No external stock assets were copied.

Canvas draws the actual collision rectangles, unit counters, projectiles, scout and relay over the terrain. Painted trees and contour lines are decorative, not additional collision geometry.

Typography is self-hosted under `apps/arena/public/fonts`: Barlow Condensed (display), Kalam (map/notebook annotations), and Source Sans 3 (controls and evidence). The corresponding OFL licenses are included beside the font files. Font files were retrieved from Google Fonts, with licenses from the official google/fonts repository.

## Exhibit illustration

`apps/microsite/art/action.webp` is an AI-generated illustration based on the original terrain and a game screenshot. It preserves the blue player chevron and three red role counters, with illustrative fire and movement trails. It is promotional artwork, not a recorded result. The exhibit banner uses this composition. The actual game terrain is unchanged.
