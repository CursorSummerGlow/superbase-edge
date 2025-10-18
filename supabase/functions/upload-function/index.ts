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
    const formData = await req.formData();
    const file = formData.get("image") as File;
    const prompt = formData.get("prompt") as string;

    if (!file) {
      return new Response("Missing image file", { status: 400 });
    }

    if (!prompt) {
      return new Response("Missing prompt", { status: 400 });
    }

    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get("SUPABASE_URL")!,
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    // Get the user ID from the JWT token
    const authHeader = req.headers.get("Authorization");
    let userId = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabaseClient.auth
        .getUser(token);
      if (!authError && user) {
        userId = user.id;
      }
    }

    // Upload original image to Storage
    const timestamp = +new Date();
    const uploadName = `original-${timestamp}-${file.name}`;
    const { data: upload, error: uploadError } = await supabaseClient.storage
      .from("photos")
      .upload(uploadName, file, {
        contentType: file.type,
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
        user_id: userId,
        original_image: publicUrl,
        prompt: prompt,
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

    return new Response(
      JSON.stringify({
        success: true,
        photo: photoData,
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
