# Cloudflare DNS backup

Export all records for a zone using a cloudflare worker and store them as a kv entry

## How to use
1. npm i and run npm run deploy
2. Create a token with DNS read permissions and set it as a worker secret named `DNS_READ`:
   - `wrangler secret put DNS_READ`
   - If you deploy to a named env, also run `wrangler secret put DNS_READ --env <env-name>`
   - For local `wrangler dev`, add `DNS_READ=...` to a `.dev.vars` file
3. Retrieve the zone id of the domain you want to back up. Can be done by opening your domain on the cloudflare website and looking at the items on the right side of the screen.
4. Update the zone id env var in the ```wrangler.json```
5. Create a new KV store and put its id in the ```wrangler.json``` under kv_namespaces for the ```BACKUP_KV```
6. Deploy the worker again
7. The worker should now make a backup every hour and keep all records for a month

## Enable S3 backup
1. Create secret ```S3_ACCESS_KEY_ID``` and ```S3_ACCESS_KEY```
2. Update S3 env vars in ```wrangler.json```
3. Optional: set `S3_FORCE_PATH_STYLE` to `true` (default in code) for S3-compatible providers that do not support virtual-host-style buckets
4. For local `wrangler dev`, add S3 secrets to `.dev.vars`
5. Deploy worker

If S3 upload fails, DNS data is still saved in KV and the worker logs provider error metadata for debugging.
