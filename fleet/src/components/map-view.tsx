// A map: MapLibre GL on OpenStreetMap tiles (no API key), with markers (a colour, an icon and a short
// label each), optional areas (site boundaries) with labels, a popup for the selected marker, and
// fit-to-bounds. Generic: props in, events out. Markers that overlap on screen are clustered.
//
// Markers, cluster bubbles, area labels and the popup are DOM elements MapLibre positions; React
// renders into them through portals, so they use the app's components, fonts and theme.

import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map-view.css';
import { MapPinned, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@react-frontends/shared/utils';
import { areaLabelPoint, areaPoints, boundsOf, clusterPoints, type AreaGeometry, type LngLat } from './map-geo';

export type { AreaGeometry, LngLat } from './map-geo';

export interface MapMarker {
  id: string;
  /** [longitude, latitude]. */
  position: LngLat;
  /** The pin's colour (any CSS colour; a status colour). */
  color?: string;
  /** An icon in the pin (a lucide icon). */
  icon?: ComponentType<{ className?: string; style?: CSSProperties; strokeWidth?: number }>;
  /** A short label beside the pin (an ID). */
  label?: string;
  /** The accessible name (and tooltip): what the marker is. */
  title?: string;
}

export interface MapArea {
  id: string;
  geometry: AreaGeometry;
  label?: string;
  /** Outline and fill colour (default the primary colour). */
  color?: string;
}

export interface MapViewHandle {
  /** Fits the view to the markers (and areas, with fit="all"). */
  fit: (animate?: boolean) => void;
  /** Centres a marker. */
  focus: (id: string) => void;
}

export interface MapViewProps {
  markers?: MapMarker[];
  areas?: MapArea[];
  selectedId?: string | null;
  /** A marker to bring forward and label (e.g. the list row under the pointer). */
  highlightedId?: string | null;
  /** A marker was chosen (or null: the map background was clicked, or Escape pressed). */
  onSelect?: (id: string | null) => void;
  /** The pointer entered (id) or left (null) a marker. */
  onHighlight?: (id: string | null) => void;
  /** Content of the popup over the selected marker (none when absent). */
  renderPopup?: (marker: MapMarker) => ReactNode;
  /** When marker labels show: always, or on hover/selection (default). */
  labels?: 'always' | 'hover' | 'never';
  /** What the view fits to: markers (default), markers and areas, or nothing (center/zoom). */
  fit?: 'markers' | 'all' | 'none';
  /** The view re-fits when this changes (e.g. the filters); it fits once when absent. */
  fitKey?: string | number;
  /** The closest a fit zooms in (default 15). */
  fitMaxZoom?: number;
  /** The view before anything is fitted (default: Sydney). */
  center?: LngLat;
  zoom?: number;
  /** Groups overlapping markers into numbered bubbles (default true). */
  cluster?: boolean;
  /** Area labels show from this zoom (default 11.5). */
  areaLabelZoom?: number;
  /** Pans to the selected marker when the selection changes (default true). */
  followSelection?: boolean;
  /** For maps inside a scrolling page: Ctrl/⌘ + scroll zooms, two fingers pan. */
  cooperative?: boolean;
  /** Zoom buttons (default true). */
  controls?: boolean;
  className?: string;
  'aria-label'?: string;
  /** Overlays (legends, buttons), positioned by the caller over the map. */
  children?: ReactNode;
  ref?: Ref<MapViewHandle>;
}

const SYDNEY: LngLat = [151.05, -33.86];
const CLUSTER_RADIUS = 34;

const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** The look of the raster tiles and the background behind them, light and dark. */
const THEMES = {
  light: {
    background: '#eceef2',
    raster: { 'raster-saturation': -0.35, 'raster-contrast': -0.04, 'raster-brightness-min': 0.04, 'raster-brightness-max': 1, 'raster-hue-rotate': 0 },
  },
  // Inverted (brightness min > max), the hue turned back round, toned down: a dark map from the
  // same tiles.
  dark: {
    background: '#1a1c23',
    raster: { 'raster-saturation': -0.7, 'raster-contrast': -0.12, 'raster-brightness-min': 0.78, 'raster-brightness-max': 0.1, 'raster-hue-rotate': 180 },
  },
} as const;

function styleFor(dark: boolean): StyleSpecification {
  const theme = dark ? THEMES.dark : THEMES.light;
  return {
    version: 8,
    sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: TILE_ATTRIBUTION } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': theme.background } },
      { id: 'osm', type: 'raster', source: 'osm', paint: { ...theme.raster, 'raster-fade-duration': 150 } },
    ],
  };
}

