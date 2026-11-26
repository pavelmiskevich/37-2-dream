/**
 * Version of the deterministic dream engine. Bump it whenever the same seed
 * (with the same length and library) starts producing a different film (see
 * AGENTS.md, "Детерминизм", and D-012).
 *
 * History:
 * - 1–8 — the v1.2 game: seed → scene graph, fixed-step simulation, input log
 *   and the rules of its scenes (D-014…D-020). Version 8 is also the one the
 *   dream film was first generated under (`generateFilm`, D-023): it added its
 *   own streams and did not bump the version. The game code was removed under
 *   version 8 (#41, D-029) without changing any film.
 * - 9 — the edit no longer casts frames of the awakening (the bedroom by day,
 *   `isWakingFrame`) inside the dream (#61, D-030). Films over a library that
 *   has such a frame change; films over one without it stay the same.
 * - 10 — the film says how it ends (`ending`, #134, D-037): with frames of a
 *   fall in the library, some dreams end in a fall — the last shots of the
 *   climax are heights with a camera falling in and a hard cut. Every film
 *   gains the field; films that end quietly are otherwise the same.
 * - 11 — the last height of a fall is the fall itself (#137): a `fall` camera
 *   that drops into the frame, the mix ducked under the wind of the fall
 *   (`fall_wind`). Only films that end in a fall change.
 * - 12 — a clip is held long enough to be seen moving and shows its middle
 *   (#141): its shot takes time from the shots after it in its beat, and the
 *   shot says where in the clip it starts (`clipFrom`). Films that cast a clip
 *   change; films over a library without clips stay the same.
 * - 13 — a dream keeps to a few of the library's locations (#77, D-040):
 *   4–5 for a short film, 5–6 for a long one, leaned by the profile, more
 *   when they have too few frames; a frame shown four times is all but
 *   retired. Films over a library with more locations than that change.
 * - 14 — a dream has a sound of its own (#78, D-041): one bed or two of the
 *   three (a second likelier in a long dream), leaned by the profile and by
 *   the sources it shows; a hospital corridor alone no longer starts the
 *   monitor; a false alarm sounds with what the dream has. Every film's
 *   sound changes.
 * - 15 — every scare of a dream is a new frame while the library has any
 *   left (#75): a long dream no longer shows the same scare twice. Films
 *   with more than one scare may change.
 */
export const ENGINE_VERSION = 15;
