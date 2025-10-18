// Upload function for photos with prompt to Supabase Storage and database
import { createClient } from "@supabase/supabase-js";

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const { image_data, prompt, user_id, theme_id } = body;

    if (!image_data) {
      return new Response("Missing image data", { status: 400 });
    }

    if (!prompt) {
      return new Response("Missing prompt", { status: 400 });
    }

    // Validate UUID format, if invalid or empty, set to null
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const validUserId = user_id && uuidRegex.test(user_id) ? user_id : null;

    // Convert base64 to buffer
    let imageBuffer: Uint8Array;
    let contentType = "image/jpeg"; // default
    let fileExtension = "jpg";

    if (image_data.startsWith("data:image/")) {
      // Handle data URL format: data:image/jpeg;base64,/9j/4AAQ...
      const [header, base64Data] = image_data.split(",");
      const mimeMatch = header.match(/data:image\/([a-zA-Z]*)/);
      if (mimeMatch) {
        contentType = `image/${mimeMatch[1]}`;
        fileExtension = mimeMatch[1];
      }
      imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    } else {
      // Handle raw base64 string
      imageBuffer = Uint8Array.from(atob(image_data), (c) => c.charCodeAt(0));
    }

    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get("SUPABASE_URL")!,
      // Use service role key to bypass RLS
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Upload original image to Storage
    const timestamp = +new Date();
    const fileName = `image-${timestamp}.${fileExtension}`;
    const uploadPath = `original/${validUserId || "anonymous"}/${fileName}`;
    const { data: upload, error: uploadError } = await supabaseClient.storage
      .from("photos")
      .upload(uploadPath, imageBuffer, {
        contentType: contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response("Failed to upload the image", { status: 500 });
    }

    // Get the public URL for the uploaded image
    const { data: { publicUrl } } = supabaseClient.storage
      .from("photos")
      .getPublicUrl(upload.path);

    // Insert record to photos table
    const { data: photoData, error: dbError } = await supabaseClient
      .from("photos")
      .insert({
        user_id: validUserId,
        original_image: publicUrl,
        prompt: prompt,
        theme_id: theme_id,
        // generated_image will be null initially, can be updated later
        generated_image: null,
        status: "loading",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return new Response("Failed to save photo record", { status: 500 });
    }

    // After record saved, send photo id to pgmq for processing
    const { data: msgId, error: sendError } = await supabaseClient
      .schema("pgmq")
      .rpc("send", {
        queue_name: "a_generate-queue",
        message: { photo_id: photoData.id },
      });

    if (sendError) {
      console.error("Queue error");
      return new Response("Failed to queue record for processing", {
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        photo: photoData,
        message_id: msgId,
        message: "Photo uploaded successfully",
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response("Internal server error", { status: 500 });
  }
});
