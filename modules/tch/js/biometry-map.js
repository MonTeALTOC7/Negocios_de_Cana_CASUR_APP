function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function hasCoordinate(point) {
  return point?.latitude !== null && point?.latitude !== undefined && point.latitude !== ""
    && point?.longitude !== null && point.longitude !== undefined && point.longitude !== ""
    && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
}

/** Adds per-record GPS points to an existing shared Leaflet map without owning its base layers. */
export function createBiometryPointLayer({ leaflet, map, points = [], activeSampleId = "", onFocus = null } = {}) {
  if (!leaflet?.circleMarker || !map?.fitBounds) throw new TypeError("Se requiere Leaflet y un mapa activo");
  const layers = [];
  const coordinates = [];
  (Array.isArray(points) ? points : []).filter(hasCoordinate).forEach((point) => {
    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);
    const active = point.id === activeSampleId;
    const marker = leaflet.circleMarker([latitude, longitude], {
      pane: "casurGeoAnchorPane", radius: active ? 10 : 7, weight: 3,
      color: "#fff", fillColor: active ? "#e53935" : "#087ea4", fillOpacity: 1,
    });
    marker.bindTooltip?.(String(point.pointCode || "Punto"), {
      permanent: true, direction: "top",
      className: active ? "casur-geo-point-label casur-geo-point-label--active" : "casur-geo-point-label",
    });
    marker.bindPopup?.(`<strong>${escapeHtml(point.pointCode || "Punto")}</strong><br>${latitude.toFixed(6)}, ${longitude.toFixed(6)}<br>Precisión ±${Number(point.gpsAccuracyM || 0).toFixed(0)} m${point.notes ? `<br>${escapeHtml(point.notes)}` : ""}<br><button type="button" class="btn btn-blue" data-focus-biometry-point="${escapeHtml(point.id)}">Abrir punto</button>`);
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
    fit(options = { padding: [28, 28], maxZoom: 19 }) {
      if (destroyed || !coordinates.length || typeof leaflet.latLngBounds !== "function") return false;
      const bounds = leaflet.latLngBounds(coordinates);
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
