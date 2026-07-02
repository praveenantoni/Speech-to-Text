
import React, { useState, useCallback, ChangeEvent, useRef, useEffect } from 'react';
import { transcribeAudio } from './services/geminiService';
import { TimestampMode, TimestampFormat, Punctuation, TranscriptionSettings, TranscriptionCue, TranscriptionItem, ProcessingStatus } from './types';
import { UploadIcon, FileAudioIcon, CopyIcon, CheckIcon, DownloadIcon, VideoCameraIcon, PlayIcon, PauseIcon, TrashIcon, ListIcon, CloudIcon } from './components/icons';


// Make WaveSurfer available from the global scope (loaded via CDN)
declare const WaveSurfer: any;

// Reusable UI Components
interface RadioGroupProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}

const RadioGroup = <T extends string>({ label, value, onChange, options, disabled }: RadioGroupProps<T>) => (
  <div>
    <label className="block text-sm font-medium text-slate-400 mb-2">{label}</label>
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed ${
            value === option.value
              ? 'bg-cyan-600 text-white shadow-md'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

interface RadioGroupHorizontalProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}

const RadioGroupHorizontal = <T extends string>({ label, value, onChange, options, disabled }: RadioGroupHorizontalProps<T>) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
    <label className="text-sm font-medium text-slate-400 whitespace-nowrap">{label}</label>
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed ${
            value === option.value
              ? 'bg-cyan-600 text-white shadow-md'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

interface ToggleSwitchProps {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, enabled, onChange, disabled }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm font-medium text-slate-400 whitespace-nowrap">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      className={`${
        enabled ? 'bg-cyan-600' : 'bg-slate-700'
      } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span
        className={`${
          enabled ? 'translate-x-5' : 'translate-x-0'
        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
      />
    </button>
  </div>
);

interface FileUploadProps {
    onFilesAdded: (files: File[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesAdded }) => {
    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesAdded(Array.from(e.target.files));
        }
        // Reset input so same file can be selected again if needed
        e.target.value = '';
    };

    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesAdded(Array.from(e.dataTransfer.files));
        }
    };

    return (
        <div className="w-full">
            <label
                htmlFor="media-upload"
                className="flex cursor-pointer justify-center rounded-lg border-2 border-dashed border-slate-600 px-6 py-8 transition-colors duration-200 hover:border-cyan-500 bg-slate-800/30 hover:bg-slate-800/50"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <div className="text-center">
                    <UploadIcon className="mx-auto h-10 w-10 text-slate-500 mb-2" />
                    <p className="mt-1 text-sm text-slate-300">
                        Drag & drop or <span className="font-semibold text-cyan-400">browse</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">MP3, WAV, MP4, MOV</p>
                    <input id="media-upload" name="media-upload" type="file" className="sr-only" onChange={handleFileChange} accept="audio/*,video/*" multiple />
                </div>
            </label>
        </div>
    );
};

// Utility Functions

const parseTimestamp = (timestamp: string | number): number => {
    if (typeof timestamp === 'number') {
        return Math.round(timestamp * 1000);
    }
    if (!timestamp) return NaN;
    const time = timestamp.replace(/[\[\]"']/g, '').trim();
    if (!time) return NaN;

    if (time.endsWith('ms')) return parseInt(time.replace('ms', ''), 10);
    if (/^\d+(\.\d+)?s?$/.test(time)) return Math.round(parseFloat(time.replace('s', '')) * 1000);

    let timePart = time;
    let msPart = '0';
    
    const separators = ['.', ','];
    let sepIndex = -1;
    for (const sep of separators) {
        sepIndex = time.lastIndexOf(sep);
        if (sepIndex !== -1) break;
    }

    if (sepIndex !== -1) {
        timePart = time.substring(0, sepIndex);
        msPart = time.substring(sepIndex + 1);
    }

    const timeSegments = timePart.split(':').map(t => parseInt(t, 10));

    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    
    if (timeSegments.length === 3) [hours, minutes, seconds] = timeSegments;
    else if (timeSegments.length === 2) [minutes, seconds] = timeSegments;
    else if (timeSegments.length === 1) [seconds] = timeSegments;
    else if (timeSegments.length === 4) {
         hours = timeSegments[0];
         minutes = timeSegments[1];
         seconds = timeSegments[2];
         msPart = timeSegments[3].toString();
    } else return NaN;

    const milliseconds = parseInt(msPart.padEnd(3, '0').substring(0, 3), 10);
    const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
    
    return isNaN(totalMs) ? NaN : totalMs;
};


const normalizeCues = (cues: TranscriptionCue[]): TranscriptionCue[] => {
    if (cues.length === 0) return [];
    
    // Just ensure chronological ordering and non-negative durations
    return cues.map(cue => {
        let start = Math.max(0, cue.start);
        let end = Math.max(start, cue.end);
        return {
            ...cue,
            start,
            end
        };
    });
};

const parseTranscription = (rawText: string): TranscriptionCue[] => {
    if (!rawText) return [];

    try {
        let cleanedText = rawText.trim();
        // Strip markdown codeblock wrapper if present
        if (cleanedText.startsWith('```')) {
            const firstNewLine = cleanedText.indexOf('\n');
            if (firstNewLine !== -1) {
                cleanedText = cleanedText.substring(firstNewLine + 1);
            } else {
                cleanedText = cleanedText.replace(/^```[a-zA-Z]*/, '');
            }
        }
        if (cleanedText.endsWith('```')) {
            cleanedText = cleanedText.substring(0, cleanedText.length - 3).trim();
        }
        cleanedText = cleanedText.trim();

        const json = JSON.parse(cleanedText);
        if (Array.isArray(json)) {
            const parsed = json.map((item: any) => {
                 // Support both optimized (s,e,w) and verbose (start,end,text) keys
                 const rawStart = item.s !== undefined ? item.s : item.start;
                 const rawEnd = item.e !== undefined ? item.e : item.end;
                 const word = item.w || item.text || item.word; 
                 
                 const start = parseTimestamp(rawStart);
                 const end = parseTimestamp(rawEnd);
                 
                 // Strict filtering: discard invalid timestamps or empty words
                 if (typeof start !== 'number' || isNaN(start) || 
                     typeof end !== 'number' || isNaN(end) || 
                     !word || String(word).trim() === '') {
                     return null;
                 }
                 
                 return { 
                    word: String(word).trim(), 
                    start: Math.round(start),
                    end: Math.round(end)
                 };
            }).filter((cue: any): cue is TranscriptionCue => cue !== null);
            return normalizeCues(parsed).sort((a, b) => a.start - b.start);
        }
    } catch (e) {
        // Fallback for non-JSON response
    }
    
    const regex = /((?:\d{1,2}:)?(?:\d{1,2}:)?\d{1,2}(?:[:.,]\d{1,3})?|\d+ms)\s*-{1,2}>\s*((?:\d{1,2}:)?(?:\d{1,2}:)?\d{1,2}(?:[:.,]\d{1,3})?|\d+ms)\s*(?:["']?)(.*?)(?:["']?)\s*$/gm;
    const matches = Array.from(rawText.matchAll(regex));

    const parsedCues = matches.map(match => {
        const start = parseTimestamp(match[1].trim());
        const end = parseTimestamp(match[2].trim());
        let word = match[3].replace(/^["']+|["']+$/g, ''); 
        if (/^\d+\s+(?=[a-zA-Z])/.test(word)) word = word.replace(/^\d+\s+/, '');
        
        if (isNaN(start) || isNaN(end) || !word || word.trim() === '') return null;
        
        return { word, start, end };
    }).filter((cue): cue is TranscriptionCue => cue !== null);

    return normalizeCues(parsedCues).sort((a, b) => a.start - b.start);
};

const formatTime = (totalMilliseconds: number, format: TimestampFormat, separator = '.'): string => {
    if (isNaN(totalMilliseconds)) return "00:00:00";
    const roundedMs = Math.round(totalMilliseconds);
    if (format === TimestampFormat.MS) return `${String(roundedMs).padStart(6, '0')}ms`;

    const totalSeconds = Math.floor(roundedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    const milliseconds = (roundedMs % 1000).toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}${separator}${milliseconds}`;
};


const generateVTT = (cues: TranscriptionCue[], format: TimestampFormat): string => {
    let vttContent = 'WEBVTT\n\n';
    cues.forEach((cue) => {
        const start = formatTime(cue.start, format);
        const end = formatTime(cue.end, format);
        vttContent += `${start} --> ${end}\n${cue.word}\n\n`;
    });
    return vttContent;
};

const App: React.FC = () => {
  const [settings, setSettings] = useState<TranscriptionSettings>({
    timestampMode: TimestampMode.WORDSTAMP,
    timestampFormat: TimestampFormat.HMS,
    punctuation: Punctuation.ON,
    syncOffset: 0,
    scrollBehavior: 'smooth',
  });

  // Multiple Files State
  const [items, setItems] = useState<TranscriptionItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Derived Active Item State
  const activeItem = items.find(i => i.id === activeId) || null;
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [activeDuration, setActiveDuration] = useState<number | null>(null);

  // UI State
  const [copied, setCopied] = useState<boolean>(false);
  const [activeCueIndex, setActiveCueIndex] = useState<number>(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Subtitle/Cue Editing State
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editWord, setEditWord] = useState<string>('');
  const [editStart, setEditStart] = useState<string>('');
  const [editEnd, setEditEnd] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);

  // Media refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isWaveformReady, setIsWaveformReady] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);

  // Editing and Subtitle Management Helpers
  const startEditing = (index: number, cue: TranscriptionCue) => {
      setEditingIndex(index);
      setEditWord(cue.word);
      setEditStart(formatTime(cue.start, settings.timestampFormat));
      setEditEnd(formatTime(cue.end, settings.timestampFormat));
      setEditError(null);
  };

  const deleteCue = (index: number) => {
      if (!activeItem) return;
      const updatedCues = activeItem.cues.filter((_, i) => i !== index);
      updateItemStatus(activeItem.id, {
          cues: updatedCues,
          fullTranscript: updatedCues.map(c => c.word).join(' ')
      });
      if (editingIndex === index) {
          setEditingIndex(null);
      }
  };

  const mergeWithNext = (index: number) => {
      if (!activeItem || index >= activeItem.cues.length - 1) return;
      const currentCue = activeItem.cues[index];
      const nextCue = activeItem.cues[index + 1];
      
      const mergedCue: TranscriptionCue = {
          start: currentCue.start,
          end: nextCue.end,
          word: `${currentCue.word} ${nextCue.word}`.trim()
      };
      
      const updatedCues = activeItem.cues.filter((_, i) => i !== index && i !== index + 1);
      updatedCues.splice(index, 0, mergedCue);
      
      const normalized = normalizeCues(updatedCues).sort((a, b) => a.start - b.start);
      updateItemStatus(activeItem.id, {
          cues: normalized,
          fullTranscript: normalized.map(c => c.word).join(' ')
      });
  };

  const splitCue = (index: number) => {
      if (!activeItem) return;
      const cue = activeItem.cues[index];
      const midTime = Math.round(cue.start + (cue.end - cue.start) / 2);
      
      const words = cue.word.split(/\s+/);
      let cue1: TranscriptionCue;
      let cue2: TranscriptionCue;

      if (words.length <= 1) {
          cue1 = { start: cue.start, end: midTime, word: cue.word };
          cue2 = { start: midTime, end: cue.end, word: '...' };
      } else {
          const midWordIndex = Math.ceil(words.length / 2);
          const word1 = words.slice(0, midWordIndex).join(' ');
          const word2 = words.slice(midWordIndex).join(' ');
          cue1 = { start: cue.start, end: midTime, word: word1 };
          cue2 = { start: midTime, end: cue.end, word: word2 };
      }
      
      const updatedCues = [...activeItem.cues];
      updatedCues.splice(index, 1, cue1, cue2);
      
      const normalized = normalizeCues(updatedCues).sort((a, b) => a.start - b.start);
      updateItemStatus(activeItem.id, {
          cues: normalized,
          fullTranscript: normalized.map(c => c.word).join(' ')
      });
  };

  const insertCueAtCurrentTime = () => {
      if (!activeItem) return;
      const currentTimeMs = Math.round(playerCurrentTime * 1000);
      
      const newCue: TranscriptionCue = {
          start: currentTimeMs,
          end: currentTimeMs + 2000, // default 2 seconds
          word: "New subtitle"
      };
      
      const updatedCues = [...activeItem.cues, newCue];
      const sorted = normalizeCues(updatedCues).sort((a, b) => a.start - b.start);
      
      updateItemStatus(activeItem.id, {
          cues: sorted,
          fullTranscript: sorted.map(c => c.word).join(' ')
      });
  };

  const loadDemoData = () => {
      const demoFile = new File([""], "space_royals_mission.mp3", { type: "audio/mp3" });
      
      const demoCues: TranscriptionCue[] = [
          { start: 0, end: 1200, word: "Chapter 1." },
          { start: 2000, end: 3000, word: "Slurp, slurp." },
          { start: 4000, end: 5000, word: "Shwing." },
          { start: 6000, end: 8500, word: "Your shape-shifting can't fool us." },
          { start: 10000, end: 10800, word: "Yeah," },
          { start: 10800, end: 13000, word: "go back to your own planet." },
          { start: 15000, end: 16800, word: "Perennial blooms blast!" },
          { start: 17500, end: 18500, word: "Fwoosh!" },
          { start: 19000, end: 21600, word: "Hang on. I thought this was a stealth mission." },
          { start: 22500, end: 26800, word: "Find the bad guys without giving away our secret identities?" },
          { start: 28000, end: 29500, word: "Uh..." },
          { start: 31000, end: 33900, word: "No, it's fine, because we're space royals." },
          { start: 35500, end: 37000, word: "Our type of magic..." },
          { start: 37500, end: 39800, word: "It's... like infrared." },
          { start: 40500, end: 42500, word: "Human eyes can't see it." },
          { start: 43500, end: 48500, word: "Okay, but you yelled out your attack and the shape-shifter disintegrated." },
          { start: 49500, end: 50800, word: "You're telling me..." },
          { start: 52500, end: 55800, word: "your illusionist cat put up a cloaking field." },
          { start: 56500, end: 58900, word: "The name is Princess Silphanaria." },
          { start: 60000, end: 61000, word: "Hm." },
          { start: 62000, end: 63200, word: "But anyway," },
          { start: 64500, end: 65600, word: "are you all right?" },
          { start: 66000, end: 66800, word: "What?" },
          { start: 68000, end: 70200, word: "You know, um, with moving." },
          { start: 71500, end: 74500, word: "And not getting to say goodbye to Rebecca." },
          { start: 75500, end: 76200, word: "Puff." },
          { start: 77000, end: 77600, word: "Yeah." },
          { start: 78000, end: 80800, word: "Why wouldn't I be? We do this all the time." }
      ];

      const demoItem: TranscriptionItem = {
          id: "demo-space-royals",
          file: demoFile,
          mediaType: 'audio',
          status: 'completed',
          cues: demoCues,
          fullTranscript: demoCues.map(c => c.word).join(' '),
          timestamp: Date.now()
      };

      setItems([demoItem]);
      setActiveId(demoItem.id);
  };

  const handleCueClick = (startMs: number) => {
      const seconds = startMs / 1000;
      if (activeItem?.mediaType === 'video' && videoRef.current) {
          videoRef.current.currentTime = seconds;
          if (!isPlaying) {
              videoRef.current.play().catch(() => {});
          }
      } else if (wavesurferRef.current) {
          wavesurferRef.current.setTime(seconds);
          if (!isPlaying) {
              wavesurferRef.current.play().catch(() => {});
          }
      }
  };

  // Refs for stability
  const cuesRef = useRef<TranscriptionCue[]>([]);
  useEffect(() => {
    cuesRef.current = activeItem?.cues || [];
  }, [activeItem]);

  // Handle Active File Blob URL lifecycle
  useEffect(() => {
    if (!activeItem) {
        setActiveMediaUrl(null);
        return;
    }
    const url = URL.createObjectURL(activeItem.file);
    setActiveMediaUrl(url);

    // Reset player state when file changes
    setIsPlaying(false);
    setPlayerCurrentTime(0);
    setActiveCueIndex(-1);
    setIsWaveformReady(false);
    setActiveDuration(null);

    return () => {
        URL.revokeObjectURL(url);
    };
  }, [activeItem?.id]); // Only recreate if ID changes, not if status changes

  const handleFilesAdded = (files: File[]) => {
      const newItems: TranscriptionItem[] = files.map(file => ({
          id: crypto.randomUUID(),
          file,
          mediaType: file.type.startsWith('video/') ? 'video' : 'audio',
          status: 'idle',
          cues: [],
          fullTranscript: '',
          timestamp: Date.now()
      }));

      setItems(prev => [...prev, ...newItems]);
      
      // Auto-select first if none selected
      if (!activeId && newItems.length > 0) {
          setActiveId(newItems[0].id);
      }
  };

  const removeFile = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setItems(prev => prev.filter(i => i.id !== id));
      if (activeId === id) {
          setActiveId(null);
      }
  };

  const clearAllFiles = () => {
      if (isProcessingQueue) return;
      setItems([]);
      setActiveId(null);
  };

  const updateItemStatus = (
    id: string,
    updates: Partial<TranscriptionItem> | ((prev: TranscriptionItem) => Partial<TranscriptionItem>)
  ) => {
      setItems(prev => prev.map(item => {
          if (item.id === id) {
              const u = typeof updates === 'function' ? updates(item) : updates;
              return { ...item, ...u };
          }
          return item;
      }));
  };

  const processFile = async (item: TranscriptionItem) => {
      updateItemStatus(item.id, { status: 'transcribing', error: undefined });
      
      try {
          const onProgress = (intermediateCues: TranscriptionCue[]) => {
              // Ensure we don't accidentally clear cues with empty update
              if (intermediateCues.length > 0) {
                updateItemStatus(item.id, { 
                    status: 'transcribing', 
                    cues: intermediateCues,
                    fullTranscript: intermediateCues.map(c => c.word).join(' ')
                });
                
                if (scrollContainerRef.current) {
                    const el = scrollContainerRef.current;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
                        el.scrollTop = el.scrollHeight;
                    }
                }
              }
          };

          const result = await transcribeAudio(settings, item.file, null, onProgress);
          const parsedCues = parseTranscription(result);
          
          updateItemStatus(item.id, (prevItem) => {
              const finalCues = parsedCues.length > 0 ? parsedCues : prevItem.cues;
              const finalTranscript = finalCues.length > 0 
                  ? finalCues.map(c => c.word).join(' ') 
                  : (result || prevItem.fullTranscript);
              
              return {
                  status: 'completed',
                  cues: finalCues,
                  fullTranscript: finalTranscript
              };
          });

      } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          updateItemStatus(item.id, { status: 'error', error: msg });
      }
  };

  const handleTranscribeAll = async () => {
      if (isProcessingQueue) return;
      setIsProcessingQueue(true);

      const idleItems = items.filter(i => i.status === 'idle' || i.status === 'error');
      
      for (const item of idleItems) {
          await processFile(item);
      }
      
      setIsProcessingQueue(false);
  };

  const handleTranscribeSingle = async (e: React.MouseEvent, item: TranscriptionItem) => {
      e.stopPropagation();
      await processFile(item);
  };

  // Player & Sync Logic
  const handleTimeUpdate = useCallback((currentTime: number) => {
    const currentCues = cuesRef.current;
    if (currentCues.length === 0) return;
    
    const offsetMs = settings.syncOffset ?? 0;
    const currentTimeMs = (currentTime * 1000) + offsetMs;
    
    // 1. Try direct match
    let currentCueIndex = currentCues.findIndex(cue => currentTimeMs >= cue.start && currentTimeMs <= cue.end);

    // 2. If in a gap between words/sentences, find the closest previous cue
    // so the highlight doesn't jump away or flicker during minor silences
    if (currentCueIndex === -1) {
        let bestIndex = -1;
        let minDiff = Infinity;
        for (let i = 0; i < currentCues.length; i++) {
            const cue = currentCues[i];
            if (currentTimeMs >= cue.end) {
                const diff = currentTimeMs - cue.end;
                if (diff < minDiff) {
                    minDiff = diff;
                    bestIndex = i;
                }
            }
        }
        // Retain highlight of the previous word for up to 1.5 seconds during a pause
        if (bestIndex !== -1 && minDiff < 1500) {
            currentCueIndex = bestIndex;
        }
    }

    setActiveCueIndex(prev => {
        if (prev !== currentCueIndex) return currentCueIndex;
        return prev;
    });
  }, [settings.syncOffset]);

  // Keep a stable ref to handleTimeUpdate so outside event listeners (like WaveSurfer)
  // don't run into closure issues or require full WaveSurfer reconstructions when offset changes.
  const handleTimeUpdateRef = useRef(handleTimeUpdate);
  useEffect(() => {
    handleTimeUpdateRef.current = handleTimeUpdate;
  }, [handleTimeUpdate]);

  useEffect(() => {
    if (activeCueIndex > -1) {
        const activeElement = outputRef.current?.querySelector(`[data-cue-index='${activeCueIndex}']`);
        activeElement?.scrollIntoView({ behavior: settings.scrollBehavior ?? 'smooth', block: 'center' });
    }
  }, [activeCueIndex, settings.scrollBehavior]);

  // WaveSurfer Setup
  useEffect(() => {
    if (!waveformContainerRef.current || !activeItem || activeItem.mediaType !== 'audio' || !activeMediaUrl) {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      return;
    }
    
    if (wavesurferRef.current) wavesurferRef.current.destroy();

    const ws = WaveSurfer.create({
        container: waveformContainerRef.current,
        waveColor: 'rgb(107 114 128)',
        progressColor: 'rgb(34 211 238)',
        cursorColor: 'rgb(203 213 225)',
        cursorWidth: 1,
        barWidth: 3,
        barGap: 3,
        barRadius: 3,
        height: 30,
        url: activeMediaUrl,
    });

    wavesurferRef.current = ws;

    ws.on('ready', () => {
        setIsWaveformReady(true);
        setActiveDuration(ws.getDuration());
    });
    
    ws.on('timeupdate', (currentTime: number) => {
        handleTimeUpdateRef.current(currentTime);
        setPlayerCurrentTime(currentTime);
    });
    
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => {
        setIsPlaying(false);
        setActiveCueIndex(-1);
        ws.seekTo(0);
    });

    return () => ws.destroy();
  }, [activeMediaUrl, activeItem?.mediaType]);

  const handleSettingsChange = useCallback(<K extends keyof TranscriptionSettings>(key: K, value: TranscriptionSettings[K]) => {
     setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const copyToClipboard = () => {
    if (!activeItem) return;
    const text = activeItem.cues.length > 0 
        ? activeItem.cues.map(c => c.word).join(' ') 
        : activeItem.fullTranscript;

    if (text) {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadVTT = () => {
    if (!activeItem || activeItem.cues.length === 0) return;
    const vttContent = generateVTT(activeItem.cues, settings.timestampFormat);
    const blob = new Blob([vttContent], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeItem.file.name.split('.').slice(0, -1).join('.')}.vtt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadTXT = () => {
    if (!activeItem || activeItem.cues.length === 0) return;
    
    let txtContent = '';
    activeItem.cues.forEach((cue) => {
        const start = formatTime(cue.start, settings.timestampFormat);
        const end = formatTime(cue.end, settings.timestampFormat);
        txtContent += `[${start} --> ${end}]  ${cue.word}\n`;
    });
    
    const blob = new Blob([txtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeItem.file.name.split('.').slice(0, -1).join('.')}_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatPlayerTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    return new Date(seconds * 1000).toISOString().slice(11, 19);
  };

  return (
    <div className="min-h-screen bg-slate-900 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto">
        <header className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 mb-10">
            <div className="relative flex items-center justify-center w-14 h-14 rounded-xl bg-slate-800/80 border border-slate-700 shadow-inner">
                <div className="absolute -inset-2 bg-cyan-500/20 blur-lg rounded-full opacity-60 animate-pulse"></div>
                <FileAudioIcon className="relative h-8 w-8 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 tracking-tight">
                Audio Transcription Assistant
            </h1>
        </header>

        <main className="space-y-6">
          {/* TOP ROW: Settings, Upload, File Queue (3 columns on md/lg) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {/* 1. Settings Card */}
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 shadow-lg flex flex-col justify-between md:min-h-[320px]">
                 <div>
                   <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Settings</h2>
                   <div className="border-t border-slate-700/60 pt-4 space-y-4">
                     <RadioGroup
                       label="Timestamp Level"
                       value={settings.timestampMode}
                       onChange={(value) => handleSettingsChange('timestampMode', value)}
                       options={[
                         { value: TimestampMode.WORDSTAMP, label: 'Word-by-word' },
                         { value: TimestampMode.SENTENCE, label: 'Sentence' },
                       ]}
                       disabled={isProcessingQueue}
                     />
                     <RadioGroup
                       label="Timestamp Format"
                       value={settings.timestampFormat}
                       onChange={(value) => handleSettingsChange('timestampFormat', value)}
                       options={[
                         { value: TimestampFormat.HMS, label: 'hh:mm:ss.000' },
                         { value: TimestampFormat.MS, label: 'milliseconds' },
                       ]}
                       disabled={isProcessingQueue}
                     />
                     
                     <div className="grid grid-cols-2 gap-4 items-center border-t border-slate-700/40 pt-3">
                       <ToggleSwitch
                         label="Punctuation"
                         enabled={settings.punctuation === Punctuation.ON}
                         onChange={(enabled) => handleSettingsChange('punctuation', enabled ? Punctuation.ON : Punctuation.OFF)}
                         disabled={isProcessingQueue}
                       />
                       <RadioGroup
                         label="Auto-Scroll"
                         value={settings.scrollBehavior ?? 'smooth'}
                         onChange={(value) => handleSettingsChange('scrollBehavior', value)}
                         options={[
                           { value: 'smooth', label: 'Smooth' },
                           { value: 'auto', label: 'Instant' },
                         ]}
                       />
                     </div>

                     <div className="pt-1 border-t border-slate-700/40 pt-3">
                       <div className="flex justify-between items-center mb-1">
                         <label className="text-xs font-medium text-slate-400">Sync Calibration</label>
                         <span className="text-[11px] font-mono font-semibold text-cyan-400">
                           {settings.syncOffset === 0 
                             ? '0 ms (Synced)' 
                             : settings.syncOffset && settings.syncOffset > 0 
                               ? `+${settings.syncOffset} ms (Advance)` 
                               : `${settings.syncOffset} ms (Delay)`}
                         </span>
                       </div>
                       <input 
                         type="range" 
                         min="-1000" 
                         max="1000" 
                         step="50" 
                         value={settings.syncOffset ?? 0}
                         onChange={(e) => handleSettingsChange('syncOffset', parseInt(e.target.value, 10))}
                         className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 transition-all"
                       />
                       <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
                         <span>-1000ms (Delay)</span>
                         <span>0ms</span>
                         <span>+1000ms (Advance)</span>
                       </div>
                     </div>
                   </div>
                 </div>
              </div>

              {/* 2. File Upload box */}
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 shadow-lg flex flex-col justify-center md:h-[320px] min-h-[200px]">
                 <FileUpload onFilesAdded={handleFilesAdded} />
              </div>

              {/* 3. File Queue Box */}
              <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-lg flex flex-col md:h-[320px] min-h-[250px]">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-700/60 mb-3">
                      <div className="flex items-center gap-2 overflow-hidden">
                          <ListIcon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                          <h3 className="font-semibold text-white text-sm whitespace-nowrap">File Queue</h3>
                          <span className="text-[11px] bg-slate-700 px-2 py-0.5 rounded-full text-slate-300">{items.length}</span>
                      </div>
                      <div className="flex gap-1.5 items-center flex-shrink-0">
                          <a 
                              href="https://drive.google.com/drive/folders/1PecvCkzNQpEcW5O6zCM9_hS1UtHWedB4?usp=sharing"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs bg-slate-700 hover:bg-slate-600 text-cyan-400 border border-slate-600 p-1.5 rounded-md transition-colors flex items-center justify-center"
                              title="Open Google Drive Folder"
                          >
                              <CloudIcon className="w-3.5 h-3.5" />
                          </a>
                          {items.length > 0 && (
                              <button
                                  onClick={clearAllFiles}
                                  disabled={isProcessingQueue}
                                  className="text-xs bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800 px-2 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                  title="Remove All Files"
                              >
                                  Clear
                              </button>
                          )}
                          {items.length > 0 && (
                              <button
                                  onClick={handleTranscribeAll}
                                  disabled={isProcessingQueue || !items.some(i => i.status === 'idle' || i.status === 'error')}
                                  className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-2 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                              >
                                  {isProcessingQueue ? 'Working...' : 'Transcribe All'}
                              </button>
                          )}
                      </div>
                  </div>

                  <div className="overflow-y-auto space-y-2 flex-grow custom-scrollbar pr-1">
                      {items.length === 0 ? (
                          <div className="text-center py-8 text-slate-500 italic text-xs space-y-4">
                              <p>No files added yet. Upload files to get started.</p>
                              <div className="pt-2">
                                  <button
                                      onClick={loadDemoData}
                                      className="px-4 py-2 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800 rounded-lg transition-all font-semibold shadow-md active:scale-95 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                      <span>Load Space Royals Sample</span>
                                  </button>
                              </div>
                          </div>
                      ) : (
                          items.map(item => (
                              <div 
                                  key={item.id}
                                  onClick={() => setActiveId(item.id)}
                                  className={`group p-2.5 rounded-lg border cursor-pointer transition-all duration-200 relative ${
                                      activeId === item.id 
                                      ? 'bg-slate-700/60 border-cyan-500/50 ring-1 ring-cyan-500/20' 
                                      : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
                                  }`}
                              >
                                  <div className="flex justify-between items-start mb-1.5 pr-6">
                                      <div className="flex items-center gap-2 overflow-hidden">
                                          {item.mediaType === 'video' ? <VideoCameraIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <FileAudioIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                                          <p className="font-medium text-xs text-slate-200 truncate">{item.file.name}</p>
                                      </div>
                                      <button onClick={(e) => removeFile(e, item.id)} className="absolute top-2 right-2 p-0.5 text-slate-500 hover:text-red-400 transition-colors">
                                          <TrashIcon className="w-3.5 h-3.5" />
                                      </button>
                                  </div>
                                  
                                  <div className="flex justify-between items-center">
                                      <div className="text-[11px]">
                                          {item.status === 'idle' && <span className="text-slate-500">Pending</span>}
                                          {item.status === 'transcribing' && <span className="text-cyan-400 animate-pulse">Transcribing...</span>}
                                          {item.status === 'completed' && <span className="text-green-400 flex items-center gap-0.5"><CheckIcon className="w-3 h-3" /> Done</span>}
                                          {item.status === 'error' && <span className="text-red-400">Failed</span>}
                                      </div>
                                      {item.status !== 'transcribing' && item.status !== 'completed' && (
                                          <button 
                                              onClick={(e) => handleTranscribeSingle(e, item)}
                                              className="text-[10px] bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 px-2 py-0.5 rounded transition-colors"
                                          >
                                              Start
                                          </button>
                                      )}
                                  </div>
                                  {item.error && <p className="text-[10px] text-red-400 mt-1.5 bg-red-900/20 p-1 rounded truncate" title={item.error}>{item.error}</p>}
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>

          {/* MIDDLE ROW: Preview Player */}
          <div className="bg-slate-800/50 py-2.5 px-4 rounded-xl border border-slate-700 shadow-lg">
             {!activeItem ? (
                 <div className="flex flex-col justify-center items-center text-center text-slate-500 py-3">
                     <PlayIcon className="w-6 h-6 opacity-20 mb-1 animate-pulse" />
                     <p className="text-xs">No active file selected for preview. Click on a file in the queue to select it.</p>
                 </div>
             ) : (
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                     <div className="min-w-0 md:max-w-xs lg:max-w-md flex-shrink-0">
                         <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                             <PlayIcon className="w-3 h-3 text-cyan-400" /> 
                             Active Preview
                         </h3>
                         <p className="font-medium text-xs text-slate-200 truncate mt-0.5" title={activeItem.file.name}>{activeItem.file.name}</p>
                     </div>
                     <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700 flex-grow flex items-center justify-center p-2 min-h-[56px]">
                         {activeItem.mediaType === 'video' ? (
                             <video
                                 ref={videoRef}
                                 src={activeMediaUrl || ''}
                                 onTimeUpdate={(e) => {
                                     const currentTime = e.currentTarget.currentTime;
                                     handleTimeUpdate(currentTime);
                                     setPlayerCurrentTime(currentTime);
                                 }}
                                 onPlay={() => setIsPlaying(true)}
                                 onPause={() => setIsPlaying(false)}
                                 onLoadedMetadata={(e) => setActiveDuration(e.currentTarget.duration)}
                                 onEnded={() => { setIsPlaying(false); setActiveCueIndex(-1); }}
                                 className="w-full max-h-[90px] object-contain bg-black"
                                 controls
                             />
                         ) : (
                             <div className="w-full flex items-center justify-between flex-wrap md:flex-nowrap gap-3">
                                 <div className="flex-grow min-w-0">
                                     <div ref={waveformContainerRef} className="w-full h-[30px]"></div>
                                     {!isWaveformReady && <p className="text-slate-400 text-[11px] text-center">Loading audio waveform...</p>}
                                 </div>
                                 {isWaveformReady && (
                                 <div className="flex items-center gap-2 flex-shrink-0">
                                     <button onClick={() => wavesurferRef.current?.playPause()} className="p-1.5 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500">
                                         {isPlaying ? <PauseIcon className="w-3.5 h-3.5 text-white" /> : <PlayIcon className="w-3.5 h-3.5 text-white" />}
                                     </button>
                                     <div className="font-mono text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap">
                                         {formatPlayerTime(playerCurrentTime)} / {formatPlayerTime(activeDuration ?? 0)}
                                     </div>
                                 </div>
                                 )}
                             </div>
                         )}
                     </div>
                 </div>
             )}
          </div>

          {/* BOTTOM ROW: Transcription Results (Full Width) */}
          <div>
              {!activeItem ? (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl h-[300px] flex flex-col justify-center items-center p-8 text-slate-500 text-center shadow-lg">
                      <ListIcon className="w-16 h-16 opacity-20 mb-4" />
                      <p className="text-sm">Select a file from the queue to view its transcript.</p>
                  </div>
              ) : (
                  <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 shadow-lg h-[500px] flex flex-col relative">
                      <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
                          <div className="flex items-center gap-3">
                              <h2 className="text-xl font-bold text-white">Transcript</h2>
                              <button
                                  onClick={insertCueAtCurrentTime}
                                  disabled={activeItem.cues.length === 0}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-cyan-950/40 border border-cyan-800 hover:bg-cyan-900/60 text-cyan-400 hover:text-cyan-300 rounded-lg transition-all disabled:opacity-30 shadow-sm cursor-pointer"
                                  title="Insert a new subtitle cue at the current playback position"
                              >
                                  <span>+ Cue</span>
                              </button>
                          </div>
                          <div className="flex items-center gap-2">
                              <button
                                  onClick={downloadVTT}
                                  disabled={activeItem.status !== 'completed'}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 border border-slate-700 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 rounded-lg transition-all disabled:opacity-30 shadow-sm cursor-pointer"
                                  title="Download standard .vtt subtitle file"
                              >
                                 <DownloadIcon className="h-3.5 w-3.5" />
                                 <span>VTT</span>
                              </button>
                              <button
                                  onClick={downloadTXT}
                                  disabled={activeItem.status !== 'completed'}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 border border-slate-700 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 rounded-lg transition-all disabled:opacity-30 shadow-sm cursor-pointer"
                                  title="Download formatted text transcript (.txt) with selected timestamp format"
                              >
                                 <DownloadIcon className="h-3.5 w-3.5" />
                                 <span>TXT</span>
                              </button>
                              <button
                                  onClick={copyToClipboard}
                                  disabled={activeItem.status !== 'completed'}
                                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors disabled:opacity-30 cursor-pointer"
                                  title="Copy Text"
                              >
                                  {copied ? <CheckIcon className="h-5 w-5 text-green-400" /> : <CopyIcon className="h-5 w-5" />}
                              </button>
                          </div>
                      </div>
                      
                      <div ref={outputRef} className="flex-grow overflow-auto h-full pr-2 custom-scrollbar">
                          {/* Status: Transcribing */}
                          {activeItem.status === 'transcribing' && activeItem.cues.length === 0 && (
                               <div className="flex flex-col justify-center items-center h-full gap-4 min-h-[300px]">
                                  <div className="flex items-center gap-1">
                                      <div className="h-4 w-4 bg-cyan-400 rounded-full animate-bounce"></div>
                                      <div className="h-4 w-4 bg-cyan-400 rounded-full animate-bounce delay-100"></div>
                                      <div className="h-4 w-4 bg-cyan-400 rounded-full animate-bounce delay-200"></div>
                                  </div>
                                  <p className="text-slate-400 text-lg">AI is listening & scribing...</p>
                              </div>
                          )}
                          
                          {/* Status: Error */}
                          {activeItem.status === 'error' && (
                              <div className="flex flex-col justify-center items-center h-full text-center min-h-[300px]">
                                   <p className="text-red-400 mb-2 text-lg font-medium">Transcription Failed</p>
                                   <p className="text-slate-500">{activeItem.error}</p>
                              </div>
                          )}

                          {/* Status: Completed OR Transcribing with Partial Data */}
                          {(activeItem.status === 'completed' || (activeItem.status === 'transcribing' && activeItem.cues.length > 0)) && (
                              <div ref={scrollContainerRef} className="space-y-2 h-full">
                                  {activeItem.fullTranscript && !activeItem.cues.length && (
                                      <p className="whitespace-pre-wrap font-sans text-lg text-slate-300 leading-relaxed">
                                        {activeItem.fullTranscript}
                                      </p>
                                  )}
                                  {activeItem.cues.length > 0 && (
                                       <div className="space-y-2 font-mono text-base">
                                           {activeItem.cues.map((cue, index) => {
                                              const isEditing = editingIndex === index;
                                              const isActive = index === activeCueIndex;
                                              
                                              if (isEditing) {
                                                  return (
                                                      <div key={index} className="p-3 bg-slate-800 border border-cyan-500 rounded-lg shadow-md space-y-3 text-left">
                                                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                              <div className="flex items-center gap-2">
                                                                  <span className="text-xs font-semibold text-slate-400 uppercase">Start:</span>
                                                                  <input 
                                                                      type="text" 
                                                                      value={editStart} 
                                                                      onChange={(e) => {
                                                                          setEditStart(e.target.value);
                                                                          setEditError(null);
                                                                      }} 
                                                                      className="bg-slate-900 border border-slate-700 text-cyan-400 rounded px-2.5 py-1 text-xs w-28 focus:outline-none focus:border-cyan-500 font-mono"
                                                                  />
                                                              </div>
                                                              <div className="flex items-center gap-2">
                                                                  <span className="text-xs font-semibold text-slate-400 uppercase">End:</span>
                                                                  <input 
                                                                      type="text" 
                                                                      value={editEnd} 
                                                                      onChange={(e) => {
                                                                          setEditEnd(e.target.value);
                                                                          setEditError(null);
                                                                      }} 
                                                                      className="bg-slate-900 border border-slate-700 text-cyan-400 rounded px-2.5 py-1 text-xs w-28 focus:outline-none focus:border-cyan-500 font-mono"
                                                                  />
                                                              </div>
                                                              {editError && (
                                                                  <span className="text-xs text-red-400 font-sans font-medium">{editError}</span>
                                                              )}
                                                          </div>
                                                          <div className="flex items-end gap-3">
                                                              <textarea
                                                                  value={editWord}
                                                                  onChange={(e) => setEditWord(e.target.value)}
                                                                  className="flex-grow bg-slate-900 border border-slate-700 text-slate-100 rounded-lg p-2.5 focus:outline-none focus:border-cyan-500 text-sm font-sans leading-relaxed resize-none h-16"
                                                              />
                                                              <div className="flex gap-2 flex-shrink-0">
                                                                  <button 
                                                                      onClick={() => {
                                                                          const parsedStart = parseTimestamp(editStart);
                                                                          const parsedEnd = parseTimestamp(editEnd);
                                                                          if (isNaN(parsedStart) || isNaN(parsedEnd)) {
                                                                              setEditError("Invalid format.");
                                                                              return;
                                                                          }
                                                                          if (parsedStart > parsedEnd) {
                                                                              setEditError("Start time must be before End time.");
                                                                              return;
                                                                          }
                                                                          
                                                                          const updatedCues = [...activeItem.cues];
                                                                          updatedCues[index] = {
                                                                              start: parsedStart,
                                                                              end: parsedEnd,
                                                                              word: editWord.trim()
                                                                          };
                                                                          const sorted = normalizeCues(updatedCues).sort((a, b) => a.start - b.start);
                                                                          updateItemStatus(activeItem.id, {
                                                                              cues: sorted,
                                                                              fullTranscript: sorted.map(c => c.word).join(' ')
                                                                          });
                                                                          setEditingIndex(null);
                                                                      }}
                                                                      className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm cursor-pointer"
                                                                  >
                                                                      Save
                                                                  </button>
                                                                  <button 
                                                                      onClick={() => setEditingIndex(null)}
                                                                      className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                                                                  >
                                                                      Cancel
                                                                  </button>
                                                              </div>
                                                          </div>
                                                      </div>
                                                  );
                                              }
                                              
                                              return (
                                                  <div 
                                                      key={index} 
                                                      data-cue-index={index} 
                                                      onClick={() => handleCueClick(cue.start)}
                                                      className={`group flex items-start justify-between gap-4 p-3 rounded-lg transition-all duration-200 border border-transparent cursor-pointer relative ${
                                                          isActive 
                                                          ? 'bg-cyan-950/40 border-cyan-500/30' 
                                                          : 'hover:bg-slate-800/50'
                                                      }`}
                                                  >
                                                      <div className="flex gap-4 items-start flex-grow min-w-0 text-left">
                                                          <div className="text-right flex-shrink-0 pt-1 w-24">
                                                              <div className="text-cyan-400 text-xs font-mono font-semibold">
                                                                  {formatTime(cue.start, settings.timestampFormat)}
                                                              </div>
                                                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                                                  to {formatTime(cue.end, settings.timestampFormat)}
                                                              </div>
                                                          </div>
                                                          <span className="font-sans text-slate-200 text-sm leading-snug break-words pr-2 pt-0.5 flex-grow">
                                                              {cue.word}
                                                          </span>
                                                      </div>
                                                      
                                                      {/* Cue Action buttons on hover */}
                                                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 bg-slate-800/95 py-1 px-1.5 rounded-md border border-slate-700/80 shadow-md transition-opacity duration-150 flex-shrink-0">
                                                          <button 
                                                              onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  startEditing(index, cue);
                                                              }}
                                                              className="p-1 hover:text-cyan-400 text-slate-400 rounded hover:bg-slate-700 transition-colors"
                                                              title="Edit Subtitle"
                                                          >
                                                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                              </svg>
                                                          </button>
                                                          <button 
                                                              onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  splitCue(index);
                                                              }}
                                                              className="p-1 hover:text-cyan-400 text-slate-400 rounded hover:bg-slate-700 transition-colors"
                                                              title="Split Subtitle"
                                                          >
                                                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                                                              </svg>
                                                          </button>
                                                          {index < activeItem.cues.length - 1 && (
                                                              <button 
                                                                  onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      mergeWithNext(index);
                                                                  }}
                                                                  className="p-1 hover:text-cyan-400 text-slate-400 rounded hover:bg-slate-700 transition-colors"
                                                                  title="Merge with Next"
                                                              >
                                                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
                                                                  </svg>
                                                              </button>
                                                          )}
                                                          <button 
                                                              onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  deleteCue(index);
                                                              }}
                                                              className="p-1 hover:text-red-400 text-slate-400 rounded hover:bg-slate-700 transition-colors"
                                                              title="Delete Subtitle"
                                                          >
                                                              <TrashIcon className="w-3.5 h-3.5" />
                                                          </button>
                                                      </div>
                                                  </div>
                                              );
                                           })}
                                       </div>
                                  )}
                              </div>
                          )}
                          
                          {/* Status: Idle */}
                          {activeItem.status === 'idle' && (
                              <div className="flex flex-col justify-center items-center h-full text-slate-500 gap-6 min-h-[300px]">
                                  <div className="bg-slate-800 p-4 rounded-full">
                                      <FileAudioIcon className="w-12 h-12 text-slate-600" />
                                  </div>
                                  <div className="text-center">
                                      <p className="text-lg font-medium text-slate-300">Ready to transcribe</p>
                                      <p className="text-sm">Click start to begin processing {activeItem.file.name}</p>
                                  </div>
                                  <button 
                                      onClick={(e) => handleTranscribeSingle(e, activeItem)}
                                      className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-3 rounded-lg font-medium transition-all shadow-lg shadow-cyan-900/20 hover:shadow-cyan-500/20 cursor-pointer"
                                  >
                                      Start Transcription
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>
              )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
