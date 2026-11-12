// 构建 ESP32-S3 用途整理文档（ProseMirror JSON），并发布到学城
// 用法: node scripts/publish_esp32s3.mjs

const BASE = "https://km.751152.xyz/editor";
const USER = "admin";
const PASS = "ZcxM6XVjYhXEDSBt";

// ---- ProseMirror 节点构造助手 ----
const h = (level, text) => ({
  type: "heading",
  attrs: { level, align: null },
  content: [t(text)],
});
const t = (text, marks) => (marks ? { type: "text", text, marks } : { type: "text", text });
const p = (parts) => ({
  type: "paragraph",
  attrs: { align: null },
  content: Array.isArray(parts) ? parts : [t(parts)],
});
const emptyP = () => ({ type: "paragraph", attrs: { align: null } });
const li = (parts) => ({ type: "list_item", content: [p(parts)] });
const bullet = (items) => ({ type: "bullet_list", content: items.map(li) });
const ordered = (items) => ({ type: "ordered_list", attrs: { order: 1 }, content: items.map(li) });
const bq = (parts) => ({ type: "blockquote", content: [p(parts)] });
const code = (text, lang = "") => ({
  type: "code_block",
  attrs: { language: lang },
  content: [{ type: "text", text }],
});
const STRONG = [{ type: "strong" }];
const EM = [{ type: "em" }];
const CODE = [{ type: "code" }];

