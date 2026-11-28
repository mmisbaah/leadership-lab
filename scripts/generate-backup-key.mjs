// Makes a strong random BACKUP_KEY and prints the commands to install it.
// Usage: npm run generate-backup-key
// The key is printed once and never written to disk. Store it in a password manager: without it, encrypted
// backups cannot be read.
import { randomBytes } from 'node:crypto';

const key = randomBytes(32).toString('base64url');
console.log(`
New backup key (32 random bytes):

  ${key}

1. Save it in your password manager now. Encrypted snapshots cannot be restored without it.
2. Install it on the Worker (paste the key when asked):

     npx wrangler secret put BACKUP_KEY

3. Check: https://leadership.mellowpilot.com/api/health should report "backupKey": true,
   and the next nightly snapshot (or Participants → Back up now) will say "encrypted".

To restore later:  BACKUP_KEY=<the key> npm run restore-backup -- latest
`);
