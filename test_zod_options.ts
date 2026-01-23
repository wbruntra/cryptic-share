
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const MySchema = z.object({
  num: z.number().int().positive(),
  str: z.string(),
});

const jsonSchemaStandard = zodToJsonSchema(MySchema, {
  $refStrategy: 'none',
});

const jsonSchemaOpenAI = zodToJsonSchema(MySchema, {
  $refStrategy: 'none',
  target: 'openAi',
});

console.log('Standard:', JSON.stringify(jsonSchemaStandard, null, 2));
console.log('OpenAI:', JSON.stringify(jsonSchemaOpenAI, null, 2));
