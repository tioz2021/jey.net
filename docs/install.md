# Установка desktop

## Linux

### AppImage

```bash
chmod +x jey.net_0.3.13_amd64.AppImage
./jey.net_0.3.13_amd64.AppImage
```

### deb

```bash
sudo apt install ./jey.net_0.3.13_amd64.deb
jey.net
```

Данные по умолчанию: `~/.local/share/net.jey.desktop`. Папку можно изменить в
`Настройки → Локальные данные`.

## Windows

Установщик NSIS:

```text
jey.net_0.3.13_x64-setup.exe
```

Артефакт `jey-desktop-windows` из GitHub Actions содержит NSIS `.exe`.
Сборка **не подписана** сертификатом Authenticode. Windows SmartScreen может
показать предупреждение «Неизвестный издатель» — это ожидаемо до T111.1.

Данные по умолчанию: `%APPDATA%\net.jey.desktop`. Папку можно изменить в
настройках.

## Обновления

Автообновление появится в T111.1. Сейчас новая версия устанавливается
вручную поверх старой; локальная база и медиа сохраняются.
