# Bili Liquid Glass

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Ambient lighting that follows video colors and an adjustable glass theme for Bilibili video and series watch pages. Supports desktop Chrome and Edge. Video frames are processed only on your device.

**Source version: 0.1.23 · Public source · Noncommercial license**

## Screenshots

| Ambient light on a video page | Bright, colorful light |
| --- | --- |
| ![Ambient light](assets/screenshots/ambient-light.png) | ![Colorful light](assets/screenshots/colorful-light.png) |
| Soft ambient light | Dark immersive effect |
| ![Soft light](assets/screenshots/soft-light.png) | ![Dark light](assets/screenshots/dark-light.png) |

## Download and install

[Download the extension for Chrome / Edge](https://github.com/Kiana-Zhang/bili-liquid-glass/releases)

Choose the ZIP for your browser and release version. GitHub's “Source code” archives contain source files; use the Chrome or Edge extension ZIP for installation.

1. Extract the ZIP into a folder you intend to keep.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode** and select **Load unpacked**.
4. Choose the extracted folder that directly contains `manifest.json`.
5. Refresh any Bilibili video or series pages already open.

Keep the folder: the browser loads the extension from it. Developer mode is required for installation; everyday use does not require commands or Node.js.

## Features

- Softly spreads video colors around the picture, preserving the complete video without cropping or stretching.
- Adds a glass theme to navigation, information panels, sidebars, comments and common overlays on watch pages.
- Follows the system's light/dark appearance, with manual light and dark options.
- Supports normal, widescreen, web fullscreen and browser fullscreen views. In fullscreen, lighting uses the space outside the video.
- Keeps the last lighting frame when paused; stops dynamic sampling in hidden tabs, picture-in-picture and floating mini players.

Enabling **Immersive lighting** also hides some ads, promotional blocks and voting widgets on watch pages. It does not cover every ad on the website.

## Adjust the effect

Click the extension icon in the browser toolbar or **✦ Light** in the player controls. You can pin the extension in the browser's extensions menu.

| Setting | Description |
| --- | --- |
| Language | Choose 简体中文, English, 日本語 or 한국어 at the top of the panel. Changes apply immediately and are saved. Default: Simplified Chinese. Available while lighting is off; restoring defaults preserves your language. |
| Immersive lighting | Toggles ambient lighting and the glass theme together. Turning it off restores the website's original appearance. |
| Transparency | Higher values make the glass more transparent and the light stronger. Default: 65. At 0, lighting disappears while background blur remains. |
| Spread | Controls the distance of the light, from 0 to 200. |
| Softness | Adjusts how gently the light fades. |
| Direction | Choose straight or diagonal projection. |
| Appearance | System default, light glass or dark immersive. |
| Performance | Balanced by default. Choose Eco to reduce device load or Detailed for finer lighting. |

Click outside the page panel or press Esc to close it. Changes save automatically; the page panel and extension popup share settings. Chrome and Edge store preferences separately, without account synchronization.

## Supported pages and limitations

- Regular videos at `www.bilibili.com/video/*` and anime, series and film watch pages at `www.bilibili.com/bangumi/play/*`.
- Desktop Chrome and Edge. The declared minimum Chromium version is 121; a current stable browser is recommended. Every feature has not been tested on the minimum version.
- Live-stream domains, homepage themes, mobile browsers and third-party embedded players are outside the supported scope.
- Black bars within the video contribute to the light and are not cropped automatically. There is currently no dedicated HDR correction.
- Website redesigns, account-specific page variants and other theme/player extensions may affect the result.

## Update and uninstall

**Update:** Extract the new release into the existing installation folder, replacing old files. Click **Reload** on the extensions page, then refresh Bilibili. Keeping the same folder preserves existing settings.

**Temporarily disable:** Turn off Immersive lighting, or disable the extension on the extensions page and refresh Bilibili.

**Uninstall:** Select **Remove** on the extensions page, then refresh Bilibili. The browser clears saved settings. You can delete the extracted folder yourself.

## Troubleshooting

**Nothing changes after installation?** Enable the extension and Immersive lighting, then refresh a supported watch page. Existing pages need a refresh after installation or reload. If site access is restricted, allow `www.bilibili.com`.

**Glass works but dynamic lighting does not?** Check that transparency is above 0. Some videos restrict frame access or use protected media; dynamic lighting stops and reports the reason while the glass theme remains. A fullscreen video filling the display leaves no surrounding space for lighting. Mini-player and picture-in-picture views also stop dynamic sampling.

**Lag, battery drain or louder fans?** Select Eco or temporarily turn off the effect. Hardware, resolution and other extensions affect performance.

**Broken layout or text?** Turn off the effect and refresh, then check other theme/player extensions for conflicts. Report problems through [GitHub Issues](https://github.com/Kiana-Zhang/bili-liquid-glass/issues), including browser version, page URL, steps and settings. Hide personal information in screenshots.

## Privacy and voluntary support

Frames are processed locally, without uploading or saving screenshots. Settings stay in the current browser. The extension does not collect watch history, account information or device statistics, and has no telemetry or analytics. See the [privacy notice](PRIVACY.md) (Simplified Chinese).

Support is voluntary and does not affect functionality. Alipay and WeChat QR codes are generated locally. The PayPal icon opens Ko-fi. Payments are handled by the corresponding app or website; the extension neither initiates payments automatically nor reads payment information.

| Alipay | WeChat | Ko-fi / PayPal |
| --- | --- | --- |
| [Open payment link](https://qr.alipay.com/fkx139599r7p33uofsallfa?0&T=58744-10-24%2006:29:28) | [View payment QR](assets/support/wechat.png) | [Support on Ko-fi](https://ko-fi.com/yanami_annna) |

| Alipay | WeChat |
| --- | --- |
| <img src="assets/support/alipay.png" alt="Alipay payment QR" width="180"> | <img src="assets/support/wechat.png" alt="WeChat payment QR" width="180"> |

These links and QR codes use the same destinations as the extension. Scan the WeChat code with WeChat. The PayPal icon links to Ko-fi, rather than a separate PayPal payment address.

## Build from source

With Node.js installed, run `npm ci` and `npm run build` in the project folder. Load `dist/chrome` or `dist/edge` as an unpacked extension. Run `npm run check` for types, unit tests, build and browser regression tests, and `npm run test:i18n` for the four languages, saved settings synchronization and narrow-panel layouts. Source may be ahead of Releases; use a local build to try new features.

## License

Original project code and documentation use [PolyForm Noncommercial 1.0.0](LICENSE). Copyright © 2026 Kiana-Zhang.

Noncommercial use, modification and redistribution are permitted under the license, including personal study, entertainment and hobby projects. Redistribution must retain the license and required notices. The license also permits uses by specified charitable, educational and public research organizations. Commercial use is outside this permission. This summary is for convenience; the full license governs rights and obligations.

Third-party components retain their licenses and notices; see [Third-party notices](THIRD_PARTY_NOTICES.txt). This project is not officially affiliated with Bilibili, PayPal, Alipay, WeChat or Ko-fi.
