import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const GEMINI_MODEL = 'gemini-4-hydrogen';

function createAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Check your Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapThinkingLevel(depth?: string): ThinkingLevel {
  switch (depth) {
    case 'low':
      return ThinkingLevel.LOW;
    case 'high':
      return ThinkingLevel.HIGH;
    case 'medium':
    default:
      return ThinkingLevel.MEDIUM;
  }
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Gemini API authentication failed. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Gemini API rate limit reached. Wait a moment and retry.',
    };
  }
  if (msg.includes('GEMINI_API_KEY is not configured')) {
    return { status: 500, message: msg };
  }
  return { status: 500, message: msg || 'Unexpected Gemini API error.' };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: GEMINI_MODEL });
  });

  // 1. Real-time streaming code refactoring with optional custom style guides
  app.post('/api/refactor/stream', async (req, res) => {
    const {
      code,
      language,
      platform,
      framework,
      fileName,
      instruction,
      reasoningDepth,
      styleGuidesText,
    } = req.body ?? {};

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Source code is required.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const ai = createAiClient();
      const styleSection =
        typeof styleGuidesText === 'string' && styleGuidesText.trim().length > 0
          ? `\n\nENFORCE THESE USER-DEFINED CODE STYLE GUIDES STRICTLY:\n${styleGuidesText.trim()}\nIn each finding's "styleRuleApplied" field, name the specific style guide rule enforced when applicable.`
          : '';

      const systemInstruction = `You are a principal iOS (Swift, Objective-C) and Android (Kotlin, Jetpack Compose) mobile systems architect.
Refactor the provided mobile source file to eliminate crashes, memory leaks (ARC retain cycles, leaked CoroutineScopes), main-thread blocking (ANRs, UIKit/CoreData thread violations), and style deviations.
Preserve public API signatures where safe and output complete, compilable code in the target language (${language || 'swift'}).${styleSection}`;

      const userPrompt = `File: ${fileName || 'SourceFile'}
Platform: ${platform || 'ios'} | Language: ${language || 'swift'} | Stack: ${framework || 'Mobile'}
Refactoring Goal: ${instruction || 'Fix memory leaks, concurrency bugs, main-thread issues, and enforce mobile best practices.'}

Source Code:
\`\`\`${language || ''}
${code}
\`\`\``;

      const stream = await ai.models.generateContentStream({
        model: GEMINI_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: mapThinkingLevel(reasoningDepth),
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'Concise 1-2 sentence executive summary of the refactoring changes.',
              },
              refactoredCode: {
                type: Type.STRING,
                description: 'The complete refactored source file ready to apply.',
              },
              findings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    severity: {
                      type: Type.STRING,
                      enum: ['critical', 'warning', 'improvement'],
                    },
                    lineRange: { type: Type.STRING },
                    ecosystemImpact: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    styleRuleApplied: { type: Type.STRING },
                  },
                  required: ['title', 'severity', 'lineRange', 'ecosystemImpact', 'explanation'],
                },
              },
              verificationChecklist: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['summary', 'refactoredCode', 'findings', 'verificationChecklist'],
          },
        },
      });

      for await (const chunk of stream) {
        if (res.writableEnded) break;
        const text = chunk.text ?? '';
        if (text) {
          sendEvent({ type: 'chunk', text });
        }
      }

      sendEvent({ type: 'done' });
      res.end();
    } catch (err) {
      const formatted = formatGeminiError(err);
      sendEvent({ type: 'error', message: formatted.message });
      res.end();
    }
  });

  // 2. Real-time as-you-type AI code analysis for Objective-C, Swift, and Kotlin
  app.post('/api/analyze', async (req, res) => {
    const { code, language, platform, fileName, styleGuidesText } = req.body ?? {};
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Code content is required for analysis.' });
      return;
    }

    try {
      const ai = createAiClient();
      const numberedCode = code
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line, i) => `${i + 1}: ${line}`)
        .join('\n');

      const styleSection =
        typeof styleGuidesText === 'string' && styleGuidesText.trim().length > 0
          ? `\n\nAlso check compliance against these custom style guides (use category "style-guide" and populate "ruleRef"):\n${styleGuidesText.trim()}`
          : '';

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Analyze this ${language || 'swift'} (${platform || 'ios'}) file "${fileName || 'Untitled'}" line-by-line.
Identify:
1. Common runtime errors (ARC retain cycles, force unwraps, CoreData/UIKit thread violations, Objective-C nil/copy/mutated collection bugs, Coroutine leaks).
2. Performance optimizations (main-thread I/O, sequential awaits, excessive recomposition, redundant disk flushes).
3. Best-practice & API modernization deviations (deprecated NSURLConnection, old GCD patterns, missing @MainActor).${styleSection}

Keep explanations crisp and actionable. Return at most 8 high-signal issues ordered by line number.

