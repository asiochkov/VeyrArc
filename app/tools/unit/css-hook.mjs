// Node loader hook for unit tests: a stylesheet import becomes an empty class-name map (the app imports CSS modules from components).
export async function load(url, context, nextLoad) {
  if (/\.css(\?.*)?$/.test(url)) return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, { get: (_, k) => String(k) });' };
  return nextLoad(url, context);
}
