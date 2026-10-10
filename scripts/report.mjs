import {readFile,writeFile,mkdir} from 'node:fs/promises';

async function load(name){try{return JSON.parse(await readFile(`artifacts/${name}.json`,'utf8'));}catch{return null;}}
const build=await load('build-report'),browser=await load('browser-report'),extension=await load('extension-report'),live=await load('live-report');
const theme=await load('theme-report');
const surfaces=await load('surface-report');
const interactions=await load('interaction-report');
const scroll=await load('scroll-report');
const desktop=await load('desktop-report');
const insets=await load('inset-report');
const aspect=await load('aspect-report');
const optics=await load('optics-report');
const viewport=await load('viewport-report');
const menus=await load('menu-report');
const firstScroll=await load('first-scroll-report');
const movies=await load('movie-report');
const bangumiFlow=await load('bangumi-flow-report');
const commentLoading=await load('comment-loading-report');
const donation=await load('donation-report');
const currentPerformance=await load(`performance-${build?.version}`);
const previousPerformance=await load('performance-0.1.11');
const performance=currentPerformance??previousPerformance??await load('performance-calibration')??await load('performance-report'),longevity=await load('performance-report');
const date=new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
const lines=[`# 验证报告`,``,`生成时间：${date}（Asia/Shanghai）`,``,`## 构建与自动验证`,``];
lines.push('本报告汇总工作区已有测试证据，包含不同版本的历史结果；生成时间不代表全部测试重新执行。最新项目审阅及本轮验证范围见 [审阅报告](REVIEW.md)。','');
lines.push(`当前修复版：${build?.version}。本版将 Ko-fi 改为可点击的 PayPal 标志方框，三列方框等大、弹层宽度缩至 460px。二维码及 PayPal 标志均为本地 SVG，二维码白边随方框缩小并保留四模块扫描留白。保留全部既有播放器和评论修复。保留 0.1.19 的 4:3 番剧占位修复：重叠 grid 布局的内容占位随实际播放器高度及发送栏同步，宽屏的独立下一行布局保持原样。保留完整画面与比例，不更改列宽或层级。保留首次快滚尺寸修复、按钮附近的原生风格菜单、焦点防回拉、整组全屏控件一致、无文字优化层、安全边距和扩展重载清理。`,'');
if(commentLoading?.version===build?.version)lines.push('回复加载遮罩：Chrome／Edge 实页原生 adopted stylesheet 下重建加载节点，首帧透明与关闭恢复通过。游客登录限制阻止实际点击展开，未绕过登录；本地回归覆盖明暗主题、重复翻页及动态根首帧。证据：artifacts/comment-loading-report.json。','');
if(donation?.version===build?.version)lines.push('打赏功能：Chrome／Edge 本地生产模块及安装版实页验证通过。覆盖三方框同尺寸／正方形／顶部对齐、鼠标桥接、点击固定、两级 Escape、键盘打开、保存错误提示独立、关闭沉浸仍可打赏、320／390／960 宽度同一行、减少动态效果。独立 jsQR 解码截图逐字比对两个收款地址，覆盖默认、窄窗口、1.25 倍像素缩放及扩展弹窗；Ko-fi 点击请求拦截验证 URL 与 opener，不实际付款。实页覆盖 BV19seG6VEnK 普通／网页全屏／浏览器全屏；扩展弹窗验证页面容器扩宽与恢复及设置面板 DOM 位置，未使用原生工具栏弹窗窗口录屏。证据：artifacts/donation-report.json、donation-*.png。','');
for(const row of build?.packages??[])lines.push(`- ${row.browser} ZIP：${(row.zipBytes/1024).toFixed(1)} KB；解压后 ${(row.unpackedBytes/1024).toFixed(1)} KB，低于 300 KB 目标。`);
lines.push('- TypeScript 与 Node 测试结果以本次 `npm run check` 输出为准；本生成器没有执行或读取这两项检查。','');
lines.push('| 浏览器 | 版本 | 本地浏览器场景 | 结果 |','| --- | --- | ---: | --- |');
for(const row of browser?.reports??[])lines.push(`| ${row.browser} | ${row.version} | ${row.checks.length} | ${row.passed?'通过':'失败'} |`);
lines.push('','本地场景使用实际渲染／主题／设置模块和生产 content bundle，覆盖像素渐隐、视频排除、暂停恢复、小窗、离开视口、可见性事件、网页与浏览器全屏、主题与评论样式清理、设置操作、Canvas 降级、GPU 丢失、资源释放、跨域读取限制、重复注入、播放器替换、SPA 导航及窄窗口。保留原生滚动条，新增 100vw 意外溢出裁剪、活动图片／普通投票／Shadow DOM 投票／播放器内投票关闭恢复，以及视频离屏后光效保持、只剩扩散边缘时渐隐、整层离屏后停止调度、先于视频重新进入时恢复的回归。可见性事件测试模拟 document.hidden；正常页面逻辑仍依赖原生 visibilitychange。','');
lines.push(`### ${bangumiFlow?.version??build?.version} 4:3 番剧下方控件占位`,'',
 '用户页面 ep750804（成龙历险记，4:3），并对照 ss47388（16:9）和 ss40396（宽比例电影）。独立未登录 Chrome for Testing／Edge，透明度 95／范围 100／柔和 0，三种窗口。修复前 1440×1000 的播放器底部 875px，工具栏却从 691.25px 开始；播放器已按 4:3 变高，左栏 padding 仍是原生 16:9。修复后控件区域位于播放器及发送栏下方，滚动至可见位置后逐一检查点赞、投币、收藏的 DOM 命中可达；未实际点赞或投币。宽屏切换保留原生 0px 占位和列宽，关闭插件后自定义变量／标记清除、原生 padding 恢复。ep750804 另检查快速滚动返回、网页／浏览器全屏的清理与退出恢复。','',
 '| 浏览器 | 页面 | 窗口 | 播放器底部 px | 工具栏顶部 px | 结果 |','| --- | --- | --- | ---: | ---: | --- |');
