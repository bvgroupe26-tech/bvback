import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SCHEME = 'supabase://';

/** Référence stockée en base (ex. DocumentRh.fichierPath) : `supabase://<bucket>/<chemin>`. */
export function toStorageRef(bucket: string, objectPath: string): string {
  return `${SCHEME}${bucket}/${objectPath}`;
}

export function parseStorageRef(ref: string): { bucket: string; objectPath: string } | null {
  if (!ref.startsWith(SCHEME)) return null;
  const rest = ref.slice(SCHEME.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), objectPath: rest.slice(slash + 1) };
}

let sharedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (sharedClient) return sharedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ServiceUnavailableException('Stockage de fichiers non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }
  sharedClient = createClient(url, key);
  return sharedClient;
}

/** Bucket Supabase privé : jamais d'URL publique, lecture par le serveur ou par URL signée courte. */
export class PrivateBucketStorage {
  private readonly logger = new Logger(`PrivateBucketStorage:${this.bucket}`);
  private ready = false;

  constructor(private readonly bucket: string) {}

  private async ensureBucket(): Promise<void> {
    if (this.ready) return;
    const { error } = await getClient().storage.createBucket(this.bucket, { public: false });
    if (error && !error.message.toLowerCase().includes('already exists')) {
      this.logger.warn(`Initialisation du bucket : ${error.message}`);
    }
    this.ready = true;
  }

  /** Écrase le fichier s'il existe et renvoie sa référence `supabase://…`. */
  async put(objectPath: string, buffer: Buffer, contentType: string): Promise<string> {
    await this.ensureBucket();
    const { error } = await getClient()
      .storage.from(this.bucket)
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (error) throw new Error(`Envoi vers le stockage impossible : ${error.message}`);
    return toStorageRef(this.bucket, objectPath);
  }

  static async download(ref: string): Promise<Buffer | null> {
    const parsed = parseStorageRef(ref);
    if (!parsed) return null;
    const { data, error } = await getClient().storage.from(parsed.bucket).download(parsed.objectPath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
}
