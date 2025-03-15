export default {
  async fetch(request, env, ctx) {
    return handleRequest(request);
  }
};

async function handleRequest(request) {
  const { method } = request;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Handle preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  // Special POST route for key obfuscation
  if (method === 'POST' && url.pathname === '/obfuscate-key') {
    try {
      const body = await request.json();
      const rawKey = body.key || '';
      if (!/^sk-|fk-/.test(rawKey)) {
        return new Response(JSON.stringify({ error: 'Invalid key format' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        });
      }
      const obfuscated = rawKey.split('').map(c => CHAR_MAP[c] || c).join('');
      return new Response(JSON.stringify({ obfuscated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    }
  }

  const provider = pathParts[0];
  const endpointPath = '/' + pathParts.slice(1).join('/');

  let baseUrl;
  if (provider === 'openai') {
    baseUrl = 'https://api.openai.com';
  } else if (provider === 'fireworks') {
    baseUrl = 'https://api.fireworks.ai/inference';
  } else {
    return new Response('Unsupported provider', { status: 400, headers: corsHeaders() });
  }

  const targetUrl = baseUrl + endpointPath + url.search;

  let headers = new Headers(request.headers);
  let body = request.body;
  let isFormEncoded = false;

  // Check for form submission and translate it to JSON
  const contentType = headers.get('Content-Type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    isFormEncoded = true;
    const formData = await request.formData();

    const model = formData.get('model') || 'gpt-3.5-turbo';
    const system = formData.get('systemMessage') || '';
    const user = formData.get('userMessage') || '';

    const jsonBody = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_tokens: parseInt(formData.get('max_tokens')) || 1024,
      top_p: parseFloat(formData.get('top_p')) || 1,
      top_k: parseInt(formData.get('top_k')) || 40,
      presence_penalty: parseFloat(formData.get('presence_penalty')) || 0,
      frequency_penalty: parseFloat(formData.get('frequency_penalty')) || 0,
      temperature: parseFloat(formData.get('temperature')) || 0.6
    });

    headers.set('Content-Type', 'application/json');
    body = jsonBody;
  }

  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: 'follow'
  });

  const result = await response.json();

  if (isFormEncoded) {
    const xmlContent = jsonToChatXml(result);
    return new Response(xmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        ...corsHeaders()
      }
    });
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Headers', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  return new Response(JSON.stringify(result), {
    status: response.status,
    headers: newHeaders
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function jsonToChatXml(json) {
  const choices = json.choices || [];
  const messages = choices.map(choice => {
    const role = escapeHtml(choice.message?.role || 'assistant');
    const content = escapeHtml(choice.message?.content || '');
    return `<message role="${role}">${content}</message>`;
  }).join('\n');

  return `<chat>${messages}</chat>`;
}

// this is just for a demo - don't do this in production
const CHAR_MAP = {
  A: 'Q', B: 'W', C: 'E', D: 'R', E: 'T', F: 'Y', G: 'U', H: 'I', I: 'O', J: 'P',
  K: 'A', L: 'S', M: 'D', N: 'F', O: 'G', P: 'H', Q: 'J', R: 'K', S: 'L', T: 'Z',
  U: 'X', V: 'C', W: 'V', X: 'B', Y: 'N', Z: 'M',
  a: 'q', b: 'w', c: 'e', d: 'r', e: 't', f: 'y', g: 'u', h: 'i', i: 'o', j: 'p',
  k: 'a', l: 's', m: 'd', n: 'f', o: 'g', p: 'h', q: 'j', r: 'k', s: 'l', t: 'z',
  u: 'x', v: 'c', w: 'v', x: 'b', y: 'n', z: 'm',
  0: '9', 1: '8', 2: '7', 3: '6', 4: '5', 5: '4', 6: '3', 7: '2', 8: '1', 9: '0',
  '-': '-', '_': '_'
};

const REVERSE_MAP = Object.fromEntries(Object.entries(CHAR_MAP).map(([k, v]) => [v, k]));

function decodeObfuscatedKey(obfuscated) {
  return obfuscated.split('').map(c => REVERSE_MAP[c] || c).join('');
}

function safeBase64Decode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4 !== 0) str += '=';
  return atob(str);
}