for(const row of bangumiFlow?.reports??[])lines.push(`| ${row.browser} | ${row.path} | ${row.width}×${row.height} | ${row.normal.player.bottom.toFixed(2)} | ${row.normal.toolbar.y.toFixed(2)} | ${row.passed?'通过':'失败'} |`);
lines.push('','证据：artifacts/bangumi-flow-report.json，bangumi-flow-*.png；原始实页取证 bangumi-slot-before.json。','');
lines.push(`### ${firstScroll?.version??build?.version} 首次滚轮与菜单焦点`,'',
  '透明度 95／范围 100／柔和 0，1920×1000，独立未登录 Chrome for Testing 与本机 Edge；用户截图 BV11apP6jEzH、4:3 BV13eH46nESy 和番剧 ss47388 公开试看，每页刷新三次：首次快速滚轮 1050px、先慢滚 12×35px 再快滚、刷新后再次快滚。逐帧检查自适应宽高和实际正常播放器尺寸不跳变，原生小窗不继承主播放器尺寸。随后打开菜单、连续滚动，检查没有页面回拉。本地模拟原生子元素过渡和 sticky 祖先移位，以及原生模式标志早于调度回调到达；验证宽高稳定、原生小窗立即生效。','');
for(const row of firstScroll?.reports??[])lines.push(`- ${row.browser??row.channel} ${row.path??row.kind}${row.cycle!==undefined?" 重新加载 "+(row.cycle+1):""}：${row.passed?"通过":"失败"}。`);
lines.push('','此前 120px 的小幅滚动测试遗漏快速滚动路径。本次捕获错误预算：正常原点 172，滚动过渡变成 811，拟合高度从 681.75 缩到 528；修复后所列快滚／慢滚／刷新样本宽高稳定。证据：artifacts/first-scroll-report.json、first-scroll-diagnosis.json 和 fast-scroll-after-probe.json。','');
lines.push(`### ${movies?.version??build?.version} 电影细边与完整画面`,'','三部指定电影，各自使用独立未登录公开试看配置，1920×1000、透明度 95／范围 100／柔和 0。检查原生默认／宽屏切换的容器比例、完整解码帧、前七层 CSS 边框／阴影／outline，以及暂停同一帧开关光效后的源像素校验。解码帧顶行明显较暗，阿凡达的左右边列也较暗；这些像素已存在于读取的画面中，容器没有新增边框。保留源像素，不做裁切、放大覆盖或改变 object-fit。登录后高清编码可能不同，本结论限定所测公开试看。','');
for(const row of movies?.reports??[])lines.push(`- ${row.browser} ${row.ss}：${row.passed?'通过':'失败'}；媒体 ${row.on.media.join('×')}，同帧源像素校验 ${row.off.sourceHash} → ${row.on.sourceHash}。`);
lines.push('','证据：artifacts/movie-report.json、movie-decoded-*.png（完整解码帧）和 movie-*.png（页面截图）。','');
lines.push(`### ${menus?.version??build?.version} 原生风格菜单与全屏控件`,'',
  '透明度 95／范围 100／柔和 0，独立未登录真实扩展。BV13eH46nESy（4:3）、BV19seG6VEnK（宽比例）及番剧 ss47388 公开试看检查普通、网页全屏、浏览器全屏菜单紧贴按钮上方 10px，窄窗口限制在视口内、滑杆修改同步扩展弹窗、关闭沉浸光感后仍可操作、外部点击关闭、Esc 关闭菜单但保留全屏，以及无文字描边／衬底。截图已检查。','',
  '| 浏览器 | 视频 | 播放模式 | 菜单圆角 | 结果 |','| --- | --- | --- | --- | --- |');
