import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().optional(),
  ADMIN_API_KEY: z.string().optional(),
  DATA_DIR: z.string().optional(),
  EMAILJS_PUBLIC_KEY: z.string().min(1, 'EMAILJS_PUBLIC_KEY is required'),
  EMAILJS_SERVICE_ID: z.string().min(1, 'EMAILJS_SERVICE_ID is required'),
  EMAILJS_TEMPLATE_ID: z.string().min(1, 'EMAILJS_TEMPLATE_ID is required'),
  EMAILJS_PRIVATE_KEY: z.string().min(1, 'EMAILJS_PRIVATE_KEY is required'),
  EMAILJS_ENDPOINT: z.string().url().default('https://api.emailjs.com/api/v1.0/email/send'),
});

export const env = envSchema.parse(process.env);