Numbered Source:
${numberedCode}`,
        config: {
          systemInstruction:
            'You are a real-time static & semantic mobile code analyzer for Objective-C, Swift, and Kotlin. Be accurate with 1-based line numbers.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    line: { type: Type.INTEGER },
                    category: {
                      type: Type.STRING,
                      enum: ['error', 'optimization', 'best-practice', 'style-guide'],
                    },
                    severity: {
                      type: Type.STRING,
                      enum: ['critical', 'warning', 'info'],
                    },
                    title: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    suggestion: { type: Type.STRING },
                    ruleRef: { type: Type.STRING },
                  },
                  required: ['line', 'category', 'severity', 'title', 'explanation', 'suggestion'],
                },
              },
            },
            required: ['summary', 'issues'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw);
      res.json({
        language: language || 'swift',
        summary: parsed.summary || 'Analysis complete.',
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        analyzedAt: new Date().toISOString(),
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. AI-powered crash log & stack trace debugger
  app.post('/api/debug', async (req, res) => {
    const { crashLog, sourceCode, language, platform, fileName, styleGuidesText } = req.body ?? {};
    if (!crashLog || typeof crashLog !== 'string') {
      res.status(400).json({ error: 'Crash log or stack trace is required.' });
      return;
    }

    try {
      const ai = createAiClient();
      const styleSection =
        typeof styleGuidesText === 'string' && styleGuidesText.trim().length > 0
          ? `\n\nEnsure the patchedCode adheres to these custom style guides:\n${styleGuidesText.trim()}`
          : '';

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Diagnose this mobile crash trace (${platform || 'ios'} / ${language || 'swift'}).
If source code is provided below, produce a complete fixed version of the file in "patchedCode"; otherwise produce a production-ready fix snippet.${styleSection}

Crash Log / Stack Trace:
${crashLog}

Linked Source File (${fileName || 'None'}):
${sourceCode || '(No source file attached)'}`,
        config: {
          systemInstruction:
            'You are a senior mobile reliability & crash diagnostics engineer specializing in iOS (Mach exceptions, ARC, CoreData, Swift Concurrency, Objective-C runtime) and Android (ART, Looper/ANR, Room, Jetpack Compose, Coroutines).',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rootCause: { type: Type.STRING },
              severity: {
                type: Type.STRING,
                enum: ['fatal', 'anr', 'memory', 'concurrency'],
              },
              affectedComponent: { type: Type.STRING },
              lifecycleTrigger: { type: Type.STRING },
              explanation: { type: Type.STRING },
              patchedCode: { type: Type.STRING },
              verificationSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'rootCause',
              'severity',
              'affectedComponent',
              'lifecycleTrigger',
              'explanation',
              'patchedCode',
              'verificationSteps',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. Interactive follow-up crash debugging Q&A
  app.post('/api/debug/chat', async (req, res) => {
    const { crashLog, sourceCode, diagnosisSummary, history, question } = req.body ?? {};
    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'Question is required.' });
      return;
    }

    try {
      const ai = createAiClient();
      const chat = ai.chats.create({
        model: GEMINI_MODEL,
        config: {
          systemInstruction: `You are a senior iOS & Android crash debugging engineer. Answer concisely with concrete symbol names, Instruments/Profiler advice, or code fixes.
Context Crash Log:
${String(crashLog || '').slice(0, 3000)}

Diagnosis Summary:
${String(diagnosisSummary || '')}

Relevant Source Code:
${String(sourceCode || '').slice(0, 3000)}`,
        },
        history: Array.isArray(history)
          ? history.slice(-8).map((m: { role: string; content: string }) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: String(m.content || '') }],
            }))
          : [],
      });

      const reply = await chat.sendMessage({ message: question });
      res.json({ answer: reply.text ?? 'No response generated.' });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 5. Cross-platform iOS <-> Android parity translator
  app.post('/api/translate', async (req, res) => {
    const { sourceCode, sourcePlatform, sourceLanguage, targetPlatform, styleGuidesText } =
      req.body ?? {};
    if (!sourceCode || typeof sourceCode !== 'string') {
      res.status(400).json({ error: 'Source code is required.' });
      return;
    }

    try {
      const ai = createAiClient();
      const targetLanguage = targetPlatform === 'ios' ? 'Swift 6 (SwiftUI / Concurrency)' : 'Kotlin 2.1 (Jetpack Compose / Coroutines)';
      const styleSection =
        typeof styleGuidesText === 'string' && styleGuidesText.trim().length > 0
          ? `\n\nApply these target style guide rules:\n${styleGuidesText.trim()}`
          : '';

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Translate this ${sourcePlatform} (${sourceLanguage}) mobile implementation into idiomatic ${targetLanguage}, preserving business logic, concurrency safety, and lifecycle semantics.${styleSection}

Source Code:
\`\`\`${sourceLanguage || ''}
${sourceCode}
\`\`\``,
        config: {
          systemInstruction:
            'You are a staff mobile architect fluent in Swift/Objective-C/SwiftUI and Kotlin/Jetpack Compose/Coroutines. Never write literal line-by-line ports; map to idiomatic platform primitives.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translatedCode: { type: Type.STRING },
              stateMappingNotes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sourcePattern: { type: Type.STRING },
                    targetPattern: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  },
                  required: ['sourcePattern', 'targetPattern', 'rationale'],
                },
              },
              edgeCaseWarnings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['translatedCode', 'stateMappingNotes', 'edgeCaseWarnings'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        sourcePlatform,
        targetPlatform,
        ...parsed,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BridgeLab server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start BridgeLab server:', err);
  process.exit(1);
});
