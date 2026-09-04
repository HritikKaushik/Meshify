import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/api-client';
import { cn } from '@/lib/utils';

// Rendered thumbnails (data URLs) are cached per document id for the session so
// re-mounts (filtering, grid/list toggles) don't re-render the PDF.
const cache = new Map<string, string>();

/**
 * Rendering a thumbnail downloads the whole PDF, so a grid of N documents used
 * to start N full downloads and N pdf.js renders the moment it mounted. Cards
 * now wait until they scroll into view and then take turns through a small
 * queue, which keeps memory and the BFF's upload path bounded on big projects.
 */
const MAX_CONCURRENT_RENDERS = 3;
let inFlight = 0;
const waiting: Array<() => void> = [];
function acquireRenderSlot(): Promise<() => void> {
	return new Promise((resolve) => {
		const grant = () => {
			inFlight += 1;
			let released = false;
			resolve(() => {
				if (released) return;
				released = true;
				inFlight -= 1;
				waiting.shift()?.();
			});
		};
		if (inFlight < MAX_CONCURRENT_RENDERS) grant();
		else waiting.push(grant);
	});
}

/** True once the element has been on screen (IntersectionObserver), or immediately where the API is missing. */
function useVisible(ref: React.RefObject<HTMLElement | null>): boolean {
	const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
	useEffect(() => {
		if (visible) return;
		const el = ref.current;
		if (!el || typeof IntersectionObserver === 'undefined') {
			setVisible(true);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin: '200px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref, visible]);
	return visible;
}

// pdf.js is heavy (~400KB) — load it lazily, once, only when a PDF card mounts.
let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;
async function loadPdfjs() {
	if (!pdfjsReady) {
		pdfjsReady = (async () => {
			const pdfjs = await import('pdfjs-dist');
			const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
			pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
			return pdfjs;
		})();
	}
	return pdfjsReady;
}

/**
 * Renders the first page of a PDF document as a thumbnail image. While rendering
 * it shows a skeleton; if fetching/rendering fails (or the doc is still
 * processing) it renders the provided fallback instead of an error.
 */
export function PdfThumbnail({
	projectId,
	documentId,
	fallback,
	className,
}: {
	projectId: string;
	documentId: string;
	fallback: ReactNode;
	className?: string;
}) {
	const [src, setSrc] = useState<string | null>(() => cache.get(documentId) ?? null);
	const [failed, setFailed] = useState(false);
	const hostRef = useRef<HTMLDivElement | null>(null);
	const visible = useVisible(hostRef);

	useEffect(() => {
		if (src || failed || !visible) return;
		let cancelled = false;
		let release: (() => void) | undefined;
		void (async () => {
			try {
				release = await acquireRenderSlot();
				if (cancelled) return;
				const data = await api.getDocumentContent(projectId, documentId);
				const pdfjs = await loadPdfjs();
				const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
				const page = await pdf.getPage(1);
				const unscaled = page.getViewport({ scale: 1 });
				const scale = Math.min(2, 520 / unscaled.width);
				const viewport = page.getViewport({ scale });
				const canvas = document.createElement('canvas');
				canvas.width = Math.ceil(viewport.width);
				canvas.height = Math.ceil(viewport.height);
				const ctx = canvas.getContext('2d');
				if (!ctx) throw new Error('canvas 2d context unavailable');
				await page.render({ canvasContext: ctx, viewport }).promise;
				const url = canvas.toDataURL('image/jpeg', 0.82);
				void pdf.cleanup();
				if (!cancelled) {
					cache.set(documentId, url);
					setSrc(url);
				}
			} catch (err) {
				// Non-fatal: fall back to the placeholder, but surface why in dev.
				if (!cancelled) {
					console.warn('[PdfThumbnail] could not render', documentId, err);
					setFailed(true);
				}
			} finally {
				release?.();
			}
		})();
		return () => {
			cancelled = true;
			release?.();
		};
	}, [projectId, documentId, src, failed, visible]);

	if (failed) return <>{fallback}</>;
	if (!src) return <div ref={hostRef} className={cn('mc-skeleton h-full w-full', className)} />;
	return <img src={src} alt="" loading="lazy" className={cn('h-full w-full bg-white object-cover object-top', className)} />;
}
