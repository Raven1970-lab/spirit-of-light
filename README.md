# Spirit of Light

An interactive 3D particle study of London’s angel lights and Oxford Circus, by Raven.

## Open the experience

https://raven1970-lab.github.io/spirit-of-light/

Choose **Enter** for the front-facing angel. Drag with the left mouse button to rotate, or use the mouse wheel / Zoom slider to inspect details.

Choose **Recognise gestures** to enable the camera: the particles first disperse; a fist forms the angel, an open palm reveals the street, and removing the hand releases the particles. Gesture tracking runs locally in the browser. The application does not upload or store camera frames.

The bottom controls switch forms, views and colour presets. Particle settings include custom colour, circle/square particles, count, brightness, zoom and hand sensitivity. Manual form buttons and dragging take over from gesture control. Return to standby starts the exhibition cycle.

## Run locally

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Then open http://127.0.0.1:8766/. Camera access requires HTTPS or localhost, browser permission and a working camera. If an embedded browser restricts camera access, open the site in a standalone browser.

## Runtime

Static HTML, CSS and ES modules; no build step. Three.js, MediaPipe Tasks Vision, its WASM runtime and the hand-landmark model are bundled under `vendor/`. The site also requests fonts from Google Fonts.

Architectural references are recorded in [STREET_REFERENCES.md](STREET_REFERENCES.md). The street layout is a stylised, spatially compressed interpretation.

## Third-party components

- Three.js r160 and its postprocessing/shader modules: MIT; see `vendor/LICENSE-three.txt`.
- MediaPipe Tasks Vision: Apache-2.0; see `vendor/LICENSE-mediapipe.txt`.
- MediaPipe hand-landmark model: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker

Original project content remains copyright its author. Third-party components retain their respective licences.
