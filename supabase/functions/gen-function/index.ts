/**
 * Edge Function for generating images with Google GenAI (Gemini) or returning placeholder images.
 */

import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.21.0";

// Import Supabase Edge Runtime type definitions
import "@supabase/functions-js/edge-runtime";

// Create placeholder images as base64 data URLs
const createPlaceholderImage = (
  width: number,
  height: number,
  color: string,
  text: string,
): string => {
  // Create a simple SVG placeholder
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${color}"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" 
            text-anchor="middle" dominant-baseline="middle" fill="white">
        ${text}
      </text>
    </svg>
  `;

  // Convert SVG to base64
  const base64 = btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
};

// Convert data URL to base64 string
const dataUrlToBase64 = (dataUrl: string): string => {
  return dataUrl.split(",")[1];
};

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const { prompt, test_type = "single" } = body;

    if (!prompt) {
      return new Response("Missing prompt", { status: 400 });
    }

    // Initialize Google Generative AI
    const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);

    let response;
    let generatedImageUrl = "";

    if (test_type === "single") {
      // Test 1: Single image generation with text prompt only
      console.log("Testing single image generation...");

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-image",
      });

      response = await model.generateContent([
        {
          text:
            `Create an image based on this prompt: "${prompt}". Make it a high-quality, detailed image.`,
        },
      ]);
    } else if (test_type === "multi") {
      // Test 2: Multiple placeholder images + text prompt
      console.log("Testing multi-image generation...");

      // Create placeholder images
      const womanImage = createPlaceholderImage(400, 400, "#4A90E2", "Woman");
      const logoImage = createPlaceholderImage(200, 200, "#E24A4A", "Logo");

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-image",
      });

      const promptContent = [
        {
          inlineData: {
            mimeType: "image/svg+xml",
            data: dataUrlToBase64(womanImage),
          },
        },
        {
          inlineData: {
            mimeType: "image/svg+xml",
            data: dataUrlToBase64(logoImage),
          },
        },
        {
          text:
            `Take the first image of the woman and add the logo from the second image onto her shirt. ${prompt}`,
        },
      ];

      response = await model.generateContent(promptContent);
    } else if (test_type === "style_transfer") {
      // Test 3: Style transfer with placeholder
      console.log("Testing style transfer...");

      const styleImage = createPlaceholderImage(400, 400, "#8B4513", "Style");
      const contentImage = createPlaceholderImage(
        400,
        400,
        "#32CD32",
        "Content",
      );

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-image",
      });

      const promptContent = [
        {
          inlineData: {
            mimeType: "image/svg+xml",
            data: dataUrlToBase64(styleImage),
          },
        },
        {
          inlineData: {
            mimeType: "image/svg+xml",
            data: dataUrlToBase64(contentImage),
          },
        },
        {
          text:
            `Apply the artistic style from the first image to the content of the second image. ${prompt}`,
        },
      ];

      response = await model.generateContent(promptContent);
    } else {
      return new Response(
        "Invalid test_type. Use 'single', 'multi', or 'style_transfer'",
        { status: 400 },
      );
    }

    // Process the response
    const result = {
      success: true,
      test_type,
      prompt,
      generated_images: [] as string[],
      text_responses: [] as string[],
    };

    for (const part of response.response.candidates[0].content.parts) {
      if (part.text) {
        console.log("Text response:", part.text);
        result.text_responses.push(part.text);
      } else if (part.inlineData) {
        console.log("Generated image received!");
        const imageData = part.inlineData.data;

        // Convert base64 to data URL for easy viewing
        const dataUrl = `data:image/png;base64,${imageData}`;
        result.generated_images.push(dataUrl);

        // In a real implementation, you would save this to storage
        // For now, we'll just include it in the response
      }
    }

    return new Response(
      JSON.stringify({
        ...result,
        message:
          `Image generation test completed successfully! Generated ${result.generated_images.length} image(s).`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in image generation test:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Image generation test failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