/** Whether the page is in dark mode (the .dark class on <html>). */
function useDarkClass(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A DOM element per key, made once (MapLibre positions it; React renders into it). */
function useElements(className: string, passive = false) {
  const elements = useRef(new Map<string, HTMLDivElement>());
  return useMemo(() => {
    const get = (key: string) => {
      let element = elements.current.get(key);
      if (!element) {
        element = document.createElement('div');
        element.className = className;
        if (passive) {
          // Labels: under the pins, and clicks go through to the map.
          element.style.pointerEvents = 'none';
          element.style.zIndex = '0';
        }
        elements.current.set(key, element);
      }
      return element;
    };
    return { get, elements };
  }, [className, passive]);
}

/** Keeps MapLibre markers (by key) in step with a list of positioned elements. */
function useDomMarkers(map: MapLibreMap | null, items: { key: string; position: LngLat; element: HTMLElement }[], anchor: 'center' | 'bottom' = 'center') {
  const live = useRef(new Map<string, maplibregl.Marker>());
  useEffect(() => {
    if (!map) return;
    const markers = live.current;
    const keys = new Set(items.map((i) => i.key));
    for (const [key, marker] of markers) {
      if (!keys.has(key)) {
        marker.remove();
        markers.delete(key);
      }
    }
    for (const item of items) {
      const marker = markers.get(item.key);
      if (marker) marker.setLngLat(item.position);
      else {
        markers.set(item.key, new maplibregl.Marker({ element: item.element, anchor }).setLngLat(item.position).addTo(map));
        // MapLibre makes the element a button; the content is the control (or a label).
        item.element.removeAttribute('role');
        item.element.removeAttribute('aria-label');
      }
    }
  }, [map, items, anchor]);
  useEffect(() => {
    const markers = live.current;
    return () => {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
    };
  }, [map]);
}

export function MapView({
  markers = [],
  areas = [],
  selectedId = null,
  highlightedId = null,
  onSelect,
  onHighlight,
  renderPopup,
  labels = 'hover',
  fit = 'markers',
  fitKey,
  fitMaxZoom = 15,
  center = SYDNEY,
  zoom = 9.5,
  cluster = true,
  areaLabelZoom = 11.5,
  followSelection = true,
  cooperative = false,
  controls = true,
  className,
  'aria-label': ariaLabel = 'Map',
  children,
  ref,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(zoom);
  const [clusters, setClusters] = useState<string[][]>([]);
  const dark = useDarkClass();
  const darkRef = useRef(dark);
  darkRef.current = dark;

  // Callbacks change every render; the map's listeners read the latest.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // ------------------------------------------------------------------ the map itself
  useEffect(() => {
    if (!container.current) return;
    let instance: MapLibreMap;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        style: styleFor(darkRef.current),
        center,
        zoom,
        attributionControl: { compact: true },
        cooperativeGestures: cooperative,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxZoom: 19,
        locale: { 'Map.Title': ariaLabel },
      });
    } catch {
      setFailed(true);
      return;
    }
    instance.touchZoomRotate.disableRotation();
    instance.keyboard.disableRotation();
    if (controls) instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    let tileErrors = 0;
    instance.on('error', (event) => {
      if ((event as { sourceId?: string }).sourceId === 'osm' && ++tileErrors >= 3) setTilesFailed(true);
    });
    instance.on('load', () => {
      instance.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      instance.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 } });
      instance.addLayer({ id: 'areas-line', type: 'line', source: 'areas', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.85 } });
      setLoaded(true);
    });
    instance.on('zoomend', () => setZoomLevel(instance.getZoom()));
    instance.on('click', (event) => {
      const target = event.originalEvent?.target as Element | null;
      if (target?.closest?.('.maplibregl-marker, .maplibregl-popup')) return;
      onSelectRef.current?.(null);
    });
    setMap(instance);
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      setMap(null);
      setLoaded(false);
    };
    // The map is made once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------ theme
  useEffect(() => {
    if (!map || !loaded) return;
    const theme = dark ? THEMES.dark : THEMES.light;
    map.setPaintProperty('background', 'background-color', theme.background);
    for (const [property, value] of Object.entries(theme.raster)) map.setPaintProperty('osm', property, value);
  }, [map, loaded, dark]);

  // ------------------------------------------------------------------ areas
  const areaColor = (area: MapArea) => area.color ?? (dark ? '#8b7cf6' : '#5b47e0');
  useEffect(() => {
    if (!map || !loaded) return;
    const source = map.getSource('areas') as maplibregl.GeoJSONSource | undefined;
    const data = {
      type: 'FeatureCollection',
      features: areas.map((area) => ({ type: 'Feature', id: area.id, geometry: area.geometry, properties: { color: areaColor(area) } })),
    };
    source?.setData(data as Parameters<maplibregl.GeoJSONSource['setData']>[0]);
    // areaColor follows `dark`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, areas, dark]);

  // ------------------------------------------------------------------ fitting
  const fitPoints = useCallback((): LngLat[] => {
    const points = markers.map((m) => m.position);
    if (fit === 'all' || !points.length) for (const area of areas) points.push(...areaPoints(area.geometry));
    return points;
  }, [markers, areas, fit]);

  const fitTo = useCallback(
    (animate: boolean) => {
      if (!map) return;
      const bounds = boundsOf(fitPoints());
      if (!bounds) return;
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      // Room for the pins (and their labels) inside the edges, more on bigger maps.
      const pad = Math.min(72, Math.round(Math.min(w, h) / 7) + 24);
      map.fitBounds(bounds, { padding: pad, maxZoom: fitMaxZoom, duration: animate && !reducedMotion() ? 600 : 0 });
    },
    [map, fitPoints, fitMaxZoom],
  );

  // Fits once the map is ready, again when fitKey changes, and again when markers arrive after a fit
  // to the areas alone (they load separately).
  const fitted = useRef<{ key: string | number; withMarkers: boolean } | null>(null);
  useEffect(() => {
    if (!map || !loaded || fit === 'none') return;
    if (!fitPoints().length) return;
    const key = fitKey ?? '';
    const withMarkers = markers.length > 0;
    const last = fitted.current;
    if (last && last.key === key && (last.withMarkers || !withMarkers)) return;
    fitTo(!!last);
    fitted.current = { key, withMarkers };
  }, [map, loaded, fit, fitKey, fitPoints, fitTo, markers.length]);

  useImperativeHandle(
    ref,
    () => ({
      fit: (animate = true) => fitTo(animate),
      focus: (id: string) => {
        const marker = markers.find((m) => m.id === id);
        if (map && marker) map.easeTo({ center: marker.position, zoom: Math.max(map.getZoom(), 13), duration: reducedMotion() ? 0 : 600 });
      },
    }),
    [fitTo, map, markers],
  );

  // ------------------------------------------------------------------ clustering
  const recluster = useCallback(() => {
    if (!map || !cluster) {
      setClusters((c) => (c.length ? [] : c));
      return;
    }
    const points = markers
      .filter((m) => m.id !== selectedId && m.id !== highlightedId)
      .map((m) => {
        const p = map.project(m.position);
        return { id: m.id, x: p.x, y: p.y };
      });
    const next = map.getZoom() >= 17 ? [] : clusterPoints(points, CLUSTER_RADIUS);
    setClusters((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [map, cluster, markers, selectedId, highlightedId]);

  useEffect(() => {
    if (!map) return;
    recluster();
    map.on('moveend', recluster);
    return () => {
      map.off('moveend', recluster);
    };
  }, [map, loaded, recluster]);

  const clustered = useMemo(() => new Set(clusters.flat()), [clusters]);
  const byId = useMemo(() => new Map(markers.map((m) => [m.id, m])), [markers]);

  // ------------------------------------------------------------------ DOM markers
  const pins = useElements('fleet-map-pin');
  const bubbles = useElements('fleet-map-cluster');
  const areaLabels = useElements('fleet-map-area-label', true);

  const pinItems = useMemo(() => markers.map((m) => ({ key: m.id, position: m.position, element: pins.get(m.id) })), [markers, pins]);
  const clusterItems = useMemo(
    () =>
      clusters.map((ids) => {
        const members = ids.map((id) => byId.get(id)!).filter(Boolean);
        const position: LngLat = [members.reduce((s, m) => s + m.position[0], 0) / members.length, members.reduce((s, m) => s + m.position[1], 0) / members.length];
        const key = ids.slice().sort().join('|');
        return { key, ids, members, position, element: bubbles.get(key) };
      }),
    [clusters, byId, bubbles],
  );
  const areaItems = useMemo(
    () => areas.filter((a) => a.label).map((a) => ({ key: a.id, area: a, position: areaLabelPoint(a.geometry), element: areaLabels.get(a.id) })),
    [areas, areaLabels],
  );

  useDomMarkers(map, pinItems);
  useDomMarkers(map, clusterItems);
  useDomMarkers(map, areaItems, 'bottom');

  // Forget elements of markers that are gone.
  useEffect(() => {
    const keep = new Set(markers.map((m) => m.id));
    for (const key of pins.elements.current.keys()) if (!keep.has(key)) pins.elements.current.delete(key);
    const keepClusters = new Set(clusterItems.map((c) => c.key));
    for (const key of bubbles.elements.current.keys()) if (!keepClusters.has(key)) bubbles.elements.current.delete(key);
  }, [markers, clusterItems, pins, bubbles]);

  // Clustered pins hide; the selected and highlighted ones come forward.
  useEffect(() => {
    for (const m of markers) {
      const element = pins.get(m.id);
      element.style.display = clustered.has(m.id) ? 'none' : '';
      element.style.zIndex = m.id === selectedId ? '3' : m.id === highlightedId ? '2' : '';
    }
  }, [markers, clustered, selectedId, highlightedId, pins]);

  const zoomToCluster = (members: MapMarker[]) => {
    if (!map) return;
    const bounds = boundsOf(members.map((m) => m.position));
    if (!bounds) return;
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    map.fitBounds(bounds, { padding: Math.min(120, Math.round(Math.min(w, h) / 4)), maxZoom: 18, duration: reducedMotion() ? 0 : 600 });
  };

  // ------------------------------------------------------------------ selection and popup
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const popupElement = useMemo(() => document.createElement('div'), []);
  const selectedLng = selected?.position[0];
  const selectedLat = selected?.position[1];
  const showPopup = !!(selected && renderPopup);
  useEffect(() => {
    if (!map || !showPopup || selectedLng === undefined || selectedLat === undefined) return;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, closeOnMove: false, focusAfterOpen: false, offset: 26, maxWidth: 'none', className: 'fleet-map-popup' })
      .setLngLat([selectedLng, selectedLat])
      .setDOMContent(popupElement)
      .addTo(map);
    return () => {
      popup.remove();
    };
  }, [map, showPopup, selectedLng, selectedLat, popupElement]);

  useEffect(() => {
    if (!map || !followSelection || selectedLng === undefined || selectedLat === undefined) return;
    const point = map.project([selectedLng, selectedLat]);
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const margin = Math.min(140, Math.min(w, h) / 3);
    const visible = point.x > margin && point.x < w - margin && point.y > margin && point.y < h - margin / 2;
    if (!visible) map.easeTo({ center: [selectedLng, selectedLat], offset: [0, Math.min(90, h / 6)], duration: reducedMotion() ? 0 : 500 });
    // Only when the selection moves, not when the map does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId, followSelection]);

  // ------------------------------------------------------------------ render
  if (failed) {
    return (
      <div className={cn('relative flex flex-col items-center justify-center gap-2 overflow-hidden bg-muted p-6 text-center text-sm text-muted-foreground', className)}>
        <MapPinned className="size-6" />
        <div className="font-medium text-foreground">The map can't be shown</div>
        <p className="max-w-xs">This browser has WebGL turned off or unavailable.</p>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn('fleet-map relative isolate overflow-hidden bg-muted', className)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && selectedId) onSelect?.(null);
      }}
    >
      {/* Inline: MapLibre's stylesheet makes its container position: relative. */}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-muted" aria-hidden>
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_30%,color-mix(in_oklab,var(--card)_55%,transparent)_50%,transparent_70%)]" />
          <MapPinned className="size-6 text-muted-foreground/60" />
        </div>
      )}
      {loaded && tilesFailed && (
        <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1 text-xs text-muted-foreground shadow-sm">
          <TriangleAlert className="size-3.5 text-warning" />
          Map tiles aren't loading. Positions are still shown.
        </div>
      )}
      {children}

      {markers.map((m) =>
        createPortal(
          <Pin
            marker={m}
            selected={m.id === selectedId}
            highlighted={m.id === highlightedId}
            labels={labels}
            onSelect={() => onSelect?.(m.id === selectedId ? null : m.id)}
            onHighlight={onHighlight}
          />,
          pins.get(m.id),
          m.id,
        ),
      )}
      {clusterItems.map((c) => createPortal(<ClusterBubble members={c.members} onClick={() => zoomToCluster(c.members)} />, c.element, c.key))}
      {areaItems.map((a) => createPortal(<AreaLabel label={a.area.label!} hidden={zoomLevel < areaLabelZoom} />, a.element, a.key))}
      {selected && renderPopup && createPortal(renderPopup(selected), popupElement)}
    </div>
  );
}

