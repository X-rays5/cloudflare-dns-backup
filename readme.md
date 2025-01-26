# Cloudflare DNS backup

Export all records for a zone using a cloudflare worker and store them as a kv entry

## How to use
1. npm i and run npm run deploy
2. Create a token with dns read permissions and add it as a secret for the worker on the cloudflare website with the name ```DNS_READ```
3. Retrieve the zone id of the domain you want to back up. Can be done by opening your domain on the cloudflare website and looking at the items on the right side of the screen.
4. Update the zone id env var in the ```wrangler.json```
5. Create a new KV store and put its id in the ```wrangler.json``` under kv_namespaces for the ```BACKUP_KV```
6. Deploy the worker again
7. The worker should now make a backup every hour and keep all records for a month

## Enable S3 backup
1. Create secret ```S3_ACCESS_KEY_ID``` and ```S3_ACCESS_KEY```
2. Update S3 env vars in ```wrangler.json```
3. Deploy worker