for(const row of menus?.reports??[])lines.push(`| ${row.browser} | ${row.bv} | ${row.modes.map(m=>m.mode).join(" / ")} | 4px | ${row.passed?"通过":"失败"} |`);
lines.push('','本地像素回归用同一组灰色图标跨越视频与黑边边界：原生层级 75 复现光效覆盖后的颜色差异，修复后整组图标 RGB 均为 179（容差 1），并保持中心视频排除。实际网站另验证原生整组控制栏位于光效上方；保留原生透明度和自动隐藏行为。证据：artifacts/menu-report.json、menu-*.png、toolbar-report.json 与 toolbar-compositing-*.png。','');
lines.push('### 真实 MV3 扩展加载','');
for(const row of extension?.reports??[])lines.push(`- ${row.browser==='chrome'?'Chrome for Testing':'本机 Edge'}：${row.passed?'通过':'未通过'}。${row.passed?'实际隔离 content script、WebGL、v1→v2 迁移、唯一开关与三个滑杆、透明度 0/50/100/95 联动、扩散方向跨弹窗／页面同步和刷新持久化、旧字段移除、总开关关闭恢复、精简文案均验证。':row.error}`);
lines.push('','正式 Chrome 自 137 起移除了命令行 --load-extension，见 [Chromium 团队说明](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ)。真实安装自动测试使用 Chrome for Testing；本机正式 Chrome 的渲染和页面生命周期另行测试。全部使用独立测试配置，不修改用户日常配置。','');
lines.push('### 扩展重载与失效上下文','');
for(const row of extension?.reports??[]) {
  const checked=row.checks?.some(c=>c.includes('runtime.reload'));
  lines.push(`- ${row.browser}：${checked&&row.passed?'通过':'尚未通过'}。${checked?'实际调用 runtime.reload，等待旧页面光效／入口／主题释放，再打开新扩展弹窗确认已加载、刷新原页面恢复新实例；CDP Runtime.exceptionThrown 捕获异常 '+row.reloadExceptions.length+' 条。':'重载结果未确认。'}`);
}
lines.push('','Chrome for Testing 的独立测试配置在重载前开启开发者模式；否则重载会因 unsupportedDeveloperExtension 将命令行加载的解压扩展禁用。该调整仅影响临时测试配置。另用生产 bundle 模拟 chrome.runtime／chrome.storage 消失、原事件 removeListener 抛错、无 DOM 变化时 runtime.id 消失，以及 storage 初始化等待期间上下文失效；检查光效画布释放为 1×1、主题与按钮移除，且不再初始化。证据：artifacts/browser-report.json、extension-report.json。','');
lines.push('## 真实 Bilibili 页面','');
lines.push(`### ${viewport?.version??'本版'} 高比例视频、导航间距与全屏控件`,'',
  '用户本次指定 BV13eH46nESy、BV14Zad6XEV8，独立未登录 MV3 配置，透明度 95／范围 100／柔和 0。窗口依次 1440×900 → 3840×1200 → 1440×900，普通、宽屏、网页全屏及浏览器全屏；检查视频容器比例与媒体比例一致、播放器底部、object-fit:contain、滚动前后高度、页面栏宽不变、原生可用宽度内居中、右栏间距、文字 Range 中心和原生字号。明暗主题另验证透明度 60／95／100 均没有文字描边或区域衬底。','',
  '| 浏览器 | 视频 | 窗口 | 播放器底部 / 窗口高 | 右栏顶部间距 px | 全屏入口 / 原生字号 | 结果 |',
  '| --- | --- | --- | --- | ---: | --- | --- |');
