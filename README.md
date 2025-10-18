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

- Supabase (Database + Storage)
- TypeScript

---
