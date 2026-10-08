/**
 * The dream-film player (D-022, D-024): plays a `DreamFilm` edit list from
 * the library — living stills, film look, cuts, scares and sound.
 */
export { FilmPlayer, type FilmPlayerOptions, type PlayerStats, type PlayOptions } from './player';
export { fetchLibrary } from './assets';
export { MIN_FLASH_GAP, type PlayerSettings } from './timeline';
export type { FrameState } from './frame';