function Pin({ marker, selected, highlighted, labels, onSelect, onHighlight }: { marker: MapMarker; selected: boolean; highlighted: boolean; labels: MapViewProps['labels']; onSelect: () => void; onHighlight?: (id: string | null) => void }) {
  const Icon = marker.icon;
  const color = marker.color ?? 'var(--primary)';
  const showLabel = marker.label && (labels === 'always' || ((labels === 'hover' || labels === undefined) && (selected || highlighted)));
  return (
    <button
      type="button"
      title={marker.title}
      aria-label={marker.title ?? marker.label ?? 'Marker'}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerEnter={() => onHighlight?.(marker.id)}
      onPointerLeave={() => onHighlight?.(null)}
      onFocus={() => onHighlight?.(marker.id)}
      onBlur={() => onHighlight?.(null)}
      className="group relative flex cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full border-2 border-white text-white shadow-[0_1px_4px_rgb(0_0_0/0.35)] transition-transform duration-150 dark:border-[oklch(0.22_0.015_270)]',
          selected ? 'size-9 scale-110' : 'size-7 group-hover:scale-110',
          highlighted && !selected && 'scale-115',
        )}
        style={{ background: color, boxShadow: selected || highlighted ? `0 0 0 4px color-mix(in oklab, ${color} 30%, transparent), 0 2px 6px rgb(0 0 0 / 0.3)` : undefined }}
      >
        {Icon ? <Icon className={selected ? 'size-[18px]' : 'size-3.5'} strokeWidth={2.2} /> : <span className="size-2 rounded-full bg-white" />}
      </span>
      {showLabel && (
        <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-md bg-card px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-foreground shadow-sm ring-1 ring-border">
          {marker.label}
        </span>
      )}
    </button>
  );
}

