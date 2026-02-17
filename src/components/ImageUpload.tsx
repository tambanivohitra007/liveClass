import { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

interface ImageUploadProps {
  currentUrl?: string;
  onUpload: (url: string) => void;
  path: string;
}

export default function ImageUpload({ currentUrl, onUpload, path }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB max

    setUploading(true);
    try {
      const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      onUpload(url);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label>Question Image</label>
      <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
      {uploading && <p>Uploading...</p>}
      {currentUrl && (
        <img src={currentUrl} alt="Question" style={{ maxWidth: '200px', maxHeight: '150px', marginTop: '0.5rem' }} />
      )}
    </div>
  );
}
