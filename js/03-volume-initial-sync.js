// Изолированный однократный запрос стартового уровня громкости.
// Чтобы полностью отключить его, достаточно удалить подключение этого файла из index.html.
window.VolumeInitialSync = (() => {
  let completed = false;

  function run() {
    if (completed) return true;
    if (!window.androidApi || typeof VolumeManager === 'undefined') return false;

    const volume = VolumeManager.fetchVolume({ force: true });
    if (volume == null) return false;

    completed = true;
    return true;
  }

  return Object.freeze({ run });
})();
