# Gate animated flowchart

`gate-flowchart.mp4`: 10 seconds, 1920 × 1080, 30 fps, H.264, no audio.

The first column shows company context and purchasing policies, Gate's assessment, and automatic approval when requirements are met. A second column branches horizontally from the assessment: a concern or insufficient evidence leads to human review. Both routes join at “Request resolved,” a neutral final outcome that does not imply human review always results in approval.

Timing:
- 0–1.25 seconds: context and first connector.
- 1.25–3.1 seconds: assessment and automatic approval.
- 3.1–5.75 seconds: exception branch and human review.
- 5.75–7.15 seconds: paths join at the final outcome.
- 7.15–10 seconds: completed flowchart holds for reading.

Open `preview.html` in a browser for playback. The poster PNG is the complete diagram. The editable renderer is `render.py`; it requires Python, Pillow, imageio-ffmpeg, and the macOS Avenir Next font. Run `python render.py` to regenerate, or `python render.py --preview` for a still.

Palette follows the project's DESIGN.md: charcoal #1d1e22, peach #efa36d, sage #acc6b4. Motion uses cubic ease-out, sequential line drawing, traveling indicator dots, and gentle box entrances.
