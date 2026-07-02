import { TranscriptionSettings, TranscriptionCue } from '../types';

// Main function that proxies the transcription request to our Express server
export const transcribeAudio = async (
  settings: TranscriptionSettings,
  audioFile: File,
  audioDuration: number | null,
  onProgress?: (cues: TranscriptionCue[]) => void
): Promise<string> => {
  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('settings', JSON.stringify(settings));

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to transcribe audio.');
  }

  if (!response.body) {
    throw new Error('Response body is null.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullTranscript = '';
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.cues && onProgress) {
            onProgress(parsed.cues);
          }
          if (parsed.fullText) {
             fullTranscript = parsed.fullText;
          }
        } catch (e: any) {
          if (e.message && !e.message.includes('JSON')) {
            throw e;
          }
          console.error('Failed to parse SSE line:', line, e);
        }
      }
    }
  }

  return fullTranscript;
};
