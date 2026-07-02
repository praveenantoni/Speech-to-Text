
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

    let usesMMSS = false;
    let lastMs = 0;

    for (const cue of cues) {
        if (cue.start < lastMs) {
            const mmss = cue.start / 1000;
            const min = Math.floor(mmss);
            const sec = Math.round((mmss - min) * 100);
            const convertedMs = (min * 60 + sec) * 1000;
            if (convertedMs >= lastMs) {
                usesMMSS = true;
                break;
            }
        }
        lastMs = cue.start;
    }

    if (!usesMMSS) {
        for (const cue of cues) {
            if (cue.end < cue.start) {
                const startMmss = cue.start / 1000;
                const startMin = Math.floor(startMmss);
                const startSec = Math.round((startMmss - startMin) * 100);
                const startConverted = (startMin * 60 + startSec) * 1000;

                const endMmss = cue.end / 1000;
                const endMin = Math.floor(endMmss);
                const endSec = Math.round((endMmss - endMin) * 100);
                const endConverted = (endMin * 60 + endSec) * 1000;

                if (endConverted >= startConverted) {
                    usesMMSS = true;
                    break;
                }
            }
        }
    }

    if (usesMMSS) {
        let inMMSS = false;
        let prevMs = 0;

        return cues.map(cue => {
            let start = cue.start;
            let end = cue.end;

            if (!inMMSS) {
                if (cue.start < prevMs || cue.end < cue.start) {
                    inMMSS = true;
                } else {
                    const startMmss = cue.start / 1000;
                    const startMin = Math.floor(startMmss);
                    const startSec = Math.round((startMmss - startMin) * 100);
                    const startConverted = (startMin * 60 + startSec) * 1000;
                    if (startConverted < cue.start && startConverted >= prevMs && startMin > 0) {
                        inMMSS = true;
                    }
                }
            }

            if (inMMSS) {
                const convertMs = (ms: number): number => {
                    const mmss = ms / 1000;
                    const min = Math.floor(mmss);
                    const sec = Math.round((mmss - min) * 100);
                    return (min * 60 + sec) * 1000;
                };
                start = convertMs(cue.start);
                end = convertMs(cue.end);
            }

            prevMs = start;
            return {
                ...cue,
                start,
                end
            };
        });
    }

    return cues;
};

const parseTranscription = (rawText: string): TranscriptionCue[] => {
    if (!rawText) return [];

    try {
        const json = JSON.parse(rawText);
        if (Array.isArray(json)) {
            const parsed = json.map((item: any) => {
                 // Support both optimized (s,e,w) and verbose (start,end,text) keys
                 const start = typeof item.s === 'number' ? item.s : (typeof item.start === 'number' ? item.start : parseTimestamp(item.start));
                 const end = typeof item.e === 'number' ? item.e : (typeof item.end === 'number' ? item.end : parseTimestamp(item.end));
                 const word = item.w || item.text || item.word; 
                 
                 // Strict filtering: discard invalid timestamps or empty words
                 if (typeof start !== 'number' || isNaN(start) || 
                     typeof end !== 'number' || isNaN(end) || 
                     !word || String(word).trim() === '') {
                     return null;
                 }
                 
                 return { 
                    word: String(word).trim(), 
                    start: Math.round(start < 10000 ? start * 1000 : start), // auto-detect if seconds or ms
                    end: Math.round(end < 10000 ? end * 1000 : end)
                 };
            }).filter((cue: any): cue is TranscriptionCue => cue !== null);
            return normalizeCues(parsed);
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

    return normalizeCues(parsedCues);
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
  
  // Media refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isWaveformReady, setIsWaveformReady] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);

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

  const updateItemStatus = (id: string, updates: Partial<TranscriptionItem>) => {
      setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
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
          
          let fullText = '';
          if (parsedCues.length === 0 && result.length > 0) {
             fullText = result;
          } else {
             fullText = parsedCues.map(c => c.word).join(' ');
          }

          updateItemStatus(item.id, { 
              status: 'completed', 
              cues: parsedCues.length > 0 ? parsedCues : item.cues, 
              fullTranscript: fullText 
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
    
    const currentTimeMs = currentTime * 1000;
    const currentCueIndex = currentCues.findIndex(cue => currentTimeMs >= cue.start && currentTimeMs <= cue.end);

    setActiveCueIndex(prev => {
        if (prev !== currentCueIndex) return currentCueIndex;
        return prev;
    });
  }, []);

  useEffect(() => {
    if (activeCueIndex > -1) {
        const activeElement = outputRef.current?.querySelector(`[data-cue-index='${activeCueIndex}']`);
        activeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeCueIndex]);

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
        handleTimeUpdate(currentTime);
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
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 shadow-lg flex flex-col justify-between md:h-[320px]">
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
                     <div className="pt-2">
                       <ToggleSwitch
                         label="Punctuation"
                         enabled={settings.punctuation === Punctuation.ON}
                         onChange={(enabled) => handleSettingsChange('punctuation', enabled ? Punctuation.ON : Punctuation.OFF)}
                         disabled={isProcessingQueue}
                       />
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
                          <div className="text-center py-12 text-slate-500 italic text-xs">
                              No files added yet. Upload files to get started.
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
                                 onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget.currentTime)}
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
                          <h2 className="text-xl font-bold text-white">Transcript</h2>
                          <div className="flex items-center gap-2">
                              <button
                                  onClick={downloadVTT}
                                  disabled={activeItem.status !== 'completed'}
                                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors disabled:opacity-30"
                                  title="Download .vtt"
                              >
                                 <DownloadIcon className="h-5 w-5" />
                              </button>
                              <button
                                  onClick={copyToClipboard}
                                  disabled={activeItem.status !== 'completed'}
                                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors disabled:opacity-30"
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
                                           {activeItem.cues.map((cue, index) => (
                                              <div key={index} data-cue-index={index} className={`flex gap-4 p-3 rounded-lg transition-all duration-200 border border-transparent ${index === activeCueIndex ? 'bg-cyan-950/40 border-cyan-500/30' : 'hover:bg-slate-800/50'}`}>
                                                  <span className="text-cyan-400 text-xs opacity-70 select-none flex-shrink-0 pt-1 w-20 text-right">{formatTime(cue.start, settings.timestampFormat)}</span>
                                                  <span className="font-sans text-slate-200 text-lg leading-snug">{cue.word}</span>
                                              </div>
                                           ))}
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
                                      className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-3 rounded-lg font-medium transition-all shadow-lg shadow-cyan-900/20 hover:shadow-cyan-500/20"
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
