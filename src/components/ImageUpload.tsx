import { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { useToastStore } from '../stores/toastStore';

interface ImageUploadProps {
  currentUrl?: string;
  onUpload: (url: string) => void;
  path: string;
}

export default function ImageUpload({ currentUrl, onUpload, path }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToastStore();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      onUpload(url);
    } catch {
      addToast('error', 'Image upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="mt-2">
      {currentUrl ? (
        <div className="relative inline-block group">
          <img
            src={currentUrl}
            alt="Question"
            className="max-w-[200px] max-h-[120px] rounded-xl object-cover border border-gray-200 dark:border-white/10"
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 bg-black/40 text-white text-xs font-medium rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            Replace
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
            dragActive ? 'border-brand bg-brand/5' : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
          }`}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-white/40">
              <div className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
              Uploading...
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-white/40">Click or drag image here (max 5MB)</p>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="hidden"
      />
    </div>
  );
}
