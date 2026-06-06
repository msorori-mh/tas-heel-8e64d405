"use client";

import { useState, useRef } from "react";
import { Upload, X, FileText, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface FileUploadProps {
  bucket: string;
  accept: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  icon?: "video" | "pdf";
  maxSizeMB?: number;
}

const FileUpload = ({ bucket, accept, label, value, onChange, icon = "pdf", maxSizeMB = 100 }: FileUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`الحد الأقصى لحجم الملف ${maxSizeMB} ميغابايت`);
      return;
    }

    setUploading(true);
    setProgress(0);

    const ext = file.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      alert("فشل الرفع: " + error.message);
      setUploading(false);
      return;
    }

    // Private lesson buckets: store an internal reference (never a public URL).
    // Public/other buckets: keep existing publicUrl behaviour.
    const PRIVATE_LESSON_BUCKETS = new Set(["lesson-pdfs", "lesson-videos"]);
    if (PRIVATE_LESSON_BUCKETS.has(bucket)) {
      onChange(`supabase-storage://${bucket}/${path}`);
    } else {
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(urlData.publicUrl);
    }

    setUploading(false);
    setProgress(100);
  };

  const clear = () => {
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const Icon = icon === "video" ? Film : FileText;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 truncate text-xs text-muted-foreground" dir="ltr">{value.split("/").pop()}</span>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={clear}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-4 transition-colors hover:border-primary/50 hover:bg-muted/30"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {uploading ? "جاري الرفع..." : `اضغط لرفع ${icon === "video" ? "فيديو" : "ملف PDF"}`}
          </span>
        </div>
      )}
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleUpload} />
    </div>
  );
};

export default FileUpload;
