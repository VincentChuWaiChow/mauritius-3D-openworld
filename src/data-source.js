/** A deadline covers headers AND JSON decoding; cancellation also settles non-cooperative fetches. */
export async function fetchJSON(url, { signal, timeoutMs = 12000, fetchImpl = fetch, ...options } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid timeout');
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const controller = new AbortController();
  let timer, cancel;
  const interrupted = new Promise((_, reject) => {
    cancel = () => {
      const error = new DOMException('Cancelled', 'AbortError');
      controller.abort(error);
      reject(error);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      const error = new DOMException('Data request timed out', 'TimeoutError');
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([interrupted, (async () => {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

const coordinate = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)
  && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

export function parseOSM(result) {
  if (!result || !Array.isArray(result.elements)) throw new Error('Invalid OSM data');
  if (result.remark) throw new Error(`Overpass: ${result.remark}`);
  return { ...result, elements: result.elements.filter(el => el && (
    (el.type === 'node' && coordinate(el)) ||
    (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2 && el.geometry.every(coordinate))
  )) };
}
