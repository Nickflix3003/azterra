/**
 * fetchWithRetry — drop-in replacement for fetch() that handles Render free-tier cold starts.
 *
 * Render's free tier spins down after inactivity and returns 503 for ~50 seconds while
 * it boots. This wrapper detects 503 responses and retries automatically, broadcasting
 * warming state so the UI can show a "server waking up" message.
 *
 * Strategy:
 *   - On 503: mark warming, wait, retry (up to MAX_RETRIES times)
 *   - Total max wait: ~55 seconds (covers Render's ~50s cold start)
 *   - On any other status or after max retries: return the response as-is
 *
 * Usage:
 *   import { fetchWithRetry } from '../utils/fetchWithRetry';
 *   const response = await fetchWithRetry(url, options);  // same API as fetch()
 */

import {
  markRetryEnd,
  markRetryStart,
  markServerFailure,
  markServerRecovered,
} from './serverStatus.js';

const MAX_RETRIES = 4;
// Cumulative wait: 8 + 12 + 15 + 20 = 55 seconds
const RETRY_DELAYS_MS = [8000, 12000, 15000, 20000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url, options = {}) {
  let retrying = false;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response;
      try {
        response = await fetch(url, options);
      } catch (networkErr) {
        if (retrying) {
          markRetryEnd({
            outcome: 'failed',
            message: 'Could not reach the world server.',
          });
          retrying = false;
        } else {
          markServerFailure('Could not reach the world server.');
        }
        throw networkErr;
      }

      if (response.status !== 503) {
        if (retrying) {
          markRetryEnd({ outcome: 'success' });
          retrying = false;
        } else {
          markServerRecovered();
        }
        return response;
      }

      if (attempt < MAX_RETRIES) {
        if (!retrying) {
          markRetryStart();
          retrying = true;
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      if (retrying) {
        markRetryEnd({
          outcome: 'failed',
          message: 'The world server is still waking up. Please try again in a moment.',
        });
        retrying = false;
      }
      return response;
    }
  } catch (err) {
    if (retrying) {
      markRetryEnd({
        outcome: 'failed',
        message: 'Could not reach the world server.',
      });
      retrying = false;
    }
    throw err;
  }

  if (retrying) {
    markRetryEnd({ outcome: 'success' });
  }
}
