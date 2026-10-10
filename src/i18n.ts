export const LANGUAGES = { zh: '简体中文', en: 'English', ja: '日本語', ko: '한국어' } as const;
export type Language = keyof typeof LANGUAGES;
const zh = {
  settings: '光感设置', settingsLabel: '沉浸光感设置', closeSettings: '关闭设置', language: '语言',
  enabled: '沉浸光感', enabledHint: '开启会屏蔽部分广告和活动等', transparency: '透明度', spread: '扩散范围',
  projection: '扩散方向', diagonal: '斜向扩散', straight: '直向扩散', softness: '柔和度', theme: '外观',
  system: '跟随系统', light: '浅色玻璃', dark: '深色沉浸', quality: '性能档位',
  economy: '省电', balanced: '均衡', fine: '细腻', reset: '恢复默认', donate: '打赏支持',
  saved: '已保存', saveFailed: '保存失败，请重新打开设置', privacy: '视频帧在本机处理 · 无上传 · 无遥测',
  donationOptions: '打赏方式', thanks: '感谢你的支持', closeDonation: '关闭打赏', alipay: '支付宝', wechat: '微信',
  scanAlipay: '支付宝扫一扫', scanWechat: '微信扫一扫', visitDonation: '前往打赏', donationLink: '点击前往打赏 ↗',
  alipayQr: '支付宝收款二维码', wechatQr: '微信收款二维码', playerButton: '✦ 光感', openSettings: '打开沉浸光感设置',
  openPage: '请打开 Bilibili 普通视频或番剧观看页', waitingPlayer: '正在等待 Bilibili 播放器', waitingVideo: '正在等待视频画面',
  disabled: '沉浸光感已关闭', sleeping: '光效已休眠 · 扩散范围不可见或处于小窗', mini: '悬浮小窗 · 保留原位置扩散余光',
  buffering: '视频缓冲中 · 保留当前光效', paused: '已暂停 · 保留当前光效', running: '氛围光运行中 · {quality}{mode}',
  compatibility: ' · 兼容模式', downgraded: '光效已自动降为{quality}档',
  protectedVideo: '此视频限制画面读取 · 动态光效已关闭，玻璃主题仍可用',
  effectFailed: '光效暂不可用 · 请刷新页面重试，玻璃主题仍可用', gpuFallback: 'GPU 上下文丢失，已切换为省电 Canvas 渲染',
  readFailed: '无法读取设置，请重新打开扩展。', initFailed: '初始化失败，请刷新页面。',
  sampleFailed: '浏览器无法创建视频采样画布', probeFailed: '浏览器无法创建视频安全性检测画布', canvasFailed: '浏览器无法创建氛围光画布',
};
export type MessageKey = keyof typeof zh;
const en: Record<MessageKey, string> = {
  settings: 'Light settings', settingsLabel: 'Ambient light settings', closeSettings: 'Close settings', language: 'Language',
  enabled: 'Immersive lighting', enabledHint: 'Also hides some ads and promotions', transparency: 'Transparency', spread: 'Spread',
  projection: 'Direction', diagonal: 'Diagonal', straight: 'Straight', softness: 'Softness', theme: 'Appearance',
  system: 'System default', light: 'Light glass', dark: 'Dark immersive', quality: 'Performance',
  economy: 'Eco', balanced: 'Balanced', fine: 'Detailed', reset: 'Restore defaults', donate: 'Support',
  saved: 'Saved', saveFailed: 'Could not save. Reopen settings.', privacy: 'Frames processed locally · No uploads · No telemetry',
  donationOptions: 'Support options', thanks: 'Thank you for your support', closeDonation: 'Close support options', alipay: 'Alipay', wechat: 'WeChat',
  scanAlipay: 'Scan with Alipay', scanWechat: 'Scan with WeChat', visitDonation: 'Support on Ko-fi', donationLink: 'Support on Ko-fi ↗',
  alipayQr: 'Alipay payment QR code', wechatQr: 'WeChat payment QR code', playerButton: '✦ Light', openSettings: 'Open ambient light settings',
  openPage: 'Open a Bilibili video or series watch page', waitingPlayer: 'Waiting for the Bilibili player', waitingVideo: 'Waiting for video frames',
  disabled: 'Immersive lighting is off', sleeping: 'Lighting asleep · Halo out of view or mini player active', mini: 'Mini player · Keeping the halo at its original position',
  buffering: 'Buffering · Keeping current lighting', paused: 'Paused · Keeping current lighting', running: 'Ambient light active · {quality}{mode}',
  compatibility: ' · Compatibility mode', downgraded: 'Lighting automatically reduced to {quality}',
  protectedVideo: 'This video blocks frame access · Dynamic lighting off; glass theme still available',
  effectFailed: 'Lighting unavailable · Refresh to retry; glass theme still available', gpuFallback: 'GPU context lost; switched to power-saving Canvas rendering',
  readFailed: 'Could not read settings. Reopen the extension.', initFailed: 'Initialization failed. Refresh the page.',
  sampleFailed: 'Cannot create video sampling canvas', probeFailed: 'Cannot create video security probe canvas', canvasFailed: 'Cannot create ambient light canvas',
};
const ja: Record<MessageKey, string> = {
  settings: 'ライト設定', settingsLabel: 'アンビエントライト設定', closeSettings: '設定を閉じる', language: '言語',
  enabled: '没入型ライト', enabledHint: '一部の広告やキャンペーンも非表示にします', transparency: '透明度', spread: '拡散範囲',
  projection: '拡散方向', diagonal: '斜めに拡散', straight: 'まっすぐ拡散', softness: '柔らかさ', theme: '外観',
  system: 'システムに従う', light: 'ライトガラス', dark: 'ダーク', quality: '描画品質',
  economy: '省電力', balanced: 'バランス', fine: '高精細', reset: '初期設定に戻す', donate: '支援する',
  saved: '保存しました', saveFailed: '保存できませんでした。設定を開き直してください。', privacy: '端末内で映像を処理 · アップロードなし · テレメトリーなし',
  donationOptions: '支援方法', thanks: 'ご支援ありがとうございます', closeDonation: '支援画面を閉じる', alipay: 'Alipay', wechat: 'WeChat',
  scanAlipay: 'Alipayでスキャン', scanWechat: 'WeChatでスキャン', visitDonation: 'Ko-fiで支援する', donationLink: 'Ko-fiで支援する ↗',
  alipayQr: 'Alipay支払い用QRコード', wechatQr: 'WeChat支払い用QRコード', playerButton: '✦ ライト', openSettings: 'アンビエントライト設定を開く',
  openPage: 'Bilibiliの動画・アニメ視聴ページを開いてください', waitingPlayer: 'Bilibiliプレイヤーを待っています', waitingVideo: '映像を待っています',
  disabled: '没入型ライトはオフです', sleeping: 'ライト休止中 · 拡散範囲が画面外、または小窓表示中', mini: '小窓表示中 · 元の位置に残光を維持',
  buffering: '読み込み中 · 現在のライトを維持', paused: '一時停止中 · 現在のライトを維持', running: 'ライト動作中 · {quality}{mode}',
  compatibility: ' · 互換モード', downgraded: 'ライトを自動的に{quality}に下げました',
  protectedVideo: '映像の読み取りが制限されています · 動的ライトは停止、ガラステーマは利用可能',
  effectFailed: 'ライトを利用できません · ページを再読み込みしてください。ガラステーマは利用可能', gpuFallback: 'GPUコンテキストが失われたため、省電力Canvas描画に切り替えました',
  readFailed: '設定を読み取れません。拡張機能を開き直してください。', initFailed: '初期化に失敗しました。ページを再読み込みしてください。',
  sampleFailed: '映像取得用Canvasを作成できません', probeFailed: '映像安全性確認用Canvasを作成できません', canvasFailed: 'ライト描画用Canvasを作成できません',
};
const ko: Record<MessageKey, string> = {
  settings: '조명 설정', settingsLabel: '앰비언트 조명 설정', closeSettings: '설정 닫기', language: '언어',
  enabled: '몰입형 조명', enabledHint: '일부 광고와 이벤트도 숨깁니다', transparency: '투명도', spread: '확산 범위',
  projection: '확산 방향', diagonal: '대각선 확산', straight: '직선 확산', softness: '부드러움', theme: '테마',
  system: '시스템 설정', light: '밝은 유리', dark: '어두운 테마', quality: '성능',
  economy: '절전', balanced: '균형', fine: '정밀', reset: '기본값 복원', donate: '후원하기',
  saved: '저장됨', saveFailed: '저장하지 못했습니다. 설정을 다시 열어 주세요.', privacy: '기기에서 영상 처리 · 업로드 없음 · 원격 측정 없음',
  donationOptions: '후원 방법', thanks: '후원해 주셔서 감사합니다', closeDonation: '후원 창 닫기', alipay: 'Alipay', wechat: 'WeChat',
  scanAlipay: 'Alipay로 스캔', scanWechat: 'WeChat으로 스캔', visitDonation: 'Ko-fi에서 후원하기', donationLink: 'Ko-fi에서 후원하기 ↗',
  alipayQr: 'Alipay 결제 QR 코드', wechatQr: 'WeChat 결제 QR 코드', playerButton: '✦ 조명', openSettings: '앰비언트 조명 설정 열기',
  openPage: 'Bilibili 동영상 또는 시리즈 시청 페이지를 열어 주세요', waitingPlayer: 'Bilibili 플레이어 대기 중', waitingVideo: '영상 대기 중',
  disabled: '몰입형 조명이 꺼져 있습니다', sleeping: '조명 일시 중지 · 확산 범위가 화면 밖이거나 작은 창 사용 중', mini: '작은 창 · 원래 위치의 잔광 유지',
  buffering: '버퍼링 중 · 현재 조명 유지', paused: '일시 정지 · 현재 조명 유지', running: '앰비언트 조명 실행 중 · {quality}{mode}',
  compatibility: ' · 호환 모드', downgraded: '조명을 자동으로 {quality} 모드로 낮췄습니다',
  protectedVideo: '영상 읽기가 제한됩니다 · 동적 조명 꺼짐, 유리 테마는 사용 가능',
  effectFailed: '조명을 사용할 수 없습니다 · 새로고침해 주세요. 유리 테마는 사용 가능', gpuFallback: 'GPU 컨텍스트가 손실되어 절전 Canvas 렌더링으로 전환했습니다',
  readFailed: '설정을 읽을 수 없습니다. 확장 프로그램을 다시 열어 주세요.', initFailed: '초기화에 실패했습니다. 페이지를 새로고침해 주세요.',
  sampleFailed: '영상 샘플링 Canvas를 만들 수 없습니다', probeFailed: '영상 보안 확인 Canvas를 만들 수 없습니다', canvasFailed: '조명 Canvas를 만들 수 없습니다',
};
export const MESSAGES = { zh, en, ja, ko };
export type MessageParams = Record<string, string>;
export function t(language: Language, key: MessageKey, params: MessageParams = {}): string {
  params = { ...params };
  if (params.quality && ['economy', 'balanced', 'fine'].includes(params.quality)) params.quality = MESSAGES[language][params.quality as 'economy' | 'balanced' | 'fine'];
  if ('mode' in params) params.mode = params.mode === 'canvas' ? MESSAGES[language].compatibility : '';
  return MESSAGES[language][key].replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}
export function translate(root: ParentNode, language: Language): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n as MessageKey;
    element.textContent = t(language, key) + (element.dataset.fps ? ` · ${element.dataset.fps} FPS` : '');
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    element.setAttribute('aria-label', t(language, element.dataset.i18nAria as MessageKey));
  }
}
