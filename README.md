# GeoDrops (offline SPA)

Minimal offline-first GeoGuessr training app (Drops-like, no audio).
Local-only: IndexedDB. Import/Export: single JSON file (with embedded images).

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

### Notes
- Works offline after first load (service worker).
- Data is stored locally in the browser (IndexedDB).
- Export/Import is inside each Quiz screen.
