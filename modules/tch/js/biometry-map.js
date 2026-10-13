function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function hasCoordinate(point) {
  return point?.latitude !== null && point?.latitude !== undefined && point.latitude !== ""
    && point?.longitude !== null && point.longitude !== undefined && point.longitude !== ""
    && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
    && Math.abs(Number(point.latitude)) <= 90 && Math.abs(Number(point.longitude)) <= 180;
}

const POINT_COLORS = Object.freeze({ inside: "#16834b", outside: "#bc3030", review: "#aa7200", "no-gps": "#637284" });

/** Adds per-record GPS points to an existing shared Leaflet map without owning its base layers. */
export function createBiometryPointLayer({ leaflet, map, points = [], activeSampleId = "", onFocus = null } = {}) {
  if (!leaflet?.circleMarker || !map?.fitBounds) throw new TypeError("Se requiere Leaflet y un mapa activo");
  const layers = [];
  const coordinates = [];
  (Array.isArray(points) ? points : []).filter(hasCoordinate).forEach((point) => {
    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);
    const active = point.id === activeSampleId;
    const pointStatus = point.spatialStatus || "review";
    const pointLabel = point.spatialLabel || "Revisar";
    const marker = leaflet.circleMarker([latitude, longitude], {
      pane: "casurGeoAnchorPane", radius: active ? 10 : 7, weight: 3,
      color: active ? "#1c2740" : "#fff", fillColor: POINT_COLORS[pointStatus] || POINT_COLORS.review, fillOpacity: 1,
    });
    marker.bindTooltip?.(`${escapeHtml(point.pointCode || "Punto")} · ${escapeHtml(pointLabel)}`, {
      permanent: true, direction: "auto",
      className: `casur-geo-point-label casur-geo-point-label--${pointStatus}${active ? " casur-geo-point-label--active" : ""}`,
    });
    marker.bindPopup?.(`<strong>${escapeHtml(point.pointCode || "Punto")} · ${escapeHtml(pointLabel)}</strong><br>${latitude.toFixed(6)}, ${longitude.toFixed(6)}<br>Precisión ${Number.isFinite(Number(point.gpsAccuracyM)) ? `±${Number(point.gpsAccuracyM).toFixed(0)} m` : "no registrada"}<br>Capturado: ${escapeHtml(point.capturedAt || "sin hora registrada")}${point.notes ? `<br>${escapeHtml(point.notes)}` : ""}<br><button type="button" class="btn btn-blue" data-focus-biometry-point="${escapeHtml(point.id)}">Abrir punto</button>`);
    marker.on?.("popupopen", (event) => {
      event.popup.getElement()?.querySelector("[data-focus-biometry-point]")?.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        onFocus?.(point);
      });
    });
    marker.addTo(map);
    layers.push(marker);
    coordinates.push([latitude, longitude]);
  });

  let destroyed = false;
  return Object.freeze({
    count: layers.length,
    fit(options = { padding: [28, 28], maxZoom: 19 }, extraCoordinates = []) {
      if (destroyed || !coordinates.length || typeof leaflet.latLngBounds !== "function") return false;
      const bounds = leaflet.latLngBounds([...coordinates, ...extraCoordinates]);
      if (!bounds?.isValid?.()) return false;
      map.invalidateSize?.({ animate: false });
      map.fitBounds(bounds, options);
      return true;
    },
    destroy() {
      if (destroyed) return;
      layers.forEach((layer) => layer.remove?.());
      destroyed = true;
    },
  });
}
