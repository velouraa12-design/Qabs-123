// Preflight only. Never deploys or reads secret values. JSON (not JSONC) only.
import { readFile } from 'node:fs/promises';
import { validateWranglerStagingManifest } from '../staging-worker/isolation-policy.mjs';
const [manifestPath, inventoryPath] = process.argv.slice(2);
if (!manifestPath || !inventoryPath || process.argv.length !== 4) {
  console.error('Usage: node scripts/validate-isolation-manifest.mjs <wrangler.json> <approved-inventory.json>');
  process.exit(2);
}
try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  validateWranglerStagingManifest(manifest, inventory.approved, inventory.environment);
  console.log('Manifest preflight passed. This is not a deployment or proof of remote isolation.');
} catch (error) {
  console.error(`Manifest preflight failed: ${error.message}`);
  process.exit(1);
}
