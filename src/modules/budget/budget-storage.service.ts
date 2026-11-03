import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** Bucket privé : les factures ne sont accessibles que par URL signée temporaire. */
const BUCKET = 'budget-pieces';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

@Injectable()
export class BudgetStorageService {
  private readonly logger = new Logger(BudgetStorageService.name);
  private client: SupabaseClient | null = null;
  private bucketReady = false;

  private getClient(): SupabaseClient {
    if (this.client) return this.client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new ServiceUnavailableException(
        'Stockage des pièces justificatives non configuré.',
      );
    }
    this.client = createClient(url, key);
    return this.client;
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    const { error } = await this.getClient().storage.createBucket(BUCKET, {
      public: false,
    });
    if (error && !error.message.toLowerCase().includes('already exists')) {
      this.logger.warn(`Bucket "${BUCKET}" init: ${error.message}`);
    }
    this.bucketReady = true;
  }

  /** Renvoie le chemin interne du fichier (stocké en base, jamais exposé tel quel). */
  async upload(path: string, buffer: Buffer, mimetype: string): Promise<string> {
    await this.ensureBucket();
    const { error } = await this.getClient()
      .storage.from(BUCKET)
      .upload(path, buffer, { contentType: mimetype, upsert: false });
    if (error) {
      throw new InternalServerErrorException(
        `Échec de l'envoi de la pièce justificative : ${error.message}`,
      );
    }
    return path;
  }

  async signedUrl(path: string): Promise<string | null> {
    try {
      const { data, error } = await this.getClient()
        .storage.from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await this.getClient().storage.from(BUCKET).remove([path]);
    } catch (error) {
      this.logger.warn(
        `Suppression pièce ${path} échouée`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
