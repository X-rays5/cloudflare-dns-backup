import Cloudflare from 'cloudflare';
import { toBase64 } from 'cloudflare/core';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const KV_KEY = 'DNS_ENTRIES';
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

interface BackupEntry {
	timestamp: number;
	records: string;
}

async function uploadS3(env: Env, dns_records: String) {
	const s3Client = new S3Client({
		region: env.S3_REGION,
		credentials: {
			accessKeyId: env.S3_ACCESS_KEY_ID,
			secretAccessKey: env.S3_ACCESS_KEY,
		},
		endpoint: env.S3_ENDPOINT,
	});

	const filename = `dns_backup_${Date.now()}.txt`;
	// Upload the backup data to S3
	const params = {
		Bucket: env.S3_BUCKET_NAME,
		Key: filename,
		Body: dns_records,
	};
	const command = new PutObjectCommand(params);
	await s3Client.send(command);

	console.log('Backup uploaded to S3:', filename);
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

		if (env.S3_ENDPOINT) {
			await uploadS3(env, dns_records);
		}
	} catch (error) {
		// Handle errors gracefully (e.g., log to console, send error notification)
		console.error('Error backing up DNS records:', error);
	}
}

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(backup(env));
	},
} satisfies ExportedHandler<Env>;
