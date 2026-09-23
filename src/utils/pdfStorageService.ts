import { getSupabaseClient } from './supabaseClient';
import {
  setFileInIndexedDb,
  getFileFromIndexedDb,
  deleteFileFromIndexedDb,
} from './indexedDbService';

const CHUNK_SIZE = 1.5 * 1024 * 1024; // 1.5MB per chunk (rock-solid against Supabase/Cloudflare/Kong gateway payload limits)

export interface SavePdfProgress {
  currentChunk: number;
  totalChunks: number;
  percent: number;
}

export interface SavePdfResult {
  success: boolean;
  fileKey: string;
  dataUrl?: string;
  sizeFormatted: string;
  error?: string;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 KB';
  if (bytes > 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

export function getMimeTypeFromFileName(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(';base64,');
  const contentType = parts[0].split(':')[1] || 'application/octet-stream';
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo original'));
    reader.readAsDataURL(file);
  });
}

/**
 * Persists a real file (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT) into Supabase fenix_kv_store and IndexedDB.
 * Guarantees that the file is not lost and is available across devices and page refreshes.
 */
export async function persistPdfFile(
  fileId: string,
  fileOrDataUrl: File | Blob | string,
  fileName: string,
  userName = 'Usuário Fênix',
  customMimeType?: string,
  onProgress?: (progress: SavePdfProgress) => void
): Promise<SavePdfResult> {
  try {
    let dataUrl: string;
    let byteLength = 0;
    let mimeType = customMimeType || getMimeTypeFromFileName(fileName);

    if (typeof fileOrDataUrl === 'string') {
      dataUrl = fileOrDataUrl;
      // Approximate bytes from base64
      byteLength = Math.round((dataUrl.length * 3) / 4);
      if (!customMimeType && dataUrl.startsWith('data:')) {
        const extracted = dataUrl.substring(5, dataUrl.indexOf(';'));
        if (extracted) mimeType = extracted;
      }
    } else {
      byteLength = fileOrDataUrl.size;
      if (fileOrDataUrl.type) {
        mimeType = fileOrDataUrl.type;
      }
      dataUrl = await fileToDataUrl(fileOrDataUrl);
    }

    const formattedSize = formatBytes(byteLength);
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase não inicializado. Verifique as configurações de conexão.');
    }

    const mainKey = `fenix_file_${fileId}`;
    const now = new Date().toISOString();

    // 1. Cache immediately in IndexedDB for snappy local access
    await setFileInIndexedDb({
      id: fileId,
      fileName,
      mimeType,
      dataUrl,
      size: byteLength,
      savedAt: now,
    });

    // Helper for upserting with automatic retry (up to 3 attempts with exponential delay)
    const upsertWithRetry = async (row: any, maxAttempts = 3): Promise<void> => {
      let lastError: any = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const { error } = await client
            .from('fenix_kv_store')
            .upsert(row, { onConflict: 'key' });
          if (!error) return;
          lastError = error;
        } catch (e: any) {
          lastError = e;
        }
        if (attempt < maxAttempts) {
          // Wait before retry: 500ms, 1200ms
          await new Promise((r) => setTimeout(r, attempt * 600));
        }
      }
      throw lastError || new Error('Falha de rede ao se comunicar com o Supabase.');
    };

    // 2. Decide if chunking is needed (dataUrl length > CHUNK_SIZE)
    if (dataUrl.length > CHUNK_SIZE) {
      const totalChunks = Math.ceil(dataUrl.length / CHUNK_SIZE);
      const manifest = {
        id: fileId,
        fileName,
        mimeType,
        size: byteLength,
        isChunked: true,
        totalChunks,
        savedAt: now,
      };

      // Upsert manifest
      try {
        await upsertWithRetry({
          key: mainKey,
          data: manifest,
          updated_at: now,
          updated_by: userName,
        });
      } catch (err: any) {
        throw new Error(`Erro ao registrar manifesto do arquivo no Supabase: ${err.message || err}`);
      }

      // Upsert chunks with retries
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, dataUrl.length);
        const chunkData = dataUrl.substring(start, end);
        const chunkKey = `${mainKey}_c${i}`;

        if (onProgress) {
          onProgress({
            currentChunk: i + 1,
            totalChunks,
            percent: Math.round(((i + 1) / totalChunks) * 100),
          });
        }

        try {
          await upsertWithRetry({
            key: chunkKey,
            data: { index: i, chunk: chunkData },
            updated_at: now,
            updated_by: userName,
          });
        } catch (chunkErr: any) {
          throw new Error(
            `Erro ao enviar parte ${i + 1}/${totalChunks} do arquivo para o Supabase: ${chunkErr?.message || 'timeout/rede'}`
          );
        }
      }
    } else {
      // Single payload upload
      const payload = {
        id: fileId,
        fileName,
        mimeType,
        size: byteLength,
        isChunked: false,
        dataUrl,
        savedAt: now,
      };

      if (onProgress) {
        onProgress({ currentChunk: 1, totalChunks: 1, percent: 100 });
      }

      try {
        await upsertWithRetry({
          key: mainKey,
          data: payload,
          updated_at: now,
          updated_by: userName,
        });
      } catch (uploadErr: any) {
        throw new Error(`Erro ao salvar arquivo no Supabase: ${uploadErr.message || uploadErr}`);
      }
    }

    return {
      success: true,
      fileKey: mainKey,
      dataUrl,
      sizeFormatted: formattedSize,
    };
  } catch (err: any) {
    console.error('Erro na persistência do arquivo PDF:', err);
    return {
      success: false,
      fileKey: `fenix_file_${fileId}`,
      sizeFormatted: '0 KB',
      error: err?.message || 'Falha desconhecida ao salvar arquivo no Supabase.',
    };
  }
}

