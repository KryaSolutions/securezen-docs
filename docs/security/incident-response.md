# Incident Response

## Worked example: the exposed-credentials incident

A now-deleted doc (`backend/docs/claude.md`) contained a plaintext, live-looking Groq API key and an admin password, committed to git. Found during the August 2026 documentation audit.

**What was done**: the file was deleted as part of the docs cleanup, and the exposure was flagged explicitly to the credential owner rather than assumed handled.

**What deletion does NOT do**: invalidate the credentials. They remain recoverable from git history by anyone with repo access, indefinitely, until actually rotated at the source (Groq console, the admin account itself). This is the key lesson: **treat "delete the file" and "rotate the credential" as two separate, both-required steps** — doing only the first leaves the actual exposure open.

**Status**: file deleted; credential rotation is an outstanding action item owed to whoever owns those specific keys — not something a docs change can complete on its own.

## General pattern for a discovered credential exposure

1. Don't paste the exposed value anywhere else while handling it (including into chat/AI tooling) — that just creates a second exposure.
2. Rotate at the source immediately — assume it's already compromised the moment it's found in a place it shouldn't be.
3. Remove it from the current tree, but don't consider that sufficient — git history retains it unless history itself is rewritten (rare, disruptive, usually not worth it compared to just rotating).
4. Document what happened and what was/wasn't done, so it isn't silently re-discovered later with no context (this file is that documentation for the one case that's happened so far).

## Related: automated response safety

`backend/app/ml_utils/response_engine.py`'s `block_ip()` explicitly refuses to act on private/internal IP ranges — relevant here because an automated incident-response action taken on bad information (a false-positive verdict) is its own category of incident. Don't weaken that check without a specific, deliberate reason.
