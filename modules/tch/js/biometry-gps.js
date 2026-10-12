/** Captures one device position without mutating the target on failure. */
export function captureSampleGps(target, { geolocation = globalThis.navigator?.geolocation, now = () => new Date() } = {}) {
  if (!target || typeof target !== "object") return Promise.reject(new TypeError("Se requiere un punto biométrico"));
  if (!geolocation?.getCurrentPosition) return Promise.reject(Object.assign(new Error("GPS no disponible"), { code: 0 }));
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition((position) => {
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);
      const gpsAccuracyM = Number(position?.coords?.accuracy);
      if (![latitude, longitude, gpsAccuracyM].every(Number.isFinite)) {
        reject(Object.assign(new Error("Lectura GPS inválida"), { code: 2 }));
        return;
      }
      Object.assign(target, { latitude, longitude, gpsAccuracyM, capturedAt: now().toISOString() });
      resolve(target);
    }, (error) => reject(error || Object.assign(new Error("No se pudo capturar GPS"), { code: 2 })), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}
