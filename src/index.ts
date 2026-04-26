import Cloudflare from 'cloudflare';
import { toBase64 } from 'cloudflare/core';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const KV_KEY = 'DNS_ENTRIES';
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

interface BackupEntry {
	timestamp: number;
	records: string;
}

type AppEnv = Env & {
	DNS_READ?: string;
	S3_ACCESS_KEY_ID?: string;
	S3_ACCESS_KEY?: string;
	S3_FORCE_PATH_STYLE?: string;
};

function isTruthyEnv(value?: string): boolean {
	if (!value) {
		return false;
	}

	const normalized = value.trim().toLowerCase();
	return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function logS3Error(error: unknown, context: { endpoint: string; bucket: string; region: string; key: string }) {
	const err = error as {
		name?: string;
		message?: string;
		stack?: string;
		$metadata?: Record<string, unknown>;
		Code?: string;
	};

	console.error('S3 upload failed', {
		name: err?.name,
		message: err?.message,
		code: err?.Code,
		metadata: err?.$metadata,
		context,
		stack: err?.stack,
	});
}

async function uploadS3(
	env: AppEnv,
	dnsRecords: string,
	accessKeyId: string,
	secretAccessKey: string,
	objectKey: string,
) {
	const forcePathStyle = env.S3_FORCE_PATH_STYLE === undefined ? true : isTruthyEnv(env.S3_FORCE_PATH_STYLE);

	const s3Client = new S3Client({
		region: env.S3_REGION,
		credentials: {
			accessKeyId,
			secretAccessKey,
		},
		endpoint: env.S3_ENDPOINT,
		forcePathStyle,
		requestChecksumCalculation: 'WHEN_REQUIRED',
	});

	// Upload the backup data to S3
	const params = {
		Bucket: env.S3_BUCKET_NAME,
		Key: objectKey,
		Body: dnsRecords,
		ContentType: 'text/plain; charset=utf-8',
	};
	const command = new PutObjectCommand(params);
	await s3Client.send(command);

	console.log('Backup uploaded to S3:', objectKey);
}

async function backup(env: AppEnv) {
	try {
		const apiToken = env.DNS_READ?.trim();
		if (!apiToken) {
			console.error('Missing DNS_READ secret. Set it with `wrangler secret put DNS_READ` (and for local dev add it to `.dev.vars`).');
			return;
		}

		const client = new Cloudflare({ apiToken });
		const dnsRecords = await client.dns.records.export({ zone_id: env.ZONE_ID });

		let entries = (JSON.parse(await env.BACKUP_KV.get(KV_KEY) ?? '[]') as BackupEntry[]) || [];
		// Remove entries older than a month
		entries = entries.filter(
			(entry) => (new Date().getTime() - new Date(entry.timestamp).getTime()) < ONE_MONTH_MS
		);

		// Add the latest entry
		entries.push({
			timestamp: Date.now(),
			records: toBase64(dnsRecords),
		});

		await env.BACKUP_KV.put(KV_KEY, JSON.stringify(entries, null, 2));

		if (env.S3_ENDPOINT) {
			const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
			const secretAccessKey = env.S3_ACCESS_KEY?.trim();

			if (!accessKeyId || !secretAccessKey) {
				console.error('S3_ENDPOINT is configured but S3_ACCESS_KEY_ID or S3_ACCESS_KEY is missing. Skipping S3 upload.');
				return;
			}

			const objectKey = `dns_backup_${Date.now()}.txt`;

			try {
				await uploadS3(env, dnsRecords, accessKeyId, secretAccessKey, objectKey);
			} catch (error) {
				logS3Error(error, {
					endpoint: env.S3_ENDPOINT,
					bucket: env.S3_BUCKET_NAME,
					region: env.S3_REGION,
					key: objectKey,
				});
				console.error('DNS records were saved to KV, but S3 upload failed.');
			}
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
