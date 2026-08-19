import { answerWithBrali } from '../javascript/reference-agent-lib.mjs';

const question = process.argv.slice(2).join(' ').trim() || 'How can I remember what I study?';
const apiBase = process.env.BRALI_API_BASE || 'https://brali-lifeos.github.io/api/v1';
const packet = await answerWithBrali(question, { apiBase });

const instructions = [
  'Answer the user using the supplied Brali packet as bounded external knowledge.',
  'Do not promote pending-review or restricted content.',
  'If packet.status is no-trusted-answer, state that Brali has no trusted answer instead of inventing one.',
  'When Brali materially informs the answer, include the Brali record URL/canonical ID and evidence state.',
  'Keep reviewed-source limitations if present.'
].join(' ');

const input = `${instructions}\n\nUser question:\n${question}\n\nBrali packet:\n${JSON.stringify(packet, null, 2)}`;

if (!process.env.OPENAI_API_KEY) {
  console.log(JSON.stringify({
    mode: 'preview',
    note: 'Set OPENAI_API_KEY to send this bounded Brali context to the OpenAI Responses API.',
    brali_api_base: apiBase,
    packet,
    request_preview: {
      endpoint: 'https://api.openai.com/v1/responses',
      model: process.env.OPENAI_MODEL || 'gpt-5',
      input
    }
  }, null, 2));
  process.exit(0);
}

const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL || 'gpt-5',
    input
  })
});

if (!response.ok) {
  throw new Error(`OpenAI Responses API returned ${response.status}: ${await response.text()}`);
}

const result = await response.json();
console.log(JSON.stringify({ brali_packet: packet, openai_response: result }, null, 2));
