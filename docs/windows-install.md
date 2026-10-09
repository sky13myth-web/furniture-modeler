# ATÖLYE для Windows / Windows için ATÖLYE / ATÖLYE for Windows

## Русский

1. На странице [последнего выпуска](https://github.com/sky13myth-web/furniture-modeler/releases/latest) скачайте **ATOLYE-Setup-2.1.0-x64.exe**.
2. Откройте скачанный файл. Выберите язык установщика, нажмите «Далее», при необходимости выберите папку и нажмите «Установить».
3. Оставьте включённым запуск ATÖLYE и нажмите «Готово». В дальнейшем запускайте программу ярлыком на рабочем столе или из меню «Пуск».

Поддерживаются Windows 10/11, 64 бита. После скачивания установщика интернет не нужен. Node.js, браузер и права администратора для установки не требуются. Язык интерфейса выбирается отдельно внутри программы: русский, Türkçe или English.

Windows может показать предупреждение SmartScreen, поскольку этот выпуск не подписан сертификатом издателя. Проверяйте, что файл скачан из указанного репозитория GitHub. В свойствах файла нет подтверждённой цифровой подписи издателя.

Автосохранение находится в `%APPDATA%\ATOLYE-Furniture-Studio`. Обновление и обычное удаление приложения его сохраняют. Для переноса проекта на другой компьютер выберите **Проект → Сохранить файл проекта**, затем откройте полученный JSON на другом компьютере. Проекты из браузерной версии перенесите таким же способом. Чтобы удалить программу, используйте «Параметры Windows → Приложения → ATÖLYE → Удалить».

## Türkçe

1. [Son sürümden](https://github.com/sky13myth-web/furniture-modeler/releases/latest) **ATOLYE-Setup-2.1.0-x64.exe** dosyasını indirin.
2. Dosyayı açın, yükleyicinin dilini seçin ve «İleri» ile devam edin. İsterseniz hedef klasörü değiştirin ve «Yükle» düğmesine basın.
3. ATÖLYE'yi başlat seçeneğini açık bırakıp «Bitir» düğmesine basın. Sonraki açılışlarda masaüstü veya Başlat menüsü kısayolunu kullanın.

64 bit Windows 10/11 desteklenir. İndirdikten sonra internet, Node.js veya yönetici yetkisi gerekmez. Uygulamanın dili içerideki Русский / Türkçe / English seçicisinden değiştirilir. Bu sürüm yayıncı sertifikasıyla imzalanmadığından Windows SmartScreen uyarısı gösterebilir; yalnızca yukarıdaki GitHub deposundan indirin.

Otomatik kayıtlar `%APPDATA%\ATOLYE-Furniture-Studio` içinde saklanır; güncelleme ve normal kaldırma bunları silmez. Projeyi başka bilgisayara taşımak için **Proje → Proje dosyasını kaydet** ile JSON dosyasını kaydedip diğer bilgisayarda açın. Tarayıcı sürümündeki projeleri de aynı yöntemle taşıyın.

## English

1. Download **ATOLYE-Setup-2.1.0-x64.exe** from the [latest release](https://github.com/sky13myth-web/furniture-modeler/releases/latest).
2. Open the file, choose the installer language, click Next, optionally choose an installation folder, and click Install.
3. Keep Launch ATÖLYE selected and click Finish. Use the desktop or Start menu shortcut next time.

Requires 64-bit Windows 10/11. Once downloaded, installation and the app work offline without Node.js or administrator rights. Choose the application language separately using its Русский / Türkçe / English selector. This release has no publisher signing certificate, so Windows SmartScreen may show a warning; download from the linked GitHub repository.

Autosave lives in `%APPDATA%\ATOLYE-Furniture-Studio` and is preserved by updates and normal uninstallation. Transfer projects using **Project → Save project file** and open the JSON on the other computer. Use the same method to transfer browser projects. Uninstall through Windows Settings → Apps → ATÖLYE.

## Building and checking the installer

On Windows with Node.js 22 or newer:

```powershell
npm ci --no-audit --no-fund
node node_modules/electron/install.js
npm test
npm run desktop:smoke
npm run dist:win
npm run desktop:verify
node scripts/desktop-smoke.mjs --packaged
npm run release:checksums
```

The offline NSIS installer is written to `dist/ATOLYE-Setup-2.1.0-x64.exe`. `dist/SHA256SUMS.txt` contains its SHA-256 hash. `desktop:verify` checks the bundled file allowlist. Smoke checks use a hidden native Electron window and save only under `.tools/desktop-smoke*`; they check ES modules, autosave, project JSON, factory ZIP, a print popup and PDF, and blocked unsafe resources. They do not install the app, create shortcuts, or change the installed application's data.

The manual **Build Windows installer** GitHub Actions workflow rebuilds an existing version tag with pinned package versions and the lockfile. It stores installer artifacts, and its optional publish input uploads them to an existing release. Build output bytes can differ between builds because Windows executable timestamps and installer metadata are generated during packaging; check the checksum belonging to the release you downloaded.

Runtime policies follow the official [Electron protocol documentation](https://www.electronjs.org/docs/latest/api/protocol). Installer options are described in the official [electron-builder NSIS documentation](https://www.electron.build/nsis/).