for(const row of viewport?.reports??[]) {
  const full=row.modes.find(m=>m.mode==='full').state;
  lines.push(`| ${row.browser} | ${row.bv} | ${row.width}×${row.height} | ${row.on.player.bottom.toFixed(1)} / ${row.height} | ${(row.on.sidebar.y-row.on.header.bottom).toFixed(1)} | ${full.button.size} / ${full.native?.size??'控件未提供文字节点'} | ${row.passed?'通过':'失败'} |`);
}
lines.push('','全部模式文字中心差不超过 0.6 px。普通／宽屏高度上限保留底部 16 px 安全距离，视频完整显示，播放器自身比例匹配媒体，不增加左右黑边；缩小的播放器外侧仍可见页面与光效。本地另以 4:3 和竖屏捕获流检查高度限制、窗口放大后恢复和媒体尺寸变化。浅／深主题确认文字 text-shadow 为 none、衬底节点为零、没有文字保护变量。证据：artifacts/viewport-report.json、viewport-*.png、browser-report.json。','');
lines.push(`### ${optics?.version??'本版'} 扩散与播放器／合集`,'',
  '用户指定 BV19seG6VEnK，透明度 95／范围 100，独立未登录 MV3 配置。1440／3840 px 窗口与明暗主题下，等待实际视频出现非黑场画面后暂停在同一帧，对直向／斜向及柔和度 0／65／100 截图，另检查实际文字 Range 的中心及高度、UP 头像／信息／按钮四周留白和导航圆角。','',
  '| 浏览器 | 宽度 | 主题 | 文字中心差 px | 文字高度 px | 入口底部留白 px | UP 四周留白 | 当前播放项 | 结果 |',
  '| --- | ---: | --- | ---: | ---: | ---: | --- | --- | --- |');
for(const row of optics?.reports??[])lines.push(`| ${row.browser} | ${row.width} | ${row.theme} | ${Math.abs(row.on.buttonText.center-row.on.nativeText.center).toFixed(2)} | ${row.on.buttonText.height} | ${(row.on.video.bottom-row.on.button.bottom).toFixed(1)} | ${row.on.up.padding} | 蓝色 16% 底、无蓝条、播放动画 | ${row.passed?'通过':'未通过'} |`);
lines.push('','UP 区宽度和水平位置保持，内部增加安全留白时高度随内容调整；关闭恢复原生样式。合集当前项开关前后的宽高保持；顶部导航四角均为 0 px，页面未增加横向溢出。设置日常状态隐藏、异常原因保留，广告提示在开关标签内。证据：artifacts/optics-report.json、optics-*.png、controls-*.png。','',
  '黑色／暗蓝灰／红色／白色在两种投影下逐点读取 GPU alpha，验证渐隐连续、单调，且相同最外边界均为 0。在扩散距离 80% 处，黑色 alpha 为 75/255，红色为 26/255；明亮颜色的渐隐曲线保持原样，黑色 RGB 仍为 0，不将黑色提亮。这是 WebGL 路径的暗色视觉补偿，Canvas 降级仍使用统一渐变遮罩。测试读回仅用于验收，生产没有新增像素读回或纹理采样。证据：artifacts/dark-falloff-chrome.json、dark-falloff-edge.json。','',
  '本地像素回归检查两种投影、柔和 0／50／100 下，4 px 条纹在上下边缘快速移动造成的远端光效亮度变化小于 35（0–255）；大柔和度的窄亮条形成单一连续光斑，避免重复锐利轮廓；红蓝分区验证斜向与直向的投影差异。Canvas 兼容路径也验证方向切换和临时缓冲释放。证据：artifacts/motion-filter-chrome.json、motion-filter-edge.json、browser-report.json。保持 20 ms 时间常数，场景切色仍在下一采样帧同步。','');
