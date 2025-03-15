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
