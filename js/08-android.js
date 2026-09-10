function parsePlaybackState(data) {
  if (!data || typeof data !== 'object') return null;
  const raw = data.PlayStat ?? data.playStat ?? data.playstat ?? data.isPlaying ?? data.IsPlaying ?? data.isplaying ?? data.playing
    ?? data.Playing ?? data.playbackState ?? data.PlaybackState ?? data.state ?? data.State;
  if (raw == null) return null;
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  const value = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'play', 'playing', 'started'].includes(value)) return true;
  if (['false', '0', 'no', 'off', 'pause', 'paused', 'stopped', 'stop'].includes(value)) return false;
  return null;
}

window.onAndroidEvent = function(type, data) {
  const typeNorm = String(type || '').toLowerCase();
  const themeTypes = /^(theme|uimode|nightmode|systemtheme|darkmode|uimodechange|daynight|appearance|configurationchanged)$/;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (themeTypes.test(typeNorm)) {
      try {
        data = JSON.parse(trimmed);
      } catch(e) {
        ThemeManager.handleThemeEvent(typeNorm, trimmed);
        return;
      }
    } else if (typeNorm === 'musicinfo') {
      try { data = JSON.parse(trimmed); } catch(e) { return; }
    } else if (/^volume(changed)?$/i.test(typeNorm)) {
      try { data = JSON.parse(trimmed); } catch(e) { data = trimmed; }
    } else if (/^(gps|weather)$/i.test(typeNorm)) {
      try { data = JSON.parse(trimmed); } catch(e) { return; }
    } else if (/^(rpm|enginerpm|engine_rpm|enginespeed|engine_speed)$/i.test(typeNorm)) {
      try { data = JSON.parse(trimmed); } catch(e) { data = trimmed; }
    } else {
      try { data = JSON.parse(trimmed); } catch(e) { return; }
    }
  }
  if (data == null) {
    if (themeTypes.test(typeNorm)) {
      ThemeManager.scheduleThemeRefresh();
    }
    return;
  }

  // RPM может прийти под любым типом события и быть глубоко вложен в payload.
  window.RpmEventLog?.captureIfPresent(`event:${typeNorm}`, data);

  switch (typeNorm) {
    case 'musicinfo': {
      const title = data.SongName || '', artist = data.SongArtist || '', hasTrack = !!(title||artist);
      set('track-title', hasTrack ? title : 'Не воспроизводится');
      set('track-artist', hasTrack ? artist : '—');
      const art = el('album-art');
      if (data.SongAlbumPicture) { art.src = 'data:image/png;base64,'+data.SongAlbumPicture; art.classList.remove('empty'); }
      else { art.src = 'img/music-placeholder.svg'; art.classList.toggle('empty', !hasTrack); }
      const pos = parseFloat(data.Trpos||0), dur = parseFloat(data.Trdur||0);
      trackDuration = dur; trackPosition = pos; positionTimestamp = Date.now();
      setProgress(pos, dur);
      const playing = parsePlaybackState(data);
      syncPlayStateFromAndroid(playing);
      break;
    }
    case 'theme':
      ThemeManager.handleThemeEvent('theme', data);
      break;
    case 'uimode':
    case 'nightmode':
    case 'systemtheme':
    case 'darkmode':
    case 'uimodechange':
    case 'daynight':
    case 'appearance':
    case 'configurationchanged':
      ThemeManager.handleThemeEvent(typeNorm, data);
      break;
    case 'volumechanged':
    case 'volume': {
      const vol = typeof data === 'object'
        ? (data.volume ?? data.value ?? data.level ?? data.percent)
        : data;
      VolumeManager.handleVolumeFromSystem(vol);
      MuteManager.syncFromDevice();
      break;
    }
    case 'climatestate':
      window.ClimateFeedback?.handleClimateState(data);
      break;
    case 'carresponse':
      window.ClimateFeedback?.handleCarResponse(data);
      break;
    case 'cardata':
      window.ClimateFeedback?.handleCarData(data);
      break;
    case 'rpm':
    case 'enginerpm':
    case 'engine_rpm':
    case 'enginespeed':
    case 'engine_speed':
      break;
    case 'gps':
      window.MiniMapPanel?.handleGpsSignal(data);
      WeatherManager.handleLocationData({
        city: data.city || data.name || 'GPS',
        latitude: data.latitude ?? data.lat ?? data.coords?.latitude,
        longitude: data.longitude ?? data.lon ?? data.lng ?? data.coords?.longitude,
        accuracy: data.accuracy ?? data.coords?.accuracy,
        source: 'android-gps',
      });
      break;
    case 'weather':
      WeatherManager.applyAndroidWeather(data);
      break;
    case 'hud':
      window.MiniMapPanel?.handleHud(data);
      break;
    case 'minimapframe':
    case 'mini_map_frame':
      window.MiniMapPanel?.applyFrame(data);
      break;
    case 'gpssignalquality':
    case 'gps_signal_quality':
      window.MiniMapPanel?.handleGpsSignal(data);
      break;
    case 'outtemp':
    case 'out_temp':
    case 'outsidetemperature':
    case 'outside_temperature':
      window.OutsideTempManager?.apply(data);
      break;
  }
};
