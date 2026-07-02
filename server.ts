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
          
          const rawStart = obj.s !== undefined ? obj.s : obj.start;
          const rawEnd = obj.e !== undefined ? obj.e : obj.end;
          const word = obj.w || obj.text || obj.word;

          const startSec = typeof rawStart === 'number' ? rawStart : parseFloat(String(rawStart));
          const endSec = typeof rawEnd === 'number' ? rawEnd : parseFloat(String(rawEnd));

          if (!isNaN(startSec) && isFinite(startSec) && !isNaN(endSec) && isFinite(endSec) && word && String(word).trim().length > 0) {
              cues.push({
                  start: Math.round(startSec * 1000), // Seconds to ms
                  end: Math.round(endSec * 1000),     // Seconds to ms
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

    const systemInstruction = `You are a professional, ultra-precise audio transcription and temporal alignment engine. Your task is to transcribe the provided audio and align each ${isWordMode ? "individual word" : "sentence"} with its exact start and end times in the audio stream.

    CRITICAL RULES FOR HIGH-PRECISION ALIGNMENT:
    1. **Exact Boundary Detection**:
       - 's' (start time) MUST represent the exact second (as a fractional number, e.g., 12.34) when the first phoneme/sound of the vocal utterance begins.
       - 'e' (end time) MUST represent the exact second (as a fractional number, e.g., 13.15) when the final phoneme/sound of the vocal utterance fades out completely.
       - NEVER round timestamps to the nearest integer or half-second (do not output simple '.0' or '.5' unless it's perfectly accurate).
       - NEVER start a timestamp early (during the preceding silence, breath, or background noise). 
       - NEVER extend a timestamp late into the succeeding silence.

    2. **Avoid Timestamp Drift and Overlaps**:
       - Ensure consecutive entries are strictly chronological. The start time 's' of an entry must be >= the end time 'e' of the previous entry (unless the speaker is overlapping another speaker).
       - Keep silent pauses as empty space between the 'e' of the previous word/sentence and the 's' of the next one. Do not stretch words to cover silence.

    3. **Time Calculation Formula**:
       - Timestamps must be total seconds from the absolute beginning of the audio file.
       - Convert any minutes/hours to total seconds. For example, 1 minute 5.25 seconds is 65.25. 2 minutes 10.4 seconds is 130.4.

    4. **Granularity & Content**:
       - Content 'w': Transcribe exactly what is spoken.
       - ${isWordMode ? "Granularity: Exactly ONE object per individual word." : "Granularity: Group words together into complete, natural sentences."}
       - ${settings.punctuation === 'on' ? "Punctuation: Keep standard punctuation (commas, periods, question marks) inside 'w'." : "Punctuation: Strip all punctuation from 'w'."}
       - No empty objects, no ghost words, and no silent background sound descriptions (like [laughter] or [silence]).

    FEW-SHOT EXAMPLES FOR TRAINING:
    ${isWordMode ? `
    // Wordstamp Mode Example:
    [
      { "s": 0.12, "e": 0.55, "w": "Chapter" },
      { "s": 0.58, "e": 0.92, "w": "one" },
      { "s": 2.04, "e": 2.45, "w": "Slurp" },
      { "s": 2.48, "e": 2.91, "w": "slurp" }
    ]
    ` : `
    // Sentencestamp Mode Example:
    [
      { "s": 0.12, "e": 0.92, "w": "Chapter one." },
      { "s": 2.04, "e": 2.91, "w": "Slurp, slurp." }
    ]
    `}
    
    Begin transcription. Output ONLY the raw JSON Array complying exactly with the schema.`;

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
