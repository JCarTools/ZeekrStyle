// ── Погода (Open-Meteo + GPS, как в Tomsk 505) ─────────────
const WeatherManager = (() => {
  const FALLBACK = { city: 'Томск', latitude: 56.4846, longitude: 84.9482, source: '' };
  const STORAGE_LOCATION = 'lite.weather.location';
  const STORAGE_WEATHER = 'lite.weather.data';
  const STORAGE_MANUAL_CITY = 'lite.weather.manual_city';
  const REFRESH_MS = 10 * 60 * 1000;
  const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  let location = FALLBACK;
  let weather = null;
  let refreshTimer = null;

  function parse(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (e) { return null; }
    }
    return null;
  }

  function normalizeLocation(raw) {
    const data = parse(raw) || raw || {};
    const lat = Number(data.latitude ?? data.lat ?? data.coords?.latitude);
    const lon = Number(data.longitude ?? data.lon ?? data.lng ?? data.coords?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      city: data.city || data.name || data.locality || data.address?.city || 'GPS',
      latitude: lat,
      longitude: lon,
      accuracy: Number(data.accuracy ?? data.coords?.accuracy ?? 0) || 0,
      source: data.source || 'gps',
      updatedAt: new Date().toISOString(),
    };
  }

  async function browserLocation() {
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(normalizeLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          city: 'GPS',
          source: 'browser',
        })),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 4500, maximumAge: 10 * 60 * 1000 }
      );
    });
  }

  function getManualCity() {
    return loadLS(STORAGE_MANUAL_CITY);
  }

  function setManualCity(cityObj) {
    if (cityObj) saveLS(STORAGE_MANUAL_CITY, cityObj);
    else try { localStorage.removeItem(STORAGE_MANUAL_CITY); } catch (e) {}
  }

  async function geocodeCity(cityName) {
    const url =
      'https://geocoding-api.open-meteo.com/v1/search' +
      '?count=1&language=ru&format=json&name=' +
      encodeURIComponent(cityName);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('geocode HTTP ' + response.status);
    const data = await response.json();
    const results = data?.results;
    if (!results?.length) throw new Error('city not found');
    const r = results[0];
    return {
      city: r.name || cityName,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      source: 'manual',
    };
  }

  function getAndroidLocation() {
    const api = window.androidApi;
    if (!api) return null;
    ensureJsReady();
    const methods = ['getLocation', 'getCurrentLocation', 'location'];
    for (const method of methods) {
      if (typeof api[method] !== 'function') continue;
      try {
        const raw = api[method](TOKEN);
        const loc = normalizeLocation(parseApiJson(raw) ?? raw);
        if (loc) return loc;
      } catch (e) {}
    }
    return null;
  }

  async function getLocation() {
    const manual = getManualCity();
    if (manual && Number.isFinite(manual.latitude) && Number.isFinite(manual.longitude)) {
      return manual;
    }

    const android = getAndroidLocation();
    if (android) return android;

    const browser = await browserLocation();
    if (browser) return browser;

    return loadLS(STORAGE_LOCATION, FALLBACK) || FALLBACK;
  }

  async function fetchWeather(loc) {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${encodeURIComponent(loc.latitude)}` +
      `&longitude=${encodeURIComponent(loc.longitude)}` +
      '&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum' +
      '&timezone=auto&forecast_days=5';

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('weather fetch failed ' + response.status);

    const data = await response.json();
    const current = data.current || {};
    const daily = data.daily || {};
    const forecast = [];
    const times = daily.time || [];
    for (let i = 0; i < times.length; i++) {
      forecast.push({
        date: times[i],
        max: daily.temperature_2m_max?.[i],
        min: daily.temperature_2m_min?.[i],
        code: daily.weather_code?.[i],
        precip: daily.precipitation_sum?.[i],
      });
    }

    return {
      city: loc.city || 'GPS',
      latitude: loc.latitude,
      longitude: loc.longitude,
      source: loc.source,
      temperature: current.temperature_2m,
      apparent: current.apparent_temperature,
      precipitation: current.precipitation,
      wind: current.wind_speed_10m,
      code: current.weather_code,
      time: current.time,
      forecast,
      updatedAt: new Date().toISOString(),
    };
  }

  function label(code) {
    const c = Number(code);
    if (c === 0) return 'Ясно';
    if ([1, 2, 3].includes(c)) return 'Облачно';
    if ([45, 48].includes(c)) return 'Туман';
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(c)) return 'Дождь';
    if ([71, 73, 75, 77, 85, 86].includes(c)) return 'Снег';
    if ([95, 96, 99].includes(c)) return 'Гроза';
    return 'Погода';
  }

  function weatherIconName(code) {
    const text = String(code ?? '').toLowerCase();
    if (/snow|снег|85|86|71|73|75|77/.test(text)) return 'snow';
    if (/rain|drizzle|дожд|51|53|55|61|63|65|80|81|82/.test(text)) return 'rain';
    if (/storm|thunder|гроза|95|96|99/.test(text)) return 'thunderstorms-rain';
    if (/fog|mist|туман|45|48/.test(text)) return 'fog';
    if (/cloud|облач|1|2|3/.test(text)) return 'cloudy';
    const c = Number(code);
    if (c === 0) return 'clear-day';
    if (c === 1 || c === 2) return 'partly-cloudy-day';
    if (c === 3) return 'cloudy';
    return 'not-available';
  }

  function weatherIconHtml(code) {
    const name = weatherIconName(code);
    const url = `https://cdn.jsdelivr.net/gh/basmilius/weather-icons@dev/production/fill/svg/${name}.svg`;
    return `<img src="${url}" alt="" class="weather-icon-svg" loading="lazy">`;
  }

  function formatDayName(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    return DAY_NAMES[d.getDay()] || '—';
  }

  function forecastValues() {
    return (weather?.forecast || []).slice(1, 3).map((day) => {
      const max = Number(day.max);
      const min = Number(day.min);
      const condition = label(day.code);
      return {
        name: formatDayName(day.date),
        icon: weatherIconHtml(day.code),
        max: Number.isFinite(max) ? `${Math.round(max)}°` : '--°',
        min: Number.isFinite(min) ? `${Math.round(min)}°` : '--°',
        label: condition,
        aria: `${formatDayName(day.date)}, ${condition}, максимум ${Number.isFinite(max) ? Math.round(max) : '--'}, минимум ${Number.isFinite(min) ? Math.round(min) : '--'}`,
      };
    });
  }

  function currentValues() {
    const tempNumber = Number(weather?.temperature);
    const temp = Number.isFinite(tempNumber) ? `${Math.round(tempNumber)}°` : '--°';
    const city = weather?.city || FALLBACK.city;
    const condition = label(weather?.code);
    return {
      temp,
      city,
      label: condition,
      icon: weatherIconHtml(weather?.code),
      aria: Number.isFinite(tempNumber)
        ? `Погода: ${condition}, ${Math.round(tempNumber)} градусов, ${city}`
        : 'Погода: нет данных',
    };
  }

  function renderWidget() {
    const values = currentValues();
    const forecast = forecastValues();
    const widget = el('weather-widget');
    const iconEl = el('weather-icon');
    const forecastEl = el('weather-forecast');
    const forecastAria = forecast.map((day) => day.aria).join('; ');
    if (widget) {
      widget.setAttribute('aria-label', forecastAria
        ? `${values.aria}; прогноз: ${forecastAria}`
        : values.aria);
    }
    if (iconEl) iconEl.innerHTML = values.icon;
    set('weather-temp', values.temp);
    set('weather-desc', values.label);
    if (forecastEl) {
      forecastEl.innerHTML = forecast.map((day) => `
        <div class="weather-day" aria-label="${day.aria}">
          <div class="weather-day-name">${day.name}</div>
          <div class="weather-day-icon" aria-hidden="true">${day.icon}</div>
          <div class="weather-day-temps">
            <span class="weather-day-max">${day.max}</span>
            <span class="weather-day-min">${day.min}</span>
          </div>
        </div>
      `).join('');
    }
  }

  async function refresh() {
    try {
      location = await getLocation();
      saveLS(STORAGE_LOCATION, location);
      weather = await fetchWeather(location);
      saveLS(STORAGE_WEATHER, weather);
      renderWidget();
      return weather;
    } catch (e) {
      weather = loadLS(STORAGE_WEATHER, null);
      if (!weather) {
        location = FALLBACK;
        try {
          weather = await fetchWeather(FALLBACK);
          saveLS(STORAGE_WEATHER, weather);
        } catch (_) {}
      }
      renderWidget();
      return weather;
    }
  }

  function applyAndroidWeather(data) {
    const raw = parse(data) || data || {};
    const temp = Number(raw.temp ?? raw.temperature ?? raw.t ?? raw.current?.temperature_2m);
    const androidLocation = normalizeLocation(raw);

    if (androidLocation) {
      location = androidLocation;
      saveLS(STORAGE_LOCATION, androidLocation);
    }

    weather = Object.assign({}, weather || {}, {
      city: raw.city || raw.name || raw.locality || androidLocation?.city || weather?.city || location?.city || FALLBACK.city,
      latitude: androidLocation?.latitude ?? raw.latitude ?? raw.lat ?? weather?.latitude ?? location?.latitude,
      longitude: androidLocation?.longitude ?? raw.longitude ?? raw.lon ?? raw.lng ?? weather?.longitude ?? location?.longitude,
      source: 'android-weather',
      temperature: Number.isFinite(temp) ? temp : weather?.temperature,
      apparent: raw.apparent ?? raw.feelsLike ?? raw.feels_like ?? weather?.apparent,
      precipitation: raw.precipitation ?? raw.rain ?? weather?.precipitation,
      wind: raw.wind ?? raw.windSpeed ?? weather?.wind,
      code: raw.code ?? raw.weather_code ?? raw.icon ?? weather?.code,
      updatedAt: new Date().toISOString(),
    });

    saveLS(STORAGE_WEATHER, weather);
    renderWidget();
  }

  function handleLocationData(data) {
    const loc = normalizeLocation(data);
    if (!loc) return false;
    location = loc;
    saveLS(STORAGE_LOCATION, loc);
    refresh();
    return true;
  }

  function installLocationCallback() {
    const oldLocationUpdate = window.onLocationUpdate;
    window.onLocationUpdate = function (data) {
      try { oldLocationUpdate?.(data); } catch (e) {}
      handleLocationData(data);
    };
  }

  function init() {
    weather = loadLS(STORAGE_WEATHER, null);
    location = loadLS(STORAGE_LOCATION, FALLBACK) || FALLBACK;
    renderWidget();
    installLocationCallback();
    setTimeout(() => refresh(), 600);
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refresh(), REFRESH_MS);
  }

  return {
    init,
    refresh,
    getLocation: () => location,
    getWeather: () => weather,
    applyAndroidWeather,
    handleLocationData,
    getManualCity,
    setManualCity,
    geocodeCity,
  };
})();

WeatherManager.init();
