import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface StorageSignedUrlResult {
  signedUrl: string;
  token?: string;
}

export interface StorageAdapter {
  createSignedUploadUrl(
    bucket: string,
    path: string,
    expiresIn?: number
  ): Promise<StorageSignedUrlResult>;
  download(bucket: string, path: string): Promise<Uint8Array>;
  upload(
    bucket: string,
    path: string,
    data: Uint8Array | Buffer,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<void>;
  exists(bucket: string, path: string): Promise<boolean>;
  remove(bucket: string, path: string): Promise<void>;
  createSignedUrl(
    bucket: string,
    path: string,
    expiresIn?: number
  ): Promise<StorageSignedUrlResult>;
}

export class ProductionSupabaseStorageAdapter implements StorageAdapter {
  async createSignedUploadUrl(
    bucket: string,
    path: string,
    expiresIn = 600
  ): Promise<StorageSignedUrlResult> {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data?.signedUrl) {
      const errMsg = error ? error.message : "Failed to generate signed upload URL";
      throw new Error(`Storage signing failure: ${errMsg}`);
    }

    return {
      signedUrl: data.signedUrl,
      token: data.token,
    };
  }

  async download(bucket: string, path: string): Promise<Uint8Array> {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .download(path);

    if (error || !data) {
      const errMsg = error ? error.message : "File not found";
      throw new Error(`Storage download failure for ${bucket}/${path}: ${errMsg}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async upload(
    bucket: string,
    path: string,
    data: Uint8Array | Buffer,
    options: { contentType?: string; upsert?: boolean } = {}
  ): Promise<void> {
    const upsert = options.upsert ?? false;
    const contentType = options.contentType ?? "application/zip";

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, data, {
        contentType,
        upsert,
      });

    if (error) {
      throw new Error(`Storage upload failure for ${bucket}/${path}: ${error.message}`);
    }
  }

  async exists(bucket: string, path: string): Promise<boolean> {
    const pathParts = path.split("/");
    const fileName = pathParts.pop();
    const folderPath = pathParts.join("/");

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(folderPath, { limit: 100, search: fileName });

    if (error || !data) {
      return false;
    }

    return data.some((item) => item.name === fileName);
  }

  async remove(bucket: string, path: string): Promise<void> {
    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      throw new Error(`Storage remove failure for ${bucket}/${path}: ${error.message}`);
    }
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    expiresIn = 600
  ): Promise<StorageSignedUrlResult> {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) {
      const errMsg = error ? error.message : "Failed to generate signed URL";
      throw new Error(`Storage signed URL failure: ${errMsg}`);
    }

    return {
      signedUrl: data.signedUrl,
    };
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, Uint8Array>();
  public shouldFailSigning = false;
  public shouldFailRemove = false;

  private getKey(bucket: string, path: string): string {
    return `${bucket}::${path}`;
  }

  async createSignedUploadUrl(
    bucket: string,
    path: string,
    _expiresIn = 600
  ): Promise<StorageSignedUrlResult> {
    if (this.shouldFailSigning) {
      throw new Error("Storage signing failure: Memory mock forced error");
    }
    return {
      signedUrl: `https://storage.memory.local/upload/${bucket}/${path}?token=mock-upload-token`,
      token: "mock-upload-token",
    };
  }

  async download(bucket: string, path: string): Promise<Uint8Array> {
    const key = this.getKey(bucket, path);
    const data = this.store.get(key);
    if (!data) {
      throw new Error(`Storage download failure for ${bucket}/${path}: Object not found`);
    }
    return new Uint8Array(data);
  }

  async upload(
    bucket: string,
    path: string,
    data: Uint8Array | Buffer,
    options: { contentType?: string; upsert?: boolean } = {}
  ): Promise<void> {
    const key = this.getKey(bucket, path);
    if (!options.upsert && this.store.has(key)) {
      throw new Error(`Storage upload failure for ${bucket}/${path}: Object already exists and upsert is false`);
    }
    this.store.set(key, new Uint8Array(data));
  }

  async exists(bucket: string, path: string): Promise<boolean> {
    return this.store.has(this.getKey(bucket, path));
  }

  async remove(bucket: string, path: string): Promise<void> {
    if (this.shouldFailRemove) {
      throw new Error(`Storage remove failure for ${bucket}/${path}: Forced removal error`);
    }
    this.store.delete(this.getKey(bucket, path));
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    expiresIn = 600
  ): Promise<StorageSignedUrlResult> {
    if (this.shouldFailSigning) {
      throw new Error("Storage signed URL failure: Memory mock forced error");
    }
    const exists = await this.exists(bucket, path);
    if (!exists) {
      throw new Error(`Storage signed URL failure: Object ${bucket}/${path} does not exist`);
    }
    return {
      signedUrl: `https://storage.memory.local/access/${bucket}/${path}?expires=${expiresIn}&token=mock-access-token`,
    };
  }

  // Test helper method to seed objects directly into memory
  seed(bucket: string, path: string, data: Uint8Array): void {
    this.store.set(this.getKey(bucket, path), new Uint8Array(data));
  }

  // Test helper method to get raw bytes
  peek(bucket: string, path: string): Uint8Array | undefined {
    return this.store.get(this.getKey(bucket, path));
  }

  clear(): void {
    this.store.clear();
    this.shouldFailSigning = false;
    this.shouldFailRemove = false;
  }
}
