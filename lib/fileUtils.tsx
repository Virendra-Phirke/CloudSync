import {
  FileText, Image as ImageIcon, Film, Music, FileCode, FileArchive, File as FileIcon, Folder
} from 'lucide-react';

export type ViewerType = 'pdf' | 'image' | 'video' | 'audio' | 'docx' | 'text' | 'fallback';

export const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);
export const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']);
export const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma']);
export const TEXT_EXTS = new Set([
  'txt', 'md', 'json', 'csv', 'xml', 'html', 'htm', 'css', 'js', 'jsx',
  'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'rs', 'go', 'rb',
  'php', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'env', 'log', 'sql', 'graphql', 'prisma', 'svelte', 'vue',
]);

export function getFileExtension(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function detectViewerType(name: string, mimeType?: string): ViewerType {
  const ext = getFileExtension(name);
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (IMAGE_EXTS.has(ext) || mimeType?.startsWith('image/')) return 'image';
  if (VIDEO_EXTS.has(ext) || mimeType?.startsWith('video/')) return 'video';
  if (AUDIO_EXTS.has(ext) || mimeType?.startsWith('audio/')) return 'audio';
  if (TEXT_EXTS.has(ext) || mimeType?.startsWith('text/') || mimeType === 'application/json') return 'text';
  return 'fallback';
}

export function getFileTypeInfo(name: string, mimeType?: string, isDirectory?: boolean) {
  if (isDirectory) {
    return { color: 'text-sky-400', bg: 'bg-sky-500/10', borderColor: 'border-sky-500/20', icon: Folder, label: 'Folder' };
  }
  const ext = getFileExtension(name);
  const type = detectViewerType(name, mimeType);
  switch (type) {
    case 'pdf':
      return { color: 'text-red-400', bg: 'bg-red-500/10', borderColor: 'border-red-500/20', icon: FileText, label: 'PDF Document' };
    case 'docx':
      return { color: 'text-blue-400', bg: 'bg-blue-500/10', borderColor: 'border-blue-500/20', icon: FileText, label: 'Word Document' };
    case 'image':
      return { color: 'text-purple-400', bg: 'bg-purple-500/10', borderColor: 'border-purple-500/20', icon: ImageIcon, label: 'Image' };
    case 'video':
      return { color: 'text-pink-400', bg: 'bg-pink-500/10', borderColor: 'border-pink-500/20', icon: Film, label: 'Video' };
    case 'audio':
      return { color: 'text-orange-400', bg: 'bg-orange-500/10', borderColor: 'border-orange-500/20', icon: Music, label: 'Audio' };
    case 'text':
      return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20', icon: FileCode, label: 'Code / Text' };
    default:
      if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
        return { color: 'text-amber-400', bg: 'bg-amber-500/10', borderColor: 'border-amber-500/20', icon: FileArchive, label: 'Archive' };
      }
      return { color: 'text-neutral-400', bg: 'bg-neutral-500/10', borderColor: 'border-neutral-500/20', icon: FileIcon, label: 'File' };
  }
}
