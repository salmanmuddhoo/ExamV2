# Edge Functions

This directory contains Supabase Edge Functions for the ExamV2 application.

## Available Functions

1. **exam-assistant** - AI-powered exam study assistant
2. **extract-syllabus-chapters** - Extract chapters from syllabus documents
3. **process-exam-paper** - Process and analyze exam papers
4. **retag-questions** - Re-tag questions with syllabus chapters
5. **send-receipt-email** - Send payment receipt emails to students

## Configuration

Edge functions use the configuration in `deno.json` for import mappings and compiler options.

## Deployment

Edge functions are automatically deployed to production when changes are pushed to the `main` branch via the GitHub Actions workflow in `.github/workflows/supabase-edge-deploy.yml`.
