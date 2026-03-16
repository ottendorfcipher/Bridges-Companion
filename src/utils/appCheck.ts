import { getToken } from 'firebase/app-check';
import { appCheck } from '@config/firebase';

/**
 * Warm App Check on initial load.
 *
 * We deliberately don't block app startup on App Check token retrieval; instead we
 * prefetch in the background during the app's splash/loading UI.
 */
export async function warmAppCheckToken(options?: { timeoutMs?: number }): Promise<void> {
  if (!appCheck) return;

  const timeoutMs = options?.timeoutMs ?? 2000;

  try {
    await Promise.race([
      getToken(appCheck, false).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // Ignore: offline/dev environments may fail to retrieve a token.
  }
}
