import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'avatars';

@Injectable()
export class SupabaseStorageService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  async onModuleInit(): Promise<void> {
    const { error } = await this.client.storage.createBucket(BUCKET, {
      public: true,
    });
    if (error && !error.message.toLowerCase().includes('already exists')) {
      this.logger.warn(`Bucket "${BUCKET}" init: ${error.message}`);
    }
  }

  async uploadAvatar(
    buffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<string> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: mimetype, upsert: true });

    if (error) {
      throw new InternalServerErrorException(
        `Échec upload avatar: ${error.message}`,
      );
    }

    const { data } = this.client.storage.from(BUCKET).getPublicUrl(filename);
    return data.publicUrl;
  }

  async deleteAvatar(url: string): Promise<void> {
    const filename = this.extractFilename(url);
    if (!filename) return;
    await this.client.storage.from(BUCKET).remove([filename]);
  }

  private extractFilename(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const prefix = `/storage/v1/object/public/${BUCKET}/`;
      return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
    } catch {
      return null;
    }
  }
}
