// why: certaines API (Google Street View Static) n'acceptent la cle que dans
// l'URL. Le fetch de Next et l'instrumentation undici recopient l'URL complete
// dans le nom et les attributs des spans ; sans ce filtre, la cle partirait en
// clair vers l'exporteur OTLP.
const SECRET_QUERY_PARAM =
  /([?&](?:key|api_key|apikey|access_token|token)=)[^&#\s"]*/gi;

export function redactUrlSecrets(value: string): string {
  return value.replace(SECRET_QUERY_PARAM, '$1REDACTED');
}
