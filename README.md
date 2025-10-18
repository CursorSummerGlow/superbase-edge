# superbase-edge

Lightweight starter for building Supabase-backed serverless/Edge functions and APIs.

This repository contains edge-runtime-friendly APIs that talk to Supabase. It aims to be minimal, secure, and easy to deploy to platforms that support Edge/Serverless runtimes.

---

## Contents

- Overview
- Features
- Technology stack

---

## Overview

This repo demonstrates how to:

- Create edge-compatible API endpoints that call Supabase.
- Use Supabase client in an edge runtime (minimal bundle, no Node-only APIs).
- Securely store and use Supabase credentials in environment variables.
- Deploy to modern edge platforms.

It includes example endpoints for common patterns (auth-protected requests, server-side queries, insert/update operations), plus notes on scaling and security.

---

## Features

### Photo Upload + Prompt (Supabase Edge Function)
A lightweight HTTP POST endpoint that:

1. accepts a base64 image and prompt,
2. stores the image in Supabase Storage,
3. records metadata in the photos table, and
3. enqueues the new photo in pgmq for downstream generation.

### Request
JSON body
```
{
  "image_data": "data:image/jpeg;base64,/9j/4AAQ...",
  "prompt": "Make it look like watercolor",
  "user_id": "e0d1234a-56b7-4a89-9f10-1ab2cd345678",
  "theme_id": 42
}
```

Response
```
{
  "success": true,
  "photo": {
    "id": 123,
    "user_id": "e0d1234a-56b7-4a89-9f10-1ab2cd345678",
    "original_image": "https://<project>.supabase.co/storage/v1/object/public/photos/original/...",
    "prompt": "Make it look like watercolor",
    "theme_id": 42,
    "generated_image": null,
    "status": "loading",
  },
  "message_id": 98765,
  "message": "Photo uploaded successfully"
}
```

---

## Tech stack

### Supabase
- Database

  - Photo metadata table

  Store the photo metadata, like prompt for each photo & the generated output photo

- Auth

  - User login/logout

- Edge Functions

  - Upload Image Function

    Trigger additional workflows when a user uploads an image
      - Add metadata to `photo` table
      - Enqueue photo generation to queue

  - Image Generator Function (more like a worker)

    1. Checks for any existing photo generation requests in the generator queue
    2. Generates image using the user prompt using Google Gemini
    3. Upon completion, updates job state in the `photo` table (`pending` --> `completed`)

      Utilises the [Background Tasks](https://supabase.com/docs/guides/functions/background-tasks) advanced feature to prevent blocking of main handler

- Realtime

  1. iOS app will watch for status updates on the `photo` table
  2. When status changes from `pending` --> `completed`, the app will display the generated image

    Utilises the [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes?queryGroups=language&language=swift#listening-to-update-events) feature

- Integrations

  - [Cron](https://supabase.com/docs/guides/cron)

    Cron will trigger `Image Generator Function` every 10 seconds.

    Frequency can be fine-tuned to prevent rate-limiting issues by image generation APIs

  - [Queues](https://supabase.com/docs/guides/queues)

    Uitlised queue to decouple the image generate requests from the generation function

    Image generation takes time, serves as a backpressure to ensure high availability

### TypeScript

Used in edge functions

---

## Data Flow

```
[iOS App]
   │
   ▼
[Edge Function 1]
   ├── Upload image → Object Storage (original image)
   ├── Insert photo metadata → DB (metadata)
   └── Enqueue new photo generator job → Generator Queue
   │
(CRON activates worker every 10s)
   │
   ▼
[Edge Function 2]
   ├── Get next job details from queue
   ├── Fetch job prompt/photo from DB
   ├── Generate image using Gemini 2.5 Flash
   ├── Upload generated image to Object Storage
   └── Update job state to DB (status=completed)
   │
   ▼
[iOS App Realtime]
   ├── Listen for status updates
   └── When status completed, fetch generated image + display

```
---
