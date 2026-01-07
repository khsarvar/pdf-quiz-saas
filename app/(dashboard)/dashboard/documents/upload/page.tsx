'use client';

import { useState } from 'react';
import type { ChangeEvent, FormEvent, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, FileText } from 'lucide-react';
import Link from 'next/link';

type UploadState = {
  status: 'idle' | 'requesting-url' | 'uploading' | 'completing' | 'success' | 'error';
  progress: number;
  error?: string;
};

export default function UploadPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadState({ status: 'idle', progress: 0 });
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) {
      setSelectedFile(file);
      setUploadState({ status: 'idle', progress: 0 });
    }
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      return;
    }

    try {
      // Step 1: Request presigned URL
      setUploadState({ status: 'requesting-url', progress: 0 });
      const urlResponse = await fetch('/api/documents/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          size: selectedFile.size,
          contentType: selectedFile.type,
        }),
      });

      if (!urlResponse.ok) {
        const errorData = await urlResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { presignedUrl, storageKey, contentType } = await urlResponse.json();

      // Step 2: Upload file directly to R2
      setUploadState({ status: 'uploading', progress: 0 });

      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': contentType,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      setUploadState({ status: 'uploading', progress: 100 });

      // Step 3: Notify server that upload is complete
      setUploadState({ status: 'completing', progress: 100 });
      const completeResponse = await fetch('/api/documents/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          storageKey,
          contentType,
        }),
      });

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json();
        throw new Error(errorData.error || 'Failed to complete upload');
      }

      // Step 4: Redirect to documents list
      setUploadState({ status: 'success', progress: 100 });
      router.push('/dashboard/documents');
    } catch (error) {
      console.error('Upload error:', error);
      setUploadState({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Failed to upload document. Please try again.',
      });
    }
  };

  const isPending =
    uploadState.status === 'requesting-url' ||
    uploadState.status === 'uploading' ||
    uploadState.status === 'completing';

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href="/dashboard/documents"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to Documents
          </Link>
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mt-2">
            Generate Quiz
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload PDF, PPTX, DOC, or DOCX files to automatically generate quizzes from your lecture materials.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-6">
              <div>
                <Label htmlFor="file" className="mb-2">
                  Select File
                </Label>
                <div
                  className={`mt-2 flex justify-center rounded-lg border border-dashed px-6 py-10 transition-colors ${
                    isDragging
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-300'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="text-center">
                    <FileText className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="mt-4 flex text-sm leading-6 text-gray-600">
                      <label
                        htmlFor="file"
                        className="relative cursor-pointer rounded-md bg-white font-semibold text-orange-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-offset-2 hover:text-orange-600"
                      >
                        <span>Upload a file</span>
                        <input
                          id="file"
                          name="file"
                          type="file"
                          accept=".pdf,.pptx,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="sr-only"
                          required
                          onChange={handleFileChange}
                          disabled={isPending}
                        />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs leading-5 text-gray-600 mt-2">
                      PDF, PPTX, DOC, or DOCX up to 50MB
                    </p>
                  </div>
                </div>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{selectedFile.name}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}

              {uploadState.status === 'uploading' && uploadState.progress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Uploading...</span>
                    <span>{Math.round(uploadState.progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadState.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {uploadState.error && (
                <div className="rounded-md bg-red-50 p-4">
                  <p className="text-sm text-red-800">{uploadState.error}</p>
                </div>
              )}

              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  asChild
                  disabled={isPending}
                >
                  <Link href="/dashboard/documents">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  disabled={isPending || !selectedFile}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {uploadState.status === 'requesting-url' && 'Preparing...'}
                      {uploadState.status === 'uploading' && 'Uploading...'}
                      {uploadState.status === 'completing' && 'Processing...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
