import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.21.0";
//
//
// static vars
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const geminiKey = Deno.env.get("GEMINI_API_KEY");
const queueName = 'generate-queue';
const bucket = "photos";
//
// clients
const supabase = createClient(supabaseUrl, supabaseKey);
const googleImg = new GoogleGenerativeAI(geminiKey);
const googleModel = googleImg.getGenerativeModel({
  model: "gemini-2.5-flash-image"
});
//
//
// Read object to base64
async function readOriginalPhotoFromObject(userId, originalImgObjectName) {
  const userIdPath = userId.toUpperCase();
  const objectPath = `original/${userIdPath}/${originalImgObjectName}`;
  console.log("readOriginalPhotoFromObject", "objectPath", objectPath);
  //
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  const res = await fetch(data.publicUrl);
  //
  if (!res.ok) {
    console.log(`zzzzzz Fetch failed: ${res.status} ${res.statusText} ${res}`);
    throw new Error(`Fetch failed: ${res}`);
  }
  //
  // const arrayBuffer = await res.arrayBuffer();
  // return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const arrayBuffer = await res.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  // Convert to base64 in chunks to avoid call stack overflow
  let binary = '';
  const chunkSize = 8192; // Process in 8KB chunks
  for(let i = 0; i < uint8Array.length; i += chunkSize){
    const chunk = uint8Array.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}
//
//
// Generator image coordinator
async function generateImageCoordinator(photo_row) {
  // Extract information from row
  const photoId = photo_row.id;
  const userId = photo_row.user_id;
  const originalImgLink = photo_row.original_image;
  const prompt1 = photo_row.prompt;
  //
  // Extract original image filename & type
  const objectName = originalImgLink.split('/').pop();
  const imgType = objectName.split('.').pop();
  console.log("wtf", objectName, originalImgLink, imgType);
  //
  // Get the original image
  const originalImgB64 = await readOriginalPhotoFromObject(userId, objectName);
  console.log("generateImageCoordinator", userId, originalImgLink, objectName, imgType);
  //
  // Generate image
  const generatedImgResult = await generateImage(prompt1, imgType, originalImgB64);
  if (generatedImgResult.generated_images.length === 0) {
    throw new Error(`No image generated: ${generatedImgResult}`);
  }
  //
  // Upload generated image
  const generatedImage = generatedImgResult.generated_images[0];
  const uploadedImg = await uploadImageToObject(userId, generatedImage);
  //
  // update the photo_id row
  const generatedImgPath = uploadedImg.path;
  updatePhotoDb(photoId, generatedImgPath);
}
//
//
// update photos DB
async function updatePhotoDb(photo_id, generated_img_path) {
  // Get the public URL for the uploaded image
  const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(generated_img_path);
  // Update values
  const { updated_data, updated_error } = await supabase.from("photos").update({
    status: "completed",
    generated_image: publicUrl,
    updated_at: new Date().toISOString()
  }).eq('id', photo_id);
  console.log("updated_data", updated_data, updated_error);
  if (updated_error) {
    throw updated_error;
  }
}
//
//
// Upload image to object
async function uploadImageToObject(userId, imageData) {
  let imageBuffer;
  let contentType = "image/jpeg"; // default
  let fileExtension = "jpg";
  if (imageData.startsWith("data:image/")) {
    // Handle data URL format: data:image/jpeg;base64,/9j/4AAQ...
    const [header, base64Data] = imageData.split(",");
    const mimeMatch = header.match(/data:image\/([a-zA-Z]*)/);
    if (mimeMatch) {
      contentType = `image/${mimeMatch[1]}`;
      fileExtension = mimeMatch[1];
    }
    imageBuffer = Uint8Array.from(atob(base64Data), (c)=>c.charCodeAt(0));
  } else {
    // Handle raw base64 string
    imageBuffer = Uint8Array.from(atob(imageData), (c)=>c.charCodeAt(0));
  }
  const objectName = Date.now();
  const userIdPath = userId.toUpperCase();
  const imgPath = `generated/${userIdPath}/${objectName}.jpg`;
  const { data: upload, error: uploadError } = await supabase.storage.from(bucket).upload(imgPath, imageBuffer, {
    contentType: contentType,
    cacheControl: "3600",
    upsert: false
  });
  if (uploadError) {
    throw uploadError;
  }
  console.log("uploadImageToObject", "aaaaaa", upload);
  //
  return upload;
}
//
//
// Image generator using google
async function generateImage(imgPrompt, originalImgType, originalImgB64) {
  // update img type to the correct standard that google accepts
  var correctedImgType = originalImgType;
  if (originalImgType === 'jpg') {
    correctedImgType = 'jpeg';
  }
  // call google
  const modelResp = await googleModel.generateContent([
    {
      inlineData: {
        mimeType: `image/${correctedImgType}`,
        data: originalImgB64
      }
    },
    {
      text: `Create an image based on this prompt: "${imgPrompt}".`
    }
  ]);
  console.log("generateImage", "modelResp", modelResp);
  // create response
  const result = {
    success: true,
    imgPrompt,
    generated_images: [],
    text_responses: []
  };
  const parts = modelResp?.response?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts){
    if (part.text) result.text_responses.push(part.text);
    else if (part.inlineData?.data) {
      result.generated_images.push(`data:image/${correctedImgType};base64,${part.inlineData.data}`);
    }
  }
  console.log("generateImage", "result", result);
  //
  return result;
}
//
//
// Process 1 msg
async function processMessage(queueMsg) {
  console.log("processing msg", queueMsg);
  //
  // get photo_id from queue message
  const { photo_id } = queueMsg.message;
  console.log("photo_id", photo_id);
  //
  // get photo_id details from DB
  const { data, error } = await supabase.from("photos").select('*').eq('id', photo_id).single();
  console.log("photo_id data DB", data, error);
  //
  // throw error upwards if error
  if (error) {
    error.photo_id = photo_id;
    console.error("photo_id data DB error", error);
    throw error;
  }
  //
  // do the image generation stuff
  await generateImageCoordinator(data);
  //
  // update the status of the photo row
  const { updated_data, updated_error } = await supabase.from("photos").update({
    status: "completed"
  }).eq('id', photo_id);
  console.log("updated_data", updated_data, updated_error);
  //
  // archive the queue message
  const { del_data, del_error } = await supabase.schema('pgmq').rpc('archive', {
    queue_name: queueName,
    msg_id: queueMsg.msg_id
  });
  console.log("del_data", del_data, del_error);
}
//
//
// Process all msgs concurrently
async function processMessagesConcurrently(msgs) {
  const results = await Promise.allSettled(msgs.map((msg)=>processMessage(msg)));
  const failedMsgs = results.map((result, index)=>{
    if (result.status === 'rejected') {
      return {
        queueMsg: msgs[index],
        processingError: result.reason,
        at: new Date().toISOString()
      };
    }
    return null;
  }).filter((x)=>x !== null);
  // Optionally log them
  failedMsgs.forEach((f)=>console.error('processMessage failed for msg:', f.queueMsg, 'error:', f.processingError));
  return {
    failedMsgs
  };
}
//
//
// Task function
async function task(queue_msgs) {
  console.log("running from task");
  // await new Promise((f)=>setTimeout(f, 8000));
  const { failedMsgs } = await processMessagesConcurrently(queue_msgs);
  console.log("failedMsgs", failedMsgs.toString());
  console.log("finish task");
}
//
//
// Main runner
Deno.serve(async (req)=>{
  const { data, error } = await supabase.schema('pgmq').rpc('read', {
    queue_name: queueName,
    vt: 5,
    qty: 2
  });
  const msgs = data;
  console.log("msgs", msgs);
  EdgeRuntime.waitUntil(task(msgs));
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