lines.push(`### ${aspect?.version??'本版'} 媒体比例与扩散 200`,'',
  '透明度 95／柔和 0，Chrome for Testing 与本机 Edge；普通宽比例视频 BV19seG6VEnK（未登录媒体尺寸 640×295）、16:9 普通视频和番剧试看。1440／3840 px 窗口验证关闭恢复、实际媒体比例、两侧等比例扩散、范围 100／200 及缓冲上限；宽比例视频与番剧还实际点击宽屏、网页全屏和浏览器全屏，验证原生模式尺寸及退出恢复。扩散 200 在真实 chrome.storage 保存并刷新弹窗后保持。','',
  '| 浏览器 | 页面 | 窗口宽度 | 原生画面高 → 自适应高 px | 扩散 200 左／右进度 | 结果 |',
  '| --- | --- | ---: | --- | --- | --- |');
for(const row of aspect?.reports??[]){const s=row.samples[1];lines.push(`| ${row.browser} | ${row.kind} | ${row.width} | ${row.off.video.height.toFixed(1)} → ${s.video.height.toFixed(1)} | ${s.leftProgress.toFixed(3)}／${s.rightProgress.toFixed(3)} | ${row.passed?'通过':'未通过'} |`);}
lines.push('','证据：artifacts/aspect-report.json 与 aspect-*.png；本地模块另验证实际捕获流从 16:9 改为 2.4:1 时的 resize 调整、关闭清理、左右非等宽边距在相同比例位置的 GPU alpha。仅根据媒体尺寸减少播放器额外留白，编码内黑边不做检测。本次实页测试均未登录，番剧使用公开试看。','');
lines.push(`### ${insets?.version??'本版'} 安全留白与离屏余光`,'',
  '透明度 95／扩散 100／柔和 0，普通视频 BV1btan64Ed3 和用户截图的番剧 ss47388（公开试看），Chrome for Testing 与本机 Edge。两种宽度均使用 1000 px 高窗口；测试在 body 尾部临时加入 6000 px 空间，确保尚未加载长评论时也能滚动越过完整扩散范围。检查指定控件到区域边缘的实际距离、评论 Shadow DOM 的内边距、原生滚动小窗、暂停、逆向滚动、渐隐和恢复调度。像素差是同一离屏位置的余光正常显示与仅隐藏余光层截图的平均 RGB 差，验证屏幕实际绘制而非只读取 hidden/opacity。','',
  '| 浏览器 | 页面 | 宽度 | 点赞左留白 px | 推荐左留白 px | 原生小窗触发 | 离屏余光像素差 | 结果 |',
  '| --- | --- | ---: | ---: | ---: | --- | ---: | --- |');
