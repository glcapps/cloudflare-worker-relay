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
    baseUrl = 'https://api.fireworks.ai';
  } else {
    return new Response('Unsupported provider', { status: 400, headers: corsHeaders() });
  }

  const targetUrl = baseUrl + endpointPath + url.search;

  let headers = new Headers(request.headers);
  let body = request.body;

  // Check for form submission and translate it to JSON
  const contentType = headers.get('Content-Type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();

    const model = formData.get('model') || 'gpt-3.5-turbo';
    const system = formData.get('systemMessage') || '';
    const user = formData.get('userMessage') || '';

    const jsonBody = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });

    headers.set('Content-Type', 'application/json');
    body = jsonBody;
  }

  // Relay the (possibly transformed) request
  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: 'follow',
  });

  // Copy response headers and add CORS
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Headers', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  return new Response(response.body, {
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
