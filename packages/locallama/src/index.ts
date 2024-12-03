import path from 'node:path';
import ollama from 'ollama'
import fs from "fs/promises"
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);

// Use `dirname` to get the __dirname equivalent
const __dirname = dirname(__filename);

const file = path.join(__dirname, 'image.png')
const data = await fs.readFile(file)
const image = data.toString('base64')

const response = await ollama.chat({
  model: 'llama3.2-vision',
  // model: 'llava',
  messages: [{
    role: 'user',
    content: 'Understand the image, and return a short image name with ext .png',
    images: [image]
  }]
})

console.log(response)
