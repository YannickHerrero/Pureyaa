/**
 * Thin client for the AnkiConnect protocol, as implemented by both desktop
 * AnkiConnect and the AnkiconnectAndroid app
 * (https://github.com/KamWithK/AnkiconnectAndroid).
 *
 * Every call is a JSON POST: { action, version: 6, params } → { result, error }.
 */

const ANKI_CONNECT_VERSION = 6;

export class AnkiConnectError extends Error {
  readonly kind: 'unreachable' | 'http' | 'protocol' | 'rpc';
  constructor(kind: AnkiConnectError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

interface RpcEnvelope<T> {
  result: T;
  error: string | null;
}

// Use XMLHttpRequest instead of fetch: AnkiconnectAndroid uses NanoHTTPD as
// its HTTP server, which mishandles bodies sent with chunked transfer
// encoding (which RN's fetch sometimes uses). XHR sends with explicit
// Content-Length, which NanoHTTPD reads correctly.
function invoke<T>(url: string, action: string, params?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      action,
      version: ANKI_CONNECT_VERSION,
      params: params ?? {},
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.responseType = 'text';
    xhr.onerror = () =>
      reject(
        new AnkiConnectError(
          'unreachable',
          `Could not reach AnkiConnect at ${url}. Is the AnkiconnectAndroid service running?`,
        ),
      );
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new AnkiConnectError('http', `AnkiConnect HTTP ${xhr.status}`));
        return;
      }
      let envelope: RpcEnvelope<T>;
      try {
        envelope = JSON.parse(xhr.responseText) as RpcEnvelope<T>;
      } catch {
        reject(new AnkiConnectError('protocol', 'AnkiConnect returned non-JSON'));
        return;
      }
      if (envelope.error) {
        reject(new AnkiConnectError('rpc', envelope.error));
        return;
      }
      resolve(envelope.result);
    };
    xhr.send(body);
  });
}

export interface AnkiClient {
  version(): Promise<number>;
  deckNames(): Promise<string[]>;
  createDeck(name: string): Promise<number>;
  modelNames(): Promise<string[]>;
  findModelByName(name: string): Promise<boolean>;
  createModel(spec: CreateModelSpec): Promise<unknown>;
  storeMediaFile(filename: string, base64: string): Promise<string>;
  addNote(note: AnkiNote): Promise<number>;
}

export interface CreateModelSpec {
  modelName: string;
  inOrderFields: string[];
  css?: string;
  isCloze?: boolean;
  cardTemplates: { Name: string; Front: string; Back: string }[];
}

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags?: string[];
}

export function makeAnkiClient(url: string): AnkiClient {
  return {
    version: () => invoke<number>(url, 'version'),
    deckNames: () => invoke<string[]>(url, 'deckNames'),
    createDeck: (name) => invoke<number>(url, 'createDeck', { deck: name }),
    modelNames: () => invoke<string[]>(url, 'modelNames'),
    async findModelByName(name) {
      const names = await invoke<string[]>(url, 'modelNames');
      return names.includes(name);
    },
    createModel: (spec) => invoke<unknown>(url, 'createModel', spec),
    storeMediaFile: (filename, base64) =>
      invoke<string>(url, 'storeMediaFile', { filename, data: base64 }),
    addNote: (note) =>
      invoke<number>(url, 'addNote', {
        note: { ...note, options: { allowDuplicate: true } },
      }),
  };
}
