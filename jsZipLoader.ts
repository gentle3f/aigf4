const JSZIP_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

type JsZipApi = {
    new (): any;
    loadAsync: (input: Blob | ArrayBuffer | Uint8Array | File) => Promise<any>;
};

let jsZipLoad: Promise<JsZipApi> | null = null;

const getLoadedJsZip = () => (
    (globalThis as typeof globalThis & { JSZip?: JsZipApi }).JSZip || null
);

export const loadJsZip = async (): Promise<JsZipApi> => {
    const loaded = getLoadedJsZip();
    if (loaded) return loaded;
    if (jsZipLoad) return jsZipLoad;

    if (typeof document === 'undefined') {
        throw new Error('JSZip is unavailable outside the browser.');
    }

    jsZipLoad = new Promise<JsZipApi>((resolve, reject) => {
        const finish = () => {
            const api = getLoadedJsZip();
            if (api) {
                resolve(api);
                return;
            }
            jsZipLoad = null;
            reject(new Error('JSZip loaded without exposing its API.'));
        };

        const fail = () => {
            jsZipLoad = null;
            reject(new Error('Unable to load JSZip.'));
        };

        const existing = document.querySelector<HTMLScriptElement>('script[data-aigf-jszip="true"]');
        if (existing) {
            existing.addEventListener('load', finish, { once: true });
            existing.addEventListener('error', fail, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = JSZIP_CDN_URL;
        script.async = true;
        script.dataset.aigfJszip = 'true';
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', fail, { once: true });
        document.head.appendChild(script);
    });

    return jsZipLoad;
};
