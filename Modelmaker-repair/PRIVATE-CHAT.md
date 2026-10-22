# Modelmaker private chat

A new chat interface for the existing Modelmaker and Klein learning assembly.
The old SynthAi/SynthAI2 interfaces are not loaded. No external AI API key is
required. The app binds to 127.0.0.1 and is intended for one private owner.
Browser session separation is not a substitute for multi-user authentication.

## Run

Requires Python 3.11+ and Node 22+ (Node 24 also works).

```sh
python -m venv .venv
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m assembly.desktop_server
```

Open http://127.0.0.1:7860. On Windows, use the virtual environment's
Scripts/python.exe and Scripts/pip.exe equivalents.

- **Upload books** accepts PDF, DOCX, TXT and Markdown, with a 32 MB per-file
  limit. Text extraction is supported; scanned PDFs require OCR beforehand.
  Source text is retained locally and remains retrievable. Each study run analyzes
  at most 16 passages and reports how many remain. Uploading does not train weights.
- **Chat** retrieves source passages and invokes the Klein analysis pipeline.
  Load a checkpoint for actual CPU model inference. Without one, the response is
  clearly labeled as retrieved excerpts, not a generated model answer.
- **Training** opens the repaired Modelmaker. Saved checkpoints persist beneath
  `.modelmaker/checkpoints`; training in this mounted UI activates the new model
  for the same browser session. Small scratch-trained models need substantial
  suitable training/evaluation before they can be expected to converse or code well.
- **Klein tools** exposes the 16 original implementations plus three scoped,
  source-based adapters. Availability is not evidence that every historical Klein
  capability has been fully implemented. See `vendor/KLEIN-SOURCE.json`.
- **Edit app** loads this application's own source, accepts a model-generated or
  manual replacement, and shows the exact diff. Applying a reviewed proposal checks
  Python/JavaScript syntax and runs project tests. Failed checks restore the old
  file. Backups are stored under `.modelmaker/self-edit-backups`. Refresh after
  interface edits; restart after Python edits. A coding-capable checkpoint is
  required for reliable generated edits; invalid model output never changes files.

All books, learned tool state, feedback, checkpoints, and edit backups are local
under `.modelmaker`, or `MODELMAKER_DATA` if configured. Never expose this private
server directly to the Internet. No models, books, or changes are auto-published.
Self-edits are code changes; test success does not guarantee their quality.

## Optional local MCP toolbox

```sh
.venv/bin/python computer/mcp_server.py
```

This is a real stdio MCP server exposing model inference, source study/retrieval,
Klein calls, watcher, clarification proposals and reviewed self-edits. It also
lists the reused computer hands. Computer actions default to proposals. It is
not automatically installed into this ChatGPT conversation. A compatible local
MCP client can launch that command; use `MODELMAKER_USER` to choose its local
profile. Its default profile is separate from browser sessions.

## Computer components retained for later assembly

Only backend modules were reused from pinned public commits:

- SynthAi `hover/synthia58-2026-09-27`, commit
  `d901b3e15aa7c99a32fbb15e9b0680d77243249b`: browser hand, Android hand,
  MCP tool broker, and their small dependency closure.
- SynthAI2 `build/embedded-linux-birth-candidate`, commit
  `7b28f9e70c9e400e4f50f402dc8766d47ea8a18e`: Linux command service.

Neither donor interface is used. The private chat does not launch a computer or
Android emulator. Android hands require an actual configured bridge. A future
public computer should use the user's Kimi Linux build from Drive, which has not
been integrated in this private-chat delivery. No public container was deployed.

## Verification

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Tests exercise the actual CPU weight objective/update/reload, real Klein source
analysis and model routing, upload-to-retrieval, browser-session separation,
self-edit stale-file checks, and rollback after failed project checks.
