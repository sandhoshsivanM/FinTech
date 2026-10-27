import { getPlatform, type SaveOutcome, type SaveRequest } from '../platform';

export type { SaveOutcome, SaveRequest };

/** Saves a file through whichever implementation the host app installed. */
export function saveFile(req: SaveRequest): Promise<SaveOutcome> {
  return getPlatform().saveFile(req);
}