for(const row of insets?.reports??[])lines.push(`| ${row.browser} | ${row.kind} | ${row.width} | ${row.insets.like.left.toFixed(1)} | ${row.insets.recommendation.left.toFixed(1)} | ${row.samples[2].mini?'是':'否'} | ${row.paintedPixelDifference.toFixed(1)} | ${row.passed?'通过':'未通过'} |`);
lines.push('','证据：artifacts/inset-report.json，insets-*.png、insets-dark-*.png 与 tail-*.png。该历史版本曾检查文字衬底；0.1.16 已按用户要求删除，当前测试只保留无衬底断言。本地生产模块测试也加入稳定 docker 下的原生 fixed 小窗与实际余光截图像素回归。全部实页测试使用独立未登录配置，番剧只验收公开试看；完整登录环境仍待人工验收。','');
for(const row of interactions?.reports??[])lines.push(`- ${row.browser} ${interactions.version} 用户此前截图视频页：${row.passed?'通过':'未通过'}。使用透明度 95／范围 100／柔和 0；悬停前／后侧栏预览视频 ${row.before.previews} → ${row.hover.previews}，玻璃和前景层保持；快速滚轮后信息区透明，真实播放器与占位层均无原生阴影，弹幕 docker 透明，收集到 Canvas 读取警告 ${row.warnings.length} 条。证据：artifacts/interaction-report.json。`);
if(interactions?.reports?.some(row=>row.hover.previews===0))lines.push('未登录实页悬停未触发预览视频播放；实际插入预览视频时的侧栏标记稳定性，另由生产模块的本地回归覆盖。登录配置中的预览播放仍可补充人工检查。');
for(const row of surfaces?.reports??[])lines.push(`- ${row.browser} ${row.kind} ${row.theme} ${surfaces.version} 实页样式：${row.passed?'通过':'未通过'}。沉浸光感开启，透明度 95／扩散 100／柔和 0，均衡档。已检查总开关前后播放器和信息区尺寸与位置（容差 1 px）；侧栏的高度允许因广告隐藏和内容内缩换行变化，宽度和位置保持。播放器直角、发送栏与分隔伪元素、弹幕列表及外层 docker 透明度、输入框 5% 底色${row.kind==='video'?'，占位层底部透明且无白色泛光':'，实际点击简介展开／收起及季度菜单开关'}。`);
lines.push('','### 原生滚动条、浏览器缩放与实际投票','');
lines.push('0.1.7 的 headless 测试默认带有 --hide-scrollbars，漏检了可见滚动条。本版真实扩展和本地浏览器测试均显式去掉该参数。按用户截图页面 BV1btan64Ed3／ep815752，以透明度 95／范围 100／柔和 0 验证实际 Chrome tabs.setZoom 的 100%／125%／110% 缩放，不用 CSS zoom 模拟。','', '| 浏览器 | 页面 | 窗口宽度 | 浏览器缩放 | 可用宽度／scrollWidth | 原生竖向滚动条差值 | 隐藏推广模块数 | 结果 |','| --- | --- | ---: | ---: | --- | ---: | ---: | --- |');
for(const row of desktop?.reports??[])lines.push(`| ${row.browser} | ${row.kind} | ${row.width} | ${Math.round(row.zoom*100)}% | ${row.on.client}／${row.on.scroll} | ${row.on.gutter} | ${row.on.promotions.length} | ${row.passed?'通过':'未通过'} |`);
lines.push('','上述宽窗口均满足 scrollWidth = clientWidth、Shift＋滚轮横移为 0、开关前后播放器宽度不变；原生纵向滚动条实际存在。普通视频实际播放并运行光效，评论前的 bili-comments-vote-card 从真实页面读取并确认隐藏，关闭时实际恢复显示；播放器内投票和活动容器也逐项检查。新番剧 ep815752 在未登录环境提供试看，Chrome／Edge 已读取试看帧并运行光效，readyState 为 4，状态为运行中；不能视为完整会员剧集验收。白边检查包括外层无原生阴影与轮廓、普通模式取消画面重复裁剪以及缩放截图，未对所有视频和登录状态逐像素验收。','');
lines.push('','### 页面宽度与快速滚动','');
lines.push('在 1440×1000、960×800 两种窗口，真实 MV3 扩展使用透明度 95／范围 100／柔和 0，比较总开关前后 scrollWidth 与 Shift＋滚轮行为，并在快速滚动的显示阶段采样光效与视频的相对位置。窄窗口可能存在网站原生最小宽度；要求插件不增加溢出，不阻止原有水平滚动。Bilibili 首次加载会替换页头并改变原生最小宽度，测试按同一页头 DOM 世代重测开关对照。','', '| 浏览器 | 页面 | 窗口宽度 | scrollWidth 关→开 | Shift 横移 原生→开启 | 显示阶段样本 | 结果 |', '| --- | --- | ---: | --- | --- | ---: | --- |');
for(const row of scroll?.reports??[])lines.push(`| ${row.browser} | ${row.kind} | ${row.viewport.width} | ${row.off.scroll} → ${row.on.scroll} | ${row.nativeShiftX} → ${row.afterX-row.beforeX} | ${row.samples.length} | ${row.passed?'通过':'未通过'} |`);
lines.push('','上述样本均检查视频与光效偏移误差不超过 1.1 px、Canvas 相对位置稳定和缓冲最长边不超过 512 px。普通视频实际播放；番剧仍仅验收 DOM 与样式。截图和滚动几何验证支持本次滚动错位修复，未进行登录环境的逐帧像素验收。','');
for(const row of theme?.reports??[]) lines.push(`- 历史主题回归：${row.browser} ${row.theme}，${row.passed?'通过':'未通过'}；搜索框、弹幕栏及嵌套评论输入框，证据 theme-report.json（非本版重新测量）。`);
lines.push('','通用表面检查沿用普通视频 BV1FtaJ6BEsd 和公开番剧 ep5881948，新桌面回归使用本次截图页面 BV1btan64Ed3／ep815752。普通视频和新番剧的试看已实际读取帧运行光效；各次渲染诊断保存在报告的 status 字段。上述全部实页测试均为独立未登录配置，不能视为登录后完整剧集播放验收。此前登录自动化被电脑控制工具的自动审核中止：无法可靠确定当前 Chrome 网址；本次未发送验证码、未登录、未读取日常配置中的凭据。登录后的普通视频和番剧仍待人工验收。下列播放模式探测来自 0.1.1。','');
for(const row of live?.reports??[]) {
  const name=row.page==='video'?'普通视频':row.page==='bangumi'?'番剧':'扩展环境';
  lines.push(`- ${row.browser} ${name}：${row.verified?'已验证读取视频帧并运行光效':'未验证媒体读取'}${row.playback==='public trailer'?'（尝试公开预告）':''}。${row.dom?`主题为 ${row.dom.theme}，播放器按钮${row.dom.button?'存在':'未出现'}，匹配 ${row.dom.regions.length} 个主题区域。`:row.reason??''}`);
  if(row.modes?.length)lines.push(`  播放模式探测：${row.modes.map(mode=>`${mode.name} ${mode.verified?'通过':'未通过'}`).join('；')}。`);
}
lines.push('','历史普通视频抽样来自公开 [测试视频](https://www.bilibili.com/video/BV1GJ411x7h7/)。历史番剧和通用表面测试 ep5881948 在未登录配置中没有可读取媒体；本版 ep815752 的试看已验证帧读取。登录后的完整剧集、受保护内容和各种番剧页面变体仍需人工验证。','',
'播放器模块的标准、网页与浏览器全屏生命周期已验证，真实网站模式探测结果逐项记录如上；分 P／换集、清晰度切换、弹幕和互动弹层仍列在人工验收清单。未对点赞、投币、收藏或账号状态进行写操作。','');
lines.push('## 性能对照','');
if(performance?.machine)lines.push(`机器：${performance.machine.cpu.trim()}；${performance.machine.logicalCores} 个逻辑核心；内存 ${(performance.machine.totalMemoryBytes/1073741824).toFixed(1)} GiB。`,'');
const gpu=performance?.comparisons?.[0]?.gpu?.auxAttributes?.glRenderer;if(gpu)lines.push(`实际 GPU 渲染：${gpu}`,'');
lines.push(currentPerformance
  ? `以下为 ${build?.version} 的短时性能对照，每阶段设定 ${currentPerformance.requestedPhaseSeconds} 秒，实际墙钟时间保存在 JSON。使用本地合成 VP9 1080p60／4K60、安装的 Chrome／Edge、1440×1000、深色主题、均衡档、透明度 ${currentPerformance.settings.transparency}／范围 ${currentPerformance.settings.spread}／柔和 ${currentPerformance.settings.softness}／斜向扩散、headless。四组播放对照依次执行，没有同时运行其他实页 QA；提交耗时不含 GPU 异步执行。本机短时结果不能代表所有真实网站、视频和设备，30 分钟数据仍为历史版本。`
  : `以下精确 60 FPS 性能对照来自 ${previousPerformance?'0.1.11':'0.1.1'}；本版未重新进行性能对照。使用本地合成 VP9 视频、安装的 Chrome／Edge、1440×1000、深色玻璃、均衡档、headless，不代表所有 GPU 或真实网站的结果。${previousPerformance?'每阶段设定 12 秒，透明度 65／范围 35／柔和 65／斜向扩散；Chrome 首组 OFF 阶段有独立实页 QA 同机运行，CPU 对照应参考此限制。':''}`,'',
'| 浏览器 | 素材 | 实测 FPS（开启） | 掉帧率 关 → 开 | 增加百分点 | 平均提交 ms | 单核心 CPU% 关 → 开 |','| --- | --- | ---: | --- | ---: | ---: | --- |');
for(const row of performance?.comparisons??[]) {
  const[off,on]=row.phases;
  lines.push(`| ${row.browser} | ${row.clip} | ${on.renderedFps.toFixed(2)} | ${off.dropPercent.toFixed(3)}% → ${on.dropPercent.toFixed(3)}% | ${row.dropIncreasePercentagePoints.toFixed(3)} | ${on.diagnostics.averageDrawMs.toFixed(3)} | ${off.cpuPercentOneCore.toFixed(1)} → ${on.cpuPercentOneCore.toFixed(1)} |`);
}
lines.push('','CPU 100% 表示一个逻辑核心持续占用，非整机百分比。提交耗时不含 GPU 异步执行时间。GPU 引擎计数、进程内存和完整原始数据保存在 JSON；GPU 引擎总和是结束时采样，不能当作平均 GPU 占用。','',
`掉帧增加不超过 1 个百分点：${performance?.comparisons?.length===4&&performance.comparisons.every(row=>row.targetMet)?'所列数据四组均达标':'尚未全部确认'}。精确 60 FPS 素材采用显式时间戳编码；${currentPerformance?`本次原始数据 performance-${build?.version}.json。`:`历史数据 ${previousPerformance?'performance-0.1.11':'performance-calibration'}.json。`}`,'');
lines.push('## 长时间运行','', '以下 30 分钟数据来自首版 0.1.0；本版已重跑资源释放回归，未重复 30 分钟测试。','');
for(const row of longevity?.soaks??[]) {
  const first=row.samples?.[0],last=row.samples?.at(-1),complete=!!row.completedAt;
  if(!first||!last)continue;
  lines.push(`- ${row.browser}：${complete?'已完成':'进行中'}，${(row.elapsedMinutes??(last.at-first.at)/60000).toFixed(1)} 分钟；GC 后 JS heap ${(first.jsHeapBytes/1048576).toFixed(2)} → ${(last.jsHeapBytes/1048576).toFixed(2)} MB；节点 ${first.nodes} → ${last.nodes}；播放器替换 ${row.replacementChecks.length} 次；最终光效实例 ${last.video.ambientCount}。`);
}
lines.push('','长时间测试两款浏览器同时运行，每五分钟替换播放器，记录 GC 后堆、DOM、监听器、CPU、GPU 和进程内存。稳定性测试使用首轮 1920×1080 MediaRecorder 素材（实际约 27 FPS），与精确 60 FPS 性能对照分开评价。旧测试样本保留最初视频引用，第一次替换后会多保留约 148 个原生媒体节点；后续替换需观察是否继续增长。新测试脚本已移除该引用。','',
'## 原始证据','',
'- [包体积](../artifacts/build-report.json)、[本地浏览器测试](../artifacts/browser-report.json)、[真实扩展测试](../artifacts/extension-report.json)。',
`- [本次扩散／入口／合集实页验证](../artifacts/optics-report.json)，截图 optics-*.png、controls-*.png；[${currentPerformance?'本次':'历史'}短时性能](../artifacts/${currentPerformance?`performance-${build?.version}`:previousPerformance?'performance-0.1.11':'performance-calibration'}.json)。`,
'- [本次透明度 95／范围 100／柔和 0 实页样式与诊断](../artifacts/surface-report.json)、[滚轮与悬停回归](../artifacts/interaction-report.json)、[两种窗口滚动／页面宽度回归](../artifacts/scroll-report.json)。',
'- 新设置截图 `artifacts/settings-chrome.png`、`settings-edge.png`；实页滚动截图 `artifacts/scroll-*.png`。',
'- [原生滚动条／浏览器缩放／实际活动和投票](../artifacts/desktop-report.json)，修复后截图 `artifacts/desktop-*.png`；投票来源取证 `artifacts/vote-probe.json`。',
'- 修复前来源取证：`artifacts/current-white-probe.json`、`white-ancestry.json`、`native-white-layers.json`；修复前截图 `current-white-probe.png`，修复后 `surfaces-*.png`。',
'- [真实页面 DOM／状态](../artifacts/live-report.json)、[最终 60 FPS 对照](../artifacts/performance-calibration.json)、[长时间运行与首轮对照](../artifacts/performance-report.json)。',
'- `artifacts/preview-chrome.png`、`preview-edge.png` 为本地模拟页面截图；`live-*.png` 为真实页面截图。','',
'## 人工验收清单','',
'- 登录后番剧完整剧集、换集／分 P、清晰度切换和受保护媒体的安全降级。',
'- 真实网站宽屏、网页全屏、浏览器全屏、画中画、悬浮小窗及动态广告区域。',
'- 弹幕、点赞／收藏等交互、第三方主题兼容、长评论与闭合 Shadow DOM 变体。',
'- 低端／集成 GPU、不同缩放和高刷新屏；HDR 与自带黑边属于已声明的首版边界。','');
await mkdir('docs',{recursive:true});await writeFile('docs/VALIDATION.md',lines.join('\n'));
console.log('Updated docs/VALIDATION.md from measured artifacts');
