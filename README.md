# Ripple

An interactive pond you can feed, pet, and rearrange. Every splash drives both the water you see and the sound you hear.

**Live demo:** [ripple-nine-chi.vercel.app](https://ripple-nine-chi.vercel.app)

## What it is

Ripple is a single-page experience with two surfaces:

- **Pond:** a height-field water simulation. Waves travel, bounce off the banks, and interfere. Food, currents, fish, and visitors all leave marks on the surface.
- **Window:** rain on glass, with a rhythm studio for quiet loops you can play back under the pond later.

Sound is procedural Web Audio. There are no sample libraries and no frameworks. Canvas draws the scene; the same impact strength that shapes a ripple also shapes its tone.

## Highlights

- Physics-linked water and audio
- Growing pond life, special food, tools, and a progress save that stays on your device
- Day, moon, and crystal looks with their own visitors
- Adaptive graphics that ease down on lighter machines
- Built-in user guide (opens from the book button, with a spoiler warning first)

## Controls (quick start)

| Action | How |
| --- | --- |
| Throw food | Fish food on, then left-click or hold and drag to sling |
| Carve currents | Turn fish food off, then left-drag across the pond |
| Pet | Right-click a creature |
| Scoop floating food | Turn the net on, then right-click or right-drag |
| Catch a rainbow fish | Turn the rainbow catcher on, then left-drag a circle around it |
| Hide chrome | Top-right eye button, or press `U` |

Food throwing and current carving are exclusive modes on the same food button.

## Run locally

No build step and no install.

1. Clone the repository.
2. Serve the folder over HTTP (browsers restrict some APIs from `file://`).
3. Open `index.html` in a modern browser.

Examples:

```bash
# Python
python -m http.server 8080

# Node
npx --yes serve .
```

Then visit `http://localhost:8080`.

## Project layout

| File | Role |
| --- | --- |
| `index.html` | Page shell, menus, and written guide copy |
| `main.js` | Pond simulation, creatures, tools, audio, finales |
| `style.css` | UI chrome and layout |
| `guide.js` | Guide open/close only (loaded when the guide button is used) |

Almost all gameplay lives in `main.js`. After shipping JS or CSS changes, bump the `?v=` cache query on that file in `index.html`.

## Tech notes

- Vanilla JavaScript, HTML, and CSS
- Canvas 2D for rendering
- Web Audio API for synthesis
- Adaptive quality for DPR, water grid density, and decorative detail
- Draw loop pauses while the tab is hidden; endings still clear on a background timer

Window rain aesthetics are inspired by [SardineFish/raindrop-fx](https://github.com/SardineFish/raindrop-fx) (MIT).

## Saves and privacy

Progress saving is optional and local to the browser. You can also download or upload a save file. Nothing is stored on a paid server by this project.

## License

No license file is published in this repository yet. All rights reserved unless the author adds one.
