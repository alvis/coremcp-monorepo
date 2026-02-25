import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RecordedSessionData, SessionData } from '@coremcp/core';

/**
 * gets the file path for a session
 * @param storeDirectory base directory for session files
 * @param sessionId unique identifier of the session
 * @returns absolute file path
 */
export function getSessionFilePath(
  storeDirectory: string,
  sessionId: string,
): string {
  return join(storeDirectory, `${sessionId}.json`);
}

/**
 * loads a single session from its json file
 * @param storeDirectory base directory for session files
 * @param sessionId unique identifier of the session
 * @returns session data or null if not found
 */
export async function loadSessionFile(
  storeDirectory: string,
  sessionId: string,
): Promise<RecordedSessionData | null> {
  const filePath = getSessionFilePath(storeDirectory, sessionId);

  try {
    const data = await readFile(filePath, 'utf-8');

    return JSON.parse(data) as RecordedSessionData;
  } catch {
    // file doesn't exist or is corrupted
    return null;
  }
}

/**
 * saves a session to its json file
 * @param storeDirectory base directory for session files
 * @param sessionData session data to save
 */
export async function saveSessionFile(
  storeDirectory: string,
  sessionData: SessionData,
): Promise<void> {
  const filePath = getSessionFilePath(storeDirectory, sessionData.id);
  const storedAt = Date.now();

  const eventsForStorage = sessionData.events.map((event) => ({
    storedAt,
    ...event,
  }));

  const json = JSON.stringify(
    { ...sessionData, events: eventsForStorage },
    null,
    2,
  );

  await writeFile(filePath, json, 'utf-8');
}

/**
 * deletes a session file
 * @param storeDirectory base directory for session files
 * @param sessionId unique identifier of the session
 */
export async function deleteSessionFile(
  storeDirectory: string,
  sessionId: string,
): Promise<void> {
  // will throw if file doesn't exist
  await rm(getSessionFilePath(storeDirectory, sessionId));
}
