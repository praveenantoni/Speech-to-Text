import express from "express";
import multer from "multer";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { TimestampMode, TranscriptionSettings, TranscriptionCue } from "./types";

const app = express();
const PORT = 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

// Helper to parse cues from a streaming buffer
const parseCuesFromBuffer = (buffer: string): { cues: TranscriptionCue[], remainingBuffer: string } => {
  const cues: TranscriptionCue[] = [];
  const objectRegex = /\{(?:[^{}]|"(?:\\.|[^"\\])*")*\}/g;
  
  let match;
  let lastIndex = 0;
  
  while ((match = objectRegex.exec(buffer)) !== null) {
      try {
          const jsonStr = match[0];
          const obj = JSON.parse(jsonStr);
          
          const start = typeof obj.s === 'number' ? obj.s : obj.start;
          const end = typeof obj.e === 'number' ? obj.e : obj.end;
          const word = obj.w || obj.text || obj.word;

          if (typeof start === 'number' && typeof end === 'number' && word && String(word).trim().length > 0) {
              cues.push({
                  start: Math.round(start * 1000), // Seconds to ms
                  end: Math.round(end * 1000),     // Seconds to ms
                  word: String(word).trim()
              });
              lastIndex = match.index + match[0].length;
          }
      } catch (e) {
          // If parse fails, we skip this match but keep iterating
      }
  }

  return {
      cues,
      remainingBuffer: buffer.slice(lastIndex)
  };
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

// API Endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).send("No file uploaded.");
    }

    const settings = JSON.parse(req.body.settings || "{}") as TranscriptionSettings;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).send("GEMINI_API_KEY environment variable is not configured.");
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const audioBase64 = file.buffer.toString("base64");
    const isWordMode = settings.timestampMode === TimestampMode.WORDSTAMP;

    const responseSchema: Schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          s: { type: Type.NUMBER, description: "Start time (seconds)" },
          e: { type: Type.NUMBER, description: "End time (seconds)" },
          w: { type: Type.STRING, description: isWordMode ? "Word" : "Sentence" },
        },
        required: ["s", "e", "w"],
        propertyOrdering: ["s", "e", "w"]
      },
    };

    const systemInstruction = `You are a precision audio transcription engine.
    
    RULES:
    1. **Timestamps**: Return 's' (start) and 'e' (end) as NUMBERS representing the TOTAL seconds from the very start (e.g., 65.5 for 1 minute and 5.5 seconds). CRITICAL: Do NOT write 1 minute and 5 seconds as 1.05. You MUST compute total seconds as (minutes * 60) + seconds. For example, 1 minute 30 seconds is 90.0, and 2 minutes 15 seconds is 135.0.
    2. **Content**: Transcribe exactly what is spoken into 'w' (content).
    3. **No Ghosts**: Do NOT output objects with empty 'w' text.
    4. **Granularity**: ${isWordMode ? "One object per single word." : "Group by complete sentences."}
    5. **Punctuation**: ${settings.punctuation === 'on' ? 'Include punctuation in "w".' : 'No punctuation.'}
    
    Output a JSON Array of objects: [{ "s": 0.5, "e": 0.9, "w": "Hello" }, ...]`;

    const userPrompt = `Transcribe audio.`;
    const mimeType = file.mimetype || (file.originalname.endsWith('.mp4') ? 'video/mp4' : 'audio/mp3');

    const parts = [
      { text: userPrompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: audioBase64,
        },
      },
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await ai.models.generateContentStream({
      model: 'gemini-3.5-flash',
      contents: { parts },
      config: {
        systemInstruction,
        temperature: 0.0,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    let fullText = '';
    let processingBuffer = '';
    let allCues: TranscriptionCue[] = [];

    for await (const chunk of result) {
      const chunkText = chunk.text || '';
      fullText += chunkText;
      processingBuffer += chunkText;

      const { cues, remainingBuffer } = parseCuesFromBuffer(processingBuffer);
      if (cues.length > 0) {
        const validCues = cues.filter(c => c.word.trim().length > 0 && c.end >= c.start);
        if (validCues.length > 0) {
          allCues = normalizeCues([...allCues, ...validCues]);
          res.write(`data: ${JSON.stringify({ cues: allCues })}\n\n`);
        }
        processingBuffer = remainingBuffer;
      }
    }

    // Flush remaining buffer
    const { cues: finalCues } = parseCuesFromBuffer(processingBuffer);
    if (finalCues.length > 0) {
      const validCues = finalCues.filter(c => c.word.trim().length > 0 && c.end >= c.start);
      if (validCues.length > 0) {
        allCues = normalizeCues([...allCues, ...validCues]);
      }
    }

    res.write(`data: ${JSON.stringify({ cues: allCues, fullText })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (error: any) {
    console.error("Transcription error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message || "An error occurred during transcription." })}\n\n`);
    res.end();
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
