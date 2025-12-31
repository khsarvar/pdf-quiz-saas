/**
 * LLM-based quiz question generation using OpenAI API
 */

import OpenAI from 'openai';

export interface GeneratedQuestion {
  prompt: string;
  choices: string[];
  answer: number; // Index of correct answer
  explanation: string;
  sourceRef?: {
    page?: number;
    slide?: number;
    text?: string;
  };
}

let cachedOpenAI: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. Please configure it in your .env file.'
    );
  }

  if (!cachedOpenAI) {
    cachedOpenAI = new OpenAI({ apiKey });
  }

  return cachedOpenAI;
}

export async function generateQuestions(
  extractedText: string,
  count: number = 8
): Promise<GeneratedQuestion[]> {
  const openai = getOpenAIClient();

  // Truncate text if it's too long (OpenAI has token limits)
  // Rough estimate: 1 token ≈ 4 characters, and we want to leave room for the prompt and response
  const maxTextLength = 100000; // ~25k tokens for content, leaving room for prompt/response
  const truncatedText =
    extractedText.length > maxTextLength
      ? extractedText.substring(0, maxTextLength) + '\n\n[Content truncated...]'
      : extractedText;

  const systemPrompt = `You are an expert educator creating high-quality multiple-choice quiz questions from educational content. 
Generate questions that:
- Test understanding of key concepts
- Are clear and unambiguous
- Have exactly 4 answer choices
- Include one clearly correct answer and 3 plausible distractors
- Provide detailed explanations for the correct answer
- Reference the source material when possible

Return your response as a JSON object with a "questions" array. Each question must have:
- "prompt": string (the question text)
- "choices": string[] (exactly 4 answer choices)
- "answer": number (0-3 index of the correct answer)
- "explanation": string (detailed explanation of why the answer is correct)
- "sourceRef": object (optional, with "page", "slide", or "text" fields if available)`;

  const userPrompt = `Generate ${count} multiple-choice questions based on the following content:

${truncatedText}

Return the questions as a JSON object with this exact structure:
{
  "questions": [
    {
      "prompt": "Question text here?",
      "choices": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "answer": 0,
      "explanation": "Detailed explanation here",
      "sourceRef": {
        "text": "Relevant source text excerpt"
      }
    }
  ]
}`;

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini', // Use gpt-4o-mini by default for cost efficiency
      instructions: systemPrompt,
      input: userPrompt,
      text: { format: { type: 'json_object' } },
      temperature: 0.7, // Balance between creativity and consistency
      max_output_tokens: 4000, // Enough for multiple questions with explanations
    });

    if (response.error) {
      throw new Error(
        `OpenAI response error: ${response.error.message || response.error.code || 'Unknown error'}`
      );
    }

    const content = response.output_text;
    if (!content) {
      throw new Error('No response content from OpenAI API');
    }

    // Parse the JSON response
    let parsedResponse: { questions?: GeneratedQuestion[] };
    try {
      parsedResponse = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content);
      throw new Error('Invalid JSON response from OpenAI API');
    }

    // Validate response structure
    if (!parsedResponse.questions || !Array.isArray(parsedResponse.questions)) {
      throw new Error('Invalid response format: missing questions array');
    }

    // Validate and clean up each question
    const questions: GeneratedQuestion[] = parsedResponse.questions
      .slice(0, count) // Ensure we don't exceed requested count
      .map((q: any, index: number) => {
        // Validate required fields
        if (!q.prompt || !Array.isArray(q.choices) || typeof q.answer !== 'number') {
          throw new Error(
            `Invalid question format at index ${index}: missing required fields`
          );
        }

        // Ensure exactly 4 choices
        if (q.choices.length !== 4) {
          throw new Error(
            `Question at index ${index} must have exactly 4 choices, got ${q.choices.length}`
          );
        }

        // Validate answer index
        if (q.answer < 0 || q.answer >= 4) {
          throw new Error(
            `Question at index ${index} has invalid answer index: ${q.answer} (must be 0-3)`
          );
        }

        return {
          prompt: String(q.prompt).trim(),
          choices: q.choices.map((c: any) => String(c).trim()),
          answer: Number(q.answer),
          explanation: q.explanation ? String(q.explanation).trim() : '',
          sourceRef: q.sourceRef || undefined,
        };
      });

    if (questions.length === 0) {
      throw new Error('No valid questions generated');
    }

    return questions;
  } catch (error) {
    // Re-throw if it's already our custom error
    if (error instanceof Error && error.message.includes('OPENAI_API_KEY')) {
      throw error;
    }

    // Handle OpenAI API errors
    if (error instanceof OpenAI.APIError) {
      console.error('OpenAI API Error:', error.status, error.message);
      throw new Error(
        `OpenAI API error: ${error.message}. Please check your API key and try again.`
      );
    }

    // Handle other errors
    console.error('Error generating questions:', error);
    throw new Error(
      `Failed to generate questions: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
