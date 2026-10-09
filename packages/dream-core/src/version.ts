/**
 * Version of the deterministic dream engine. Bump it whenever the same seed
 * (with the same length and library) starts producing a different film (see
 * AGENTS.md, "Детерминизм", and D-012).
 *
 * History:
 * - 1–8 — the v1.2 game: seed → scene graph, fixed-step simulation, input log
 *   and the rules of its scenes (D-014…D-020). Version 8 is also the one the
 *   dream film was first generated under (`generateFilm`, D-023): it added its
 *   own streams and did not bump the version.
 *
 * The game code was removed under version 8 (#41, D-029). `generateFilm` gives
 * the same film for every seed as before, so the version did not change.
 */
export const ENGINE_VERSION = 8;
