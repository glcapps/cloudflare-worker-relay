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

  // Expect path like /openai/v1/chat/completions or /fireworks/v1/chat/completions
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

  // Relay request
  const response = await fetch(targetUrl, {
    method,
    headers: request.headers,
    body: request.body,
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
