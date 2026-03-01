/**
 * AI Module
 *
 * Provides AI/ML capabilities using Cloudflare Workers AI binding.
 * Supports text generation, embeddings, streaming, and AI Gateway.
 */

/**
 * Workers AI binding interface
 */
export interface Ai {
    run<T = unknown>(model: string, inputs: unknown, options?: AiRunOptions): Promise<T>;
}

/**
 * AI run options
 */
export interface AiRunOptions {
    /** Return streaming response */
    stream?: boolean;
    /** Gateway cache key */
    cacheKey?: string;
}

/**
 * AI service options
 */
export interface AIOptions {
    /** Workers AI binding */
    binding: Ai;
    /** AI Gateway configuration (optional) */
    gateway?: {
        /** Gateway ID */
        id: string;
        /** Optional cache key prefix */
        cacheKey?: string;
    };
}

/**
 * AI service
 */
export interface AIService {
    /** Run any model with custom inputs */
    run<T>(model: string, inputs: unknown, options?: AiRunOptions): Promise<T>;
    /** Generate text from a prompt */
    text(prompt: string, model?: string): Promise<string>;
    /** Generate embeddings for text */
    embed(text: string | string[], model?: string): Promise<number[][]>;
    /** Stream text generation */
    stream(prompt: string, model?: string): Promise<ReadableStream>;
    /** Extract text from an image */
    imageToText(imageData: ArrayBuffer, model?: string): Promise<string>;
}

/**
 * Text generation response
 */
interface TextGenerationResponse {
    response: string;
}

/**
 * Embedding response
 */
interface EmbeddingResponse {
    data: Array<{ embedding: number[] }>;
}

/**
 * Image to text response
 */
interface ImageToTextResponse {
    description?: string;
    text?: string;
    caption?: string;
}

/**
 * Create an AI service for Workers AI
 *
 * @example
 * ```typescript
 * const ai = createAI({
 *   binding: env.AI,
 *   // Optional: use AI Gateway for caching and logging
 *   gateway: {
 *     id: 'my-gateway',
 *     cacheKey: 'api-key'
 *   }
 * });
 *
 * // Text generation (default: Llama 3.1 8B)
 * const response = await ai.text('What is machine learning?');
 * console.log(response);
 *
 * // With custom model
 * const code = await ai.text('Write a hello world in Python', '@cf/mistral/mistral-7b-instruct-v0.1');
 *
 * // Embeddings (default: BGE Small EN v1.5)
 * const embeddings = await ai.embed('Hello world');
 * console.log(embeddings[0].length); // 384 dimensions
 *
 * // Multiple embeddings in one call
 * const embeddings = await ai.embed(['Text 1', 'Text 2', 'Text 3']);
 *
 * // Streaming text generation
 * const stream = await ai.stream('Tell me a story');
 * return new Response(stream, {
 *   headers: { 'Content-Type': 'text/event-stream' }
 * });
 *
 * // Image to text (OCR / image captioning)
 * const imageData = await fetch('https://example.com/image.jpg').then(r => r.arrayBuffer());
 * const description = await ai.imageToText(imageData);
 *
 * // Run any model directly
 * const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
 *   messages: [
 *     { role: 'system', content: 'You are a helpful assistant' },
 *     { role: 'user', content: 'Hello!' }
 *   ]
 * });
 * ```
 */
export function createAI(options: AIOptions): AIService {
    const binding = options.binding;
    const gateway = options.gateway;

    /**
     * Get the model URL with optional gateway prefix
     */
    function getModelUrl(model: string): string {
        if (gateway) {
            // Use AI Gateway URL format
            return `https://gateway.ai.cloudflare.com/v1/${gateway.id}/${model}`;
        }
        return model;
    }

    /**
     * Run any model with custom inputs
     */
    async function run<T>(model: string, inputs: unknown, runOptions?: AiRunOptions): Promise<T> {
        const modelUrl = getModelUrl(model);

        // Merge options
        const mergedOptions: AiRunOptions = {
            ...runOptions,
        };

        if (gateway?.cacheKey) {
            mergedOptions.cacheKey = gateway.cacheKey;
        }

        try {
            return await binding.run<T>(modelUrl, inputs, mergedOptions);
        } catch (error) {
            console.error("AI run error:", error);
            throw error;
        }
    }

    /**
     * Generate text from a prompt
     */
    async function text(prompt: string, model = "@cf/meta/llama-3.1-8b-instruct"): Promise<string> {
        const inputs = {
            messages: [{ role: "user", content: prompt }],
        };

        try {
            const result = await run<TextGenerationResponse>(model, inputs);
            return result.response || "";
        } catch (error) {
            console.error("AI text generation error:", error);
            return "";
        }
    }

    /**
     * Generate embeddings for text
     */
    async function embed(textInput: string | string[], model = "@cf/baai/bge-small-en-v1.5"): Promise<number[][]> {
        const texts = Array.isArray(textInput) ? textInput : [textInput];

        const inputs = { text: texts };

        try {
            const result = await run<EmbeddingResponse>(model, inputs);
            return result.data.map((d) => d.embedding);
        } catch (error) {
            console.error("AI embedding error:", error);
            return texts.map(() => []);
        }
    }

    /**
     * Stream text generation
     */
    async function stream(prompt: string, model = "@cf/meta/llama-3.1-8b-instruct"): Promise<ReadableStream> {
        const inputs = {
            messages: [{ role: "user", content: prompt }],
            stream: true,
        };

        try {
            const result = await run<ReadableStream>(model, inputs, { stream: true });
            return result;
        } catch (error) {
            console.error("AI streaming error:", error);
            // Return empty stream on error
            return new ReadableStream({
                start(controller) {
                    controller.close();
                },
            });
        }
    }

    /**
     * Extract text from an image (OCR / image captioning)
     */
    async function imageToText(imageData: ArrayBuffer, model = "@cf/unum/uform-gen2-qwen-500m"): Promise<string> {
        const inputs = {
            image: [...new Uint8Array(imageData)],
        };

        try {
            const result = await run<ImageToTextResponse>(model, inputs);
            return result.description || result.text || result.caption || "";
        } catch (error) {
            console.error("AI image to text error:", error);
            return "";
        }
    }

    return {
        run,
        text,
        embed,
        stream,
        imageToText,
    };
}

/**
 * AI service type
 */
export type AI = ReturnType<typeof createAI>;
