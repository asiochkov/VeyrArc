export function localUrl(value) {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('E2E writes are allowed only against a loopback test environment');
  }
  return value;
}
