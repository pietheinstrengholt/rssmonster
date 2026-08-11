// This function returns the server-controlled URL used for internal MCP requests.
export const getInternalMcpUrl = () => {
  const configuredUrl = process.env.INTERNAL_MCP_URL
    || `http://127.0.0.1:${process.env.PORT || 3000}/mcp`;
  let url;

  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error('INTERNAL_MCP_URL must be a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('INTERNAL_MCP_URL must use HTTP or HTTPS');
  }

  if (url.username || url.password) {
    throw new Error('INTERNAL_MCP_URL must not contain credentials');
  }

  return url.toString();
};
