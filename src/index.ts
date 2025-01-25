import Cloudflare from 'cloudflare';
import { toBase64 } from 'cloudflare/core';

const KV_KEY = 'DNS_ENTRIES';
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

interface BackupEntry {
	timestamp: number;
	records: string;
}

async function backup(env: Env) {
	const client = new Cloudflare({
		apiToken: env.DNS_READ,
	});

	try {
		const dns_records = await client.dns.records.export({ zone_id: env.ZONE_ID });

		let entries = (JSON.parse(await env.BACKUP_KV.get(KV_KEY) ?? '[]') as BackupEntry[]) || [];
		// Remove entries older than a month
		entries = entries.filter(
			(entry) => (new Date().getTime() - new Date(entry.timestamp).getTime()) < ONE_MONTH_MS
		);

		// Add the latest entry
		entries.push({
			timestamp: Date.now(),
			records: toBase64(dns_records),
		});

		await env.BACKUP_KV.put(KV_KEY, JSON.stringify(entries, null, 2));

	} catch (error) {
		// Handle errors gracefully (e.g., log to console, send error notification)
		console.error('Error backing up DNS records:', error);
		return new Response('Error backing up DNS records', { status: 500 });
	}
}

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(backup(env));
	},
} satisfies ExportedHandler<Env>;
