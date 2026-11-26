/**
 * The few ComfyUI server routes the client needs. ComfyUI has no login: the
 * server is reachable only inside the owner's Tailscale network.
 *
 *   POST /prompt          queue a graph            GET /history/<id>  result of a job
 *   POST /upload/image    a file into `input`      GET /view          a file from `output`
 *   GET  /system_stats    version, GPU, memory     GET /queue         running and pending
 *   GET  /models/<folder> model files on disk      POST /free         unload the models
 */

export class ComfyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ComfyError';
  }
}

export class ComfyClient {
  /** `base` is the server address, e.g. `http://100.105.208.82:8000`. */
  constructor(base, { fetch = globalThis.fetch, timeoutMs = 60_000 } = {}) {
    this.base = base.replace(/\/+$/, '');
    this.fetch = fetch;
    this.timeoutMs = timeoutMs;
  }

  async request(path, init = {}) {
    let response;
    try {
      response = await this.fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(this.timeoutMs), ...init });
    } catch (error) {
      throw new ComfyError(`ComfyUI at ${this.base} is not reachable (${error?.cause?.code ?? error?.name ?? error}): is the PC on, ComfyUI running and listening on the network?`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ComfyError(`${init.method ?? 'GET'} ${path}: ${response.status} ${describeError(text)}`);
    }
    return response;
  }

  async json(path, init) {
    return (await this.request(path, init)).json();
  }

  systemStats() {
    return this.json('/system_stats');
  }

  /** File names in a model folder (`diffusion_models`, `text_encoders`, `vae`). */
  models(folder) {
    return this.json(`/models/${encodeURIComponent(folder)}`);
  }

  queue() {
    return this.json('/queue');
  }

  /** Queues a graph; resolves to its `prompt_id`. */
  async submit(workflow, clientId) {
    const body = await this.json('/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
    if (!body.prompt_id) throw new ComfyError(`POST /prompt: no prompt_id (${JSON.stringify(body).slice(0, 300)})`);
    return body.prompt_id;
  }

  /** The job's history entry, or null while it is queued or running. */
  async history(promptId) {
    const body = await this.json(`/history/${encodeURIComponent(promptId)}`);
    return body[promptId] ?? null;
  }

  /** Puts a file into ComfyUI's `input/<subfolder>`; resolves to the name `LoadImage` takes. */
  async upload(name, bytes, subfolder) {
    const form = new FormData();
    form.append('image', new Blob([bytes]), name);
    form.append('subfolder', subfolder);
    form.append('type', 'input');
    form.append('overwrite', 'true');
    const body = await this.json('/upload/image', { method: 'POST', body: form });
    return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
  }

  /** Bytes of an output file. */
  async view({ filename, subfolder = '', type = 'output' }) {
    const query = new URLSearchParams({ filename, subfolder, type });
    return new Uint8Array(await (await this.request(`/view?${query}`)).arrayBuffer());
  }

  /** Unloads the models from video memory (instead of restarting ComfyUI between stills and clips). */
  async free() {
    await this.request('/free', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
  }
}

/** ComfyUI answers a bad graph with `{error, node_errors}`; a short line of it. */
export function describeError(text) {
  try {
    const body = JSON.parse(text);
    const parts = [body.error?.message ?? body.error ?? ''];
    for (const [id, node] of Object.entries(body.node_errors ?? {})) {
      for (const error of node.errors ?? []) parts.push(`node ${id} (${node.class_type}): ${error.message} ${error.details ?? ''}`.trim());
    }
    return parts.filter(Boolean).join('; ').slice(0, 600);
  } catch {
    return text.slice(0, 300);
  }
}

/** Files a finished job wrote (SaveImage and SaveVideo report them alike). */
export function outputFiles(entry) {
  const files = [];
  for (const output of Object.values(entry?.outputs ?? {})) {
    for (const value of Object.values(output)) {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (item && typeof item.filename === 'string' && (item.type ?? 'output') === 'output') files.push(item);
      }
    }
  }
  return files;
}

/** `pending`, `done` or `error` (with the message) for a history entry. */
export function entryState(entry) {
  if (!entry) return { state: 'pending' };
  const status = entry.status ?? {};
  if (status.status_str === 'error') {
    const failure = (status.messages ?? []).find(([type]) => type === 'execution_error')?.[1];
    const message = failure ? `${failure.node_type ?? ''}: ${failure.exception_message ?? ''}`.trim() : 'execution error';
    return { state: 'error', message };
  }
  if (status.completed === false && status.status_str !== 'success') return { state: 'pending' };
  return { state: 'done' };
}
