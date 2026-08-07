import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface StorageClientAdapter {
  createSignedUploadUrl(
    bucket: string,
    path: string,
  ): Promise<{ signedUrl: string; token: string }>;
  download(
    bucket: string,
    path: string,
  ): Promise<{ data: Uint8Array | null; error: Error | null }>;
  upload(
    bucket: string,
    path: string,
    bytes: Uint8Array,
    mimeType?: string,
    upsert?: boolean,
  ): Promise<{ error: Error | null }>;
  copy(
    fromBucket: string,
    fromPath: string,
    toBucket: string,
    toPath: string,
  ): Promise<{ error: Error | null }>;
  createSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number,
  ): Promise<{ signedUrl: string | null; error: Error | null }>;
  remove(bucket: string, paths: string[]): Promise<{ error: Error | null }>;
}

export const defaultSupabaseStorageAdapter: StorageClientAdapter = {
  async createSignedUploadUrl(bucket: string, path: string) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(path);
    if (error || !data?.signedUrl) {
      throw new Error(
        `فشل إنشاء رابط الرفع الموقع: ${error?.message || "Storage error"}`,
      );
    }
    return { signedUrl: data.signedUrl, token: data.token };
  },

  async download(bucket: string, path: string) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .download(path);
    if (error || !data) {
      return {
        data: null,
        error: error
          ? new Error(error.message)
          : new Error("الملف غير موجود في التخزين"),
      };
    }
    const arrayBuffer = await data.arrayBuffer();
    return { data: new Uint8Array(arrayBuffer), error: null };
  },

  async upload(
    bucket: string,
    path: string,
    bytes: Uint8Array,
    mimeType = "application/octet-stream",
    upsert = false,
  ) {
    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, bytes, {
      contentType: mimeType,
      upsert,
    });
    return { error: error ? new Error(error.message) : null };
  },

  async copy(fromBucket: string, fromPath: string, toBucket: string, toPath: string) {
    if (fromBucket === toBucket) {
      const { error } = await supabaseAdmin.storage.from(fromBucket).copy(fromPath, toPath);
      return { error: error ? new Error(error.message) : null };
    }
    const { data, error: downErr } = await this.download(fromBucket, fromPath);
    if (downErr || !data) {
      return { error: downErr || new Error("فشل تنزيل المصدر لإكمال عملية النسخ") };
    }
    const { error: upErr } = await this.upload(toBucket, toPath, data, "application/octet-stream", false);
    return { error: upErr };
  },

  async createSignedUrl(bucket: string, path: string, expiresIn: number) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      return {
        signedUrl: null,
        error: error
          ? new Error(error.message)
          : new Error("فشل إنشاء رابط الوصول الموقع"),
      };
    }
    return { signedUrl: data.signedUrl, error: null };
  },

  async remove(bucket: string, paths: string[]) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
    return { error: error ? new Error(error.message) : null };
  },
};
