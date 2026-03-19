const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export interface GeminiRoundRequest {
  prompt: string;
  count: number;
  temperature?: number;
}

/**
 * Call Gemini to generate game rounds as JSON.
 * Returns parsed JSON array, or null on failure (caller should fallback to static content).
 */
export async function generateWithGemini<T>(
  apiKey: string,
  prompt: string,
  temperature = 0.8,
): Promise<T | null> {
  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 4096,
          temperature,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      console.warn("Gemini API error:", res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    return JSON.parse(text) as T;
  } catch (err) {
    console.warn("Gemini generation failed (non-fatal):", err);
    return null;
  }
}