function ClusterBubble({ members, onClick }: { members: MapMarker[]; onClick: () => void }) {
  // A ring in the members' colours, in proportion.
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.color ?? 'var(--primary)', (counts.get(m.color ?? 'var(--primary)') ?? 0) + 1);
  let at = 0;
  const stops: string[] = [];
  for (const [color, count] of counts) {
    const next = at + (count / members.length) * 360;
    stops.push(`${color} ${at}deg ${next}deg`);
    at = next;
  }
  const size = members.length >= 10 ? 42 : 36;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`${members.length} markers here: zoom in`}
      title={members.map((m) => m.label ?? m.title).filter(Boolean).join(', ')}
      className="flex cursor-pointer items-center justify-center rounded-full p-[3px] shadow-[0_1px_5px_rgb(0_0_0/0.3)] transition-transform outline-none hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50"
      style={{ width: size, height: size, background: `conic-gradient(${stops.join(', ')})` }}
    >
      <span className="flex size-full items-center justify-center rounded-full bg-card text-[13px] font-semibold text-foreground tabular">{members.length}</span>
    </button>
  );
}

function AreaLabel({ label, hidden }: { label: string; hidden: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none mb-1 block rounded-md bg-card/90 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground shadow-xs ring-1 ring-border backdrop-blur-sm transition-opacity',
        hidden && 'opacity-0',
      )}
    >
      {label}
    </span>
  );
}
