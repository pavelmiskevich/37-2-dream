// Overheat guard for the laptop (same sensor as tools/generation, D-025):
// the model never starts on a hot machine and waits until it cools down.
import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const COUNTER = "(Get-Counter '\\Thermal Zone Information(*)\\Temperature').CounterSamples | % { $_.CookedValue - 273.15 }";

/**
 * Hottest thermal zone in °C, or null when the sensor cannot be read.
 * @returns {Promise<number | null>}
 */
export function readTemperature() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', COUNTER],
      { timeout: 30_000, windowsHide: true },
      (error, stdout) => {
        if (error) return resolve(null);
        const values = stdout
          .split(/\r?\n/)
          .map((line) => Number.parseFloat(line.trim().replace(',', '.')))
          .filter((value) => Number.isFinite(value));
        resolve(values.length > 0 ? Math.max(...values) : null);
      },
    );
  });
}

/**
 * Waits while the machine is hot: at `pauseAt` °C or above, until it is
 * below `resumeAt` °C. Throws when the sensor is not available.
 * @param {{ pauseAt: number, resumeAt: number, pollSeconds?: number, read?: () => Promise<number | null>, wait?: (ms: number) => Promise<unknown>, log?: (line: string) => void }} options
 * @returns {Promise<number>} the temperature the work starts at
 */
export async function waitUntilCool({ pauseAt, resumeAt, pollSeconds = 15, read = readTemperature, wait = sleep, log = console.log }) {
  let temperature = await read();
  if (temperature === null) throw new Error('The temperature sensor is not available; refusing to run the model (see --no-thermal-guard)');
  if (temperature < pauseAt) return temperature;
  log(`  ${temperature.toFixed(1)} °C ≥ ${pauseAt} °C: waiting until it is below ${resumeAt} °C`);
  while (temperature >= resumeAt) {
    await wait(pollSeconds * 1000);
    temperature = await read();
    if (temperature === null) throw new Error('The temperature sensor stopped answering');
  }
  log(`  cooled down to ${temperature.toFixed(1)} °C`);
  return temperature;
}
