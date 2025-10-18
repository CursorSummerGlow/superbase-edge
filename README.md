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

- Example server-side Supabase queries and inserts
- Environment and deployment guidance

---

## Tech stack

- Supabase (Database + Storage)
- TypeScript (repo may contain either)
- Edge runtime compatible client (the official @supabase/supabase-js works in many edge runtimes; use light-weight client options if needed)

---