const content = {
  type: "doc",
  content: [
    h(1, "ESP32-S3 可以用来做什么？（全网资料整理）"),
    p([
      t("ESP32-S3 是乐鑫科技（Espressif）面向 "),
      t("AIoT（人工智能物联网）", STRONG),
      t(" 市场推出的高集成度 MCU 芯片，凭借 “Wi-Fi/蓝牙 + 边缘 AI 加速 + 丰富接口” 的组合，成为 2026 年最热门的嵌入式主控之一。本文汇总全网资料，系统梳理它“能做什么、怎么选、怎么上手”。"),
    ]),
    p([t("一句话定位："), t("如果你要在设备上跑机器学习、接摄像头/屏幕、做 USB 设备或需要更强的 BLE 5，选 ESP32-S3；如果只要经典 Wi-Fi + 蓝牙音频（A2DP/SPP），才考虑老款 ESP32。", EM)]),

    h(2, "一、先认识 ESP32-S3 是什么"),
    p("它是一颗 SoC（系统级芯片），核心规格如下："),
    bullet([
      [t("CPU：", STRONG), t("双核 Xtensa 32 位 LX7，主频最高 240 MHz，带向量（SIMD）指令用于 AI 加速。")],
      [t("内存：", STRONG), t("内置 512 KB SRAM，模块通常外挂 4–16 MB Flash 与最高 8 MB PSRAM（PSRAM 对摄像头/AI/图形缓冲至关重要）。")],
      [t("无线：", STRONG), t("2.4 GHz Wi-Fi（802.11 b/g/n，支持 40 MHz 带宽与 Long Range）+ Bluetooth 5 (LE) / Bluetooth Mesh。")],
      [t("GPIO：", STRONG), t("45 个可编程 GPIO（比经典 ESP32 多 10 个），其中 14 个可配置为电容触摸输入。")],
      [t("外设：", STRONG), t("SPI、I2S、I2C、PWM、RMT、ADC、UART、SD/MMC、TWAI(CAN)、LCD、DVP（摄像头）接口。")],
      [t("USB：", STRONG), t("内置全速 USB OTG 与 USB Serial/JTAG 控制器（这是 S3 相对老款的关键差异）。")],
      [t("安全：", STRONG), t("Flash 加密（AES-XTS）、安全启动（RSA）、数字签名、HMAC、World Controller 可信执行环境。")],
      [t("功耗：", STRONG), t("深度睡眠约 7 µA，含超低功耗协处理器（ULP），支持多种低功耗模式。")],
    ]),

    h(2, "二、它“强在哪”——核心能力拆解"),
    bullet([
      [t("AI/边缘推理：", STRONG), t("向量指令 + ESP-DSP / ESP-NN / ESP-DL 库，可在端侧跑唤醒词、语音识别、轻量图像分类（如 MobileNetV2 推理提速约 43%）。")],
      [t("原生 USB：", STRONG), t("能直接把自己模拟成 USB 键盘/鼠标（HID）、MIDI、音频设备（UAC）、摄像头（UVC）、4G 网卡或 USB 存储，无需额外转换芯片。")],
      [t("音视频管线：", STRONG), t("I2S 音频 + 摄像头 DVP 接口，可做录音、播放、拍照、视频流转发。")],
      [t("强连接性：", STRONG), t("Wi-Fi + BLE 5，Wi-Fi MAC 支持 4 个虚拟接口，配 lwIP 可做智能家居中控。")],
      [t("完善安全：", STRONG), t("硬件级加密与可信执行环境，适合联网设备的安全设备身份认证。")],
    ]),

    h(2, "三、对比经典 ESP32，该怎么选"),
    p("两者都是双核 Wi-Fi + 蓝牙 SoC、价格都便宜（S3 约 6–12 美元），但差异明显："),
    bullet([
      [t("CPU/AI：", STRONG), t("ESP32=LX6；ESP32-S3=LX7 且带 SIMD 向量指令，做 DSP/小模型更快更省电。")],
      [t("蓝牙：", STRONG), t("ESP32 支持蓝牙经典（A2DP 音频、SPP 串口）；ESP32-S3 只有 BLE 5，没有经典蓝牙——需要蓝牙音频就选老款。")],
      [t("USB：", STRONG), t("ESP32 无原生 USB，靠外部串口芯片烧录/调试；ESP32-S3 原生 USB OTG，可做 HID/MIDI/存储等 USB 设备。")],
      [t("GPIO：", STRONG), t("ESP32 约 34 个；ESP32-S3 约 45 个（含 14 个触摸）。")],
      [t("DAC：", STRONG), t("ESP32 有 2 路 8 位 DAC；ESP32-S3 无内置 DAC，需用外置 DAC 或 PWM+滤波。")],
      [t("结论：", STRONG), t("新项目、AI/视觉/USB/现代 BLE 优先 S3；纯蓝牙音频或想直接复用老教程代码才用 ESP32。")],
    ]),

    h(2, "四、它能用来做什么（按场景 + 实例）"),
    h(3, "1. AI / 边缘智能（当前最热门）"),
    bullet([
      [t("小智 AI 聊天机器人（Xiaozhi）：", STRONG), t("基于 ESP32-S3 的开源实时语音对话项目（GitHub 约 10k★），本地离线唤醒 + 云端大模型（Qwen/DeepSeek/豆包等）做 ASR+LLM+TTS，可用 MCP 协议控制舵机/LED/GPIO。")],
      [t("ESP-BOX + ChatGPT：", STRONG), t("乐鑫官方 AIoT 开发套件，集成 Whisper 语音转写与 OpenAI 聊天 API，做语音控制聊天机器人，支持上百种语言。")],
      [t("离线语音助手：", STRONG), t("用 ESP-SR（WakeNet/MultiNet）实现离线唤醒词与命令词识别，断网也能响应。")],
      [t("本地图像识别 / 动作检测：", STRONG), t("ESP-WHO + ESP-DL 在端侧做人脸识别、移动侦测、姿态识别。")],
    ]),

    h(3, "2. 智能家居与中控"),
    bullet([
      [t("智能门锁：", STRONG), t("安全网络连接 + 本地 AI（人脸识别/指纹）实现开锁、远程监控与异常报警。")],
      [t("智能中控屏 / 智能音箱：", STRONG), t("带屏设备做家庭中枢，控制灯光、温度、安防。")],
      [t("智能照明 / 温控 / 安防监控：", STRONG), t("通过 Wi-Fi 或 BLE Mesh 接入 Home Assistant、ESP-RainMaker 等。")],
    ]),

    h(3, "3. 物联网传感器与数据采集"),
    bullet([
      [t("环境/气象站：", STRONG), t("接 SHT20/BME280/SCD41 等温湿度、CO₂ 传感器，经 Wi-Fi 上报云端（ThingSpeak/MQTT）。")],
      [t("空气质量监测：", STRONG), t("PMS5003T 粉尘、SGP40 气体传感器做 PM2.5/PM10/气体超标告警。")],
      [t("智慧农业：", STRONG), t("植物生长记录仪、土壤温湿度监测、自动灌溉。")],
      [t("工业监控：", STRONG), t("通过 TWAI(CAN) 接口连工业设备，采集振动/温度做预测性维护。")],
    ]),

    h(3, "4. 音视频与视觉（摄像头）"),
    bullet([
      [t("实时视频流转发：", STRONG), t("接 OV2640/OV5640 摄像头，经 Wi-Fi 把画面推到手机/电脑（远程监控、可视化巡检）。")],
      [t("实时安防摄像头：", STRONG), t("端侧人脸识别 / 移动侦测的本地安防。")],
      [t("语音提示盒 / 录音笔：", STRONG), t("I2S 麦克风 + 喇叭做语音播报、关键词检测。")],
    ]),

    h(3, "5. 工业自动化与机器人"),
    bullet([
      [t("运动控制：", STRONG), t("内置 MCPWM 与脉冲计数器，控制电机、3D 打印机、CNC 机床。")],
      [t("工业网关：", STRONG), t("用串口/SPI 把老旧 RS485 工业设备接入无线网，实现联网升级。")],
      [t("服务机器人 / 教育机器人：", STRONG), t("图形化编程指令响应时间可低至约 180ms。")],
    ]),

    h(3, "6. USB 设备（HID / MIDI / 存储 / 网卡）"),
    bullet([
      [t("USB 键盘/鼠标/游戏手柄（HID）：", STRONG), t("把开发板变成桌面输入设备。")],
      [t("USB MIDI 控制器：", STRONG), t("音乐制作外设。")],
      [t("USB 音频设备（UAC）：", STRONG), t("麦克风/声卡类设备。")],
      [t("USB 4G 网卡 / 无线 U 盘：", STRONG), t("USB-OTG 开发板结合 Wi-Fi 做图传、热点上网、U 盘。")],
      [t("2FA Sidecar：", STRONG), t("双因素身份验证硬件密钥。")],
    ]),

    h(3, "7. 可穿戴设备"),
    bullet([
      [t("智能手表 / 手环：", STRONG), t("如开源项目 MutantW V2，通过 Wi-Fi 同步天气/通知、BLE 连手机、LCD+马达交互。")],
      [t("便携式语音助手：", STRONG), t("超低待机功耗让设备可长时间离线工作。")],
    ]),

    h(3, "8. 教育与娱乐"),
    bullet([
      [t("可编程教育机器人、智能玩具、复古游戏机模拟器。", STRONG)],
      [t("图形化编程（UIFlow）适合入门者与教学。", STRONG)],
      [t("电子病历语音转录、智慧养老陪伴（如 AI 毛绒玩偶）等落地产品。", STRONG)],
    ]),

    h(2, "五、开发框架怎么选"),
    p("ESP32-S3 生态极其丰富，可任选其一："),
    bullet([
      [t("ESP-IDF（官方 C/C++ 框架）：", STRONG), t("功能最全、第一时间支持新特性（向量指令、USB OTG、PSRAM 配置、分区表），适合产品级与进阶开发。")],
      [t("Arduino（C++ 封装）：", STRONG), t("上手最简单、示例最多，适合快速验证与原型；但对底层/新特性的支持会滞后。")],
      [t("MicroPython：", STRONG), t("Python 语法、免编译即时运行，适合教育与快速原型；性能/驱动支持有限。")],
      [t("PlatformIO：", STRONG), t("VS Code 集成好、多平台统一管理，底层仍是 ESP-IDF 构建；适合团队协作/中大型工程。")],
      [t("ESPHome：", STRONG), t("YAML 配置式物联网固件，无需写代码即可做传感器、网关、摄像头等，常配合 Home Assistant。")],
      [t("UIFlow（图形化）：", STRONG), t("拖拽式低代码，适合文科生、入门者或快速出成果。")],
    ]),
    p([t("建议路径：", STRONG), t("零基础先用 Arduino 把板子点起来、跑通串口和 Wi-Fi；想用 PSRAM/USB 摄像头/定制分区/新 AI 组件时，再切到 ESP-IDF。")]),

    h(2, "六、给新手的上手项目（由易到难）"),
    ordered([
      [t("点亮 RGB + 串口打印：", STRONG), t("确认 COM 口、USB 驱动、boot 引脚（GPIO0/3/45/46）。")],
      [t("Wi-Fi 气象节点：", STRONG), t("DHT22/SHT31 接 I2C，数据上传网页或 MQTT。")],
      [t("OLED 状态牌：", STRONG), t("SSD1306 显示 IP 与内存，经典入门显示项目。")],
      [t("SPI TFT 仪表盘：", STRONG), t("用 FSPI 引脚（10–13）驱动 2.4/3.5 寸屏幕，后续加触摸。")],
      [t("USB 串口/HID 小设备：", STRONG), t("用原生 USB（GPIO19/20）做一个桌面输入设备。")],
      [t("BLE 遥控 / 存在提醒：", STRONG), t("手机控制继电器，或两块板做 iBeacon 存在检测。")],
      [t("摄像头抓拍 / 门铃：", STRONG), t("OV2640 拍照存 SD 卡并推送通知（务必确认 PSRAM 已启用）。")],
      [t("语音/视觉小模型 Demo：", STRONG), t("先跑官方未改示例，测时延与内存再改模型或加 UI。")],
    ]),

    h(2, "七、选购与避坑建议"),
    bullet([
      [t("看型号别只看芯片名：", STRONG), t("确认板子实际焊接的 Flash/PSRAM 容量、摄像头/屏幕接口、电压电平、保留引脚。")],
      [t("做语音/视觉一定要带 PSRAM：", STRONG), t("普通 ESP32 或 C3 容易出现无声、杂音、卡顿、重启——ESP32-S3 + PSRAM（如 N16R8）是语音机器人的稳妥选择。")],
      [t("大电流外设独立供电：", STRONG), t("舵机、WS2812 灯带、继电器不要从开发板 3.3V 取电，用独立 5V，单点共地。")],
      [t("分清原生 USB 与串口桥：", STRONG), t("只有连到 USB-UART 桥的口不能做 HID/MIDI，必须确认接的是 S3 原生 USB 引脚。")],
      [t("麦克风远离喇叭：", STRONG), t("避免回声影响唤醒与识别。")],
      [t("云端大模型关注费用与隐私：", STRONG), t("先用最小可用版本，再逐步加语音、屏幕、知识库、插件。")],
    ]),

    h(2, "八、参考资料来源"),
    p("本文综合自以下公开资料（2026-11 检索）："),
    bullet([
      [t("乐鑫官方：ESP32-S3 产品概述与新闻（espressif.com）", STRONG)],
      [t("Espressif 开发者博客：ESP-BOX 接入 ChatGPT 指南", STRONG)],
      [t("小智 AI 聊天机器人文档（ESP-IDF / xiaozhi）", STRONG)],
      [t("乐鑫 IoT 学院：ESP32-S3 与大模型智能家居赛事资料", STRONG)],
      [t("技象科技：esp32-s3 可以做什么（应用与项目盘点）", STRONG)],
      [t("CraftedTech / esp32s.com：引脚、应用与项目实例", STRONG)],
      [t("Instructables / ESP32.co.uk：ESP32 家族选型对比", STRONG)],
      [t("CSDN：ESP32-S3 开发环境搭建与 N16R8 实战", STRONG)],
      [t("百度百科：ESP32-S3 词条", STRONG)],
    ]),
    bq([t("提示：本文为公开资料整理，具体项目的引脚、驱动与功耗请以你所用开发板的官方原理图与示例为准。"), t(" 文档已发布到学城，可随时在浏览器内编辑补充。", EM)]),
  ],
};

