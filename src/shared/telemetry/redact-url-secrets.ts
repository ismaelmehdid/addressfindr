// why: some APIs (Google Street View Static) only accept the key in the URL.
// Next's fetch and the undici instrumentation copy the full URL into span
// names and attributes; without this filter the key would reach the OTLP
// exporter in plain text.
const SECRET_QUERY_PARAM =
  /([?&](?:key|api_key|apikey|access_token|token)=)[^&#\s"]*/gi;

export function redactUrlSecrets(value: string): string {
  return value.replace(SECRET_QUERY_PARAM, '$1REDACTED');
}
