# Ripple

An interactive pond. Food, currents, fish, and visitors disturb a height-field water surface, and the same impact strength shapes a procedural tone.

Live site: [ripplefish.xyz](https://ripplefish.xyz/).

## What it is

Ripple is one page with two surfaces:

- **Pond:** waves travel, bounce off the banks, and interfere. Food, currents, fish, and visitors all leave marks on the surface.
- **Window:** rain on glass, with a rhythm studio. Loops saved there can play under the pond.

Sound is procedural Web Audio. There is no sample library. Canvas draws the scene.

## Highlights

- Physics-linked water and audio
- Pond life, special food, tools, and a progress save that stays in the browser
- Day, moon, and crystal looks, each with its own visitors
- Graphics settings that ease down on lighter machines
- A written guide opened from the book button, behind a spoiler notice

## Controls

| Action | How |
| --- | --- |
| Throw food | Fish food on, then left-click, or hold and drag to sling |
| Carve currents | Turn fish food off, then left-drag across the pond |
| Pet | Right-click a creature |
| Scoop floating food | Turn the net on, then right-click or right-drag |
| Catch a rainbow fish | Turn the rainbow catcher on, then left-drag a circle around it |
| Hide chrome | Top-right eye button, or press `U` |

Food throwing and current carving share one button and cannot both be on.

## Run locally

No install and no build step. Browsers block some APIs from `file://`, so serve the folder over HTTP and open `index.html`.

```bash
python -m http.server 8080
```

Or:

```bash
npx --yes serve .
```

Then open http://localhost:8080.

## Project layout

| File | Role |
| --- | --- |
| `index.html` | Page shell, menus, and written guide copy |
| `main.js` | Pond simulation, creatures, tools, audio, finales |
| `style.css` | UI chrome and layout |
| `guide.js` | Guide open and close. Loaded when the guide button is used |

Almost all gameplay lives in `main.js`.

## Tech notes

- Vanilla JavaScript, HTML, and CSS
- Canvas 2D for rendering
- Web Audio API for synthesis
- Adaptive quality for device pixel ratio, water grid density, and decorative detail
- The draw loop pauses while the tab is hidden. Endings still clear on a background timer

Window rain drawing is inspired by [SardineFish/raindrop-fx](https://github.com/SardineFish/raindrop-fx) (MIT).

## Saves and privacy

Progress saving is optional and stays in the browser. A save file can be downloaded or uploaded. This project does not store progress on a server.

## License

No license file is included with this repository.