// ---- 发布到学城 ----
async function main() {
  const jar = [];
  const cookieStore = {};
  const saveCookie = (res) => {
    const sc = res.headers.get("set-cookie");
    if (sc) {
      const m = sc.match(/xc_session=([^;]+)/);
      if (m) cookieStore.xc_session = m[1];
    }
  };
  const withCookie = (init) => {
    const c = `xc_session=${cookieStore.xc_session || ""}`;
    return { ...init, headers: { ...(init.headers || {}), Cookie: c } };
  };

  // 1) 登录
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  saveCookie(login);
  const loginJson = await login.json();
  console.log("登录:", login.status, JSON.stringify(loginJson).slice(0, 120));
  if (!cookieStore.xc_session) {
    console.error("未拿到会话 Cookie，登录失败");
    process.exit(1);
  }

  // 2) 创建文档
  const create = await fetch(`${BASE}/api/docs`, withCookie({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "ESP32-S3 可以用来做什么？（全网资料整理）",
      content,
    }),
  }));
  const createJson = await create.json();
  console.log("创建:", create.status, "code:", createJson.code);
  if (create.status !== 200 || createJson.code !== 200) {
    console.error("创建失败:", JSON.stringify(createJson).slice(0, 400));
    process.exit(1);
  }
  const doc = createJson.data;
  console.log("文档 ID:", doc.id);
  console.log("访问地址:", `${BASE}/doc/${doc.id}`);
}

main().catch((e) => { console.error("异常:", e); process.exit(1); });