/**
 * Retrieves the full original PDF data URL by file ID.
 * Tries local IndexedDB first, then loads from Supabase (reassembling chunks if needed).
 */
export async function getPdfDataUrl(fileId: string): Promise<string | null> {
  if (!fileId) return null;

  // 1. Try local IndexedDB cache
  try {
    const cached = await getFileFromIndexedDb(fileId);
    if (cached && cached.dataUrl) {
      return cached.dataUrl;
    }
  } catch {
    // ignore
  }

  // 2. Fetch from Supabase
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const mainKey = fileId.startsWith('fenix_file_') ? fileId : `fenix_file_${fileId}`;
    const cleanId = fileId.replace(/^fenix_file_/, '');
    const { data: row, error } = await client
      .from('fenix_kv_store')
      .select('data')
      .eq('key', mainKey)
      .maybeSingle();

    if (error || !row || !row.data) {
      return null;
    }

    let fullDataUrl = '';
    const record = row.data;

    if (record.isChunked && typeof record.totalChunks === 'number') {
      const totalChunks = record.totalChunks;
      const chunkKeys = Array.from({ length: totalChunks }, (_, i) => `${mainKey}_c${i}`);
      const chunksMap = new Map<number, string>();

      // Fetch in batches of 10 to guarantee no header/body overflow
      const BATCH_SIZE = 10;
      for (let b = 0; b < chunkKeys.length; b += BATCH_SIZE) {
        const batchKeys = chunkKeys.slice(b, b + BATCH_SIZE);
        let batchRows: any[] | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { data, error: bErr } = await client
              .from('fenix_kv_store')
              .select('key, data')
              .in('key', batchKeys);
            if (!bErr && data) {
              batchRows = data;
              break;
            }
          } catch {}
          if (attempt < 3) await new Promise((r) => setTimeout(r, 400));
        }

        if (batchRows) {
          for (const cr of batchRows) {
            if (cr.data && typeof cr.data.index === 'number' && cr.data.chunk) {
              chunksMap.set(cr.data.index, cr.data.chunk);
            }
          }
        }
      }

      const parts: string[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const p = chunksMap.get(i);
        if (!p) throw new Error(`Parte ${i + 1}/${totalChunks} ausente ao recompor arquivo`);
        parts.push(p);
      }
      fullDataUrl = parts.join('');
    } else if (record.dataUrl) {
      fullDataUrl = record.dataUrl;
    }

    if (fullDataUrl) {
      // Re-populate IndexedDB cache for future instant access
      setFileInIndexedDb({
        id: fileId,
        fileName: record.fileName || 'arquivo.pdf',
        mimeType: record.mimeType || 'application/pdf',
        dataUrl: fullDataUrl,
        size: record.size || 0,
        savedAt: new Date().toISOString(),
      }).catch(() => {});
      return fullDataUrl;
    }

    return null;
  } catch (err) {
    console.error('Erro ao recuperar arquivo do Supabase:', err);
    return null;
  }
}

