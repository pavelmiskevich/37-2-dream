/**
 * Version of the deterministic dream engine. Bump it whenever the same seed
 * starts producing a different dream, or a recorded input log starts
 * replaying differently (see AGENTS.md, "Детерминизм", and D-012).
 *
 * History:
 * - 1 — seed → dream (#2), fixed-step simulation and input log (#3).
 * - 2 — temperature model in `step` (D-014): drift, early awakenings. Dreams
 *   are generated as before; logs of version 1 would replay differently.
 * - 3 — rules of the fall scene (#10, D-015): drift in the air, tumble, panic
 *   heat. Dreams are generated as before; logs that reach the fall would
 *   replay differently.
 * - 4 — yard rules (D-016): the swing, its heat and the transition to the
 *   fall. Dreams are generated as before; logs of version 3 would replay
 *   differently.
 * - 5 — apartment prologue (#8, D-017): the apartment gains `lastWords` and
 *   `nightstand` (drawn after its old parameters, which keep their values);
 *   its rules keep the hero in bed and time the scene by the prologue, so
 *   every log would replay differently.
 */
export const ENGINE_VERSION = 5;
