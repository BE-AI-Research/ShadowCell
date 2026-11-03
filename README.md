# Shadow Cell: Operation Argon

<img width="1024" height="498" alt="shadow-cell" src="https://github.com/user-attachments/assets/79cc089d-a642-4728-b0da-eb85858f387b" />

A browser-based 3D third-person tactical stealth game inspired by *Splinter Cell*.
Built with Three.js (vendored, r160) and the Web Audio API — plain ES modules, no build step.

Infiltrate a fortified data facility under cover of darkness, stay in the shadows using
your Light Gem, shoot out lights and cameras with a silenced EMP pistol, use night and
thermal vision, take down guards from behind, hack both terminals, and reach the
North Helipad extraction zone.

## Play

**Online:** `https://<your-user>.github.io/<repo-name>/` (once GitHub Pages is enabled — see below)

**Locally:** ES modules cannot load from `file://`, so serve the folder over HTTP:

```sh
python3 -m http.server 8080
# then open http://localhost:8080/
```

## Controls

| Key | Action |
| --- | --- |
| WASD + Mouse | Move & orbit camera |
| C | Toggle crouch |
| Right Click | Over-shoulder aim |
| Left Click | Fire silenced EMP shot |
| E | Rear takedown / hold to hack |
| Q | Acoustic whistle distraction |
| 1 | Normal vision |
| 2 | Toggle night vision |
| 3 | Toggle thermal vision |

Click **ENGAGE MISSION // LOCK CURSOR** to start (the game uses pointer lock; press Esc to release).

### Mobile / touch

Phones and tablets are detected automatically (touch + viewport size) and get an on-screen HUD:
left half of the screen is a floating move joystick (push to the edge to sprint), right half drags
the camera, and the buttons cover fire, aim, interact, crouch, whistle, NVG/thermal and pause (II).
Landscape is recommended; a rotate prompt appears in portrait. Force the scheme with `?mobile=1`
or `?mobile=0` in the URL.

## Deploying to GitHub Pages

The site is fully static and uses only relative paths, so it works under a `/<repo-name>/` subpath.

1. Push this repository to GitHub (default branch `main`).
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) publishes `index.html`, `src/` and `vendor/` on every push to `main`.

Alternative without Actions: set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
The `.nojekyll` file ensures files are served as-is.

## Project layout

```
index.html           HUD, overlays, entry point
src/main.js          Game bootstrap and main loop
src/core/            Input, camera rig, synthesized audio
src/entities/        Player, guards, cameras/lasers/terminals
src/systems/         Lighting/visibility, sound propagation, vision modes
src/world/           Facility level geometry
vendor/              Three.js 0.160.0 (MIT)
```

## Credits

Co-designed by BE-Code & Gemini Argon. Three.js © three.js authors, MIT License.