/**
 * Returns a native Blob of the original PDF
 */
export async function getPdfBlob(fileId: string): Promise<Blob | null> {
  const dataUrl = await getPdfDataUrl(fileId);
  if (!dataUrl) return null;
  try {
    return dataUrlToBlob(dataUrl);
  } catch (e) {
    console.error('Erro ao converter dataUrl para Blob:', e);
    return null;
  }
}

/**
 * Deletes the PDF and any chunks from Supabase and IndexedDB
 */
export async function deletePdfFile(fileId: string): Promise<void> {
  if (!fileId) return;
  await deleteFileFromIndexedDb(fileId);

  const client = getSupabaseClient();
  if (!client) return;

  try {
    const mainKey = fileId.startsWith('fenix_file_') ? fileId : `fenix_file_${fileId}`;
    const cleanId = fileId.replace(/^fenix_file_/, '');
    await deleteFileFromIndexedDb(cleanId);
    const { data: row } = await client
      .from('fenix_kv_store')
      .select('data')
      .eq('key', mainKey)
      .maybeSingle();

    if (row?.data?.isChunked && typeof row.data.totalChunks === 'number') {
      const totalChunks = row.data.totalChunks;
      const keysToDelete = [
        mainKey,
        ...Array.from({ length: totalChunks }, (_, i) => `${mainKey}_c${i}`),
      ];
      await client.from('fenix_kv_store').delete().in('key', keysToDelete);
    } else {
      await client.from('fenix_kv_store').delete().eq('key', mainKey);
    }
  } catch (err) {
    console.warn('Erro ao deletar arquivo do Supabase:', err);
  }
}

/**
 * Copies the raw PDF file directly to the system clipboard using the modern ClipboardItem API.
 * If the device or browser doesn't permit writing 'application/pdf' to the clipboard, returns fallbackNeeded: true.
 */
export async function copyPdfToClipboard(
  fileId: string,
  _fileName: string
): Promise<{ success: boolean; fallbackNeeded?: boolean; error?: string }> {
  try {
    const blob = await getPdfBlob(fileId);
    if (!blob) {
      return { success: false, error: 'Arquivo não encontrado para cópia.' };
    }

    if (typeof window !== 'undefined' && navigator?.clipboard?.write) {
      try {
        const item = new ClipboardItem({
          'application/pdf': blob,
        });
        await navigator.clipboard.write([item]);
        return { success: true };
      } catch (clipboardErr) {
        console.warn('ClipboardItem application/pdf não suportado nativamente pelo browser:', clipboardErr);
        // Fallback: browser security policy restricted application/pdf
        return { success: false, fallbackNeeded: true };
      }
    }
    return { success: false, fallbackNeeded: true };
  } catch (err: any) {
    return { success: false, fallbackNeeded: true, error: err?.message };
  }
}

/**
 * Triggers a direct download of the original PDF without any conversion or modification
 */
export async function downloadPdfFile(fileId: string, fileName: string): Promise<boolean> {
  try {
    const blob = await getPdfBlob(fileId);
    if (!blob) return false;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch (e) {
    console.error('Erro ao baixar arquivo PDF:', e);
    return false;
  }
}
