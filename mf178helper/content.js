(function () {
  // 配置项
  const CONFIG = {
    LOG_ENABLED: true,
    POLLING_INTERVAL: 5000,
    TARGET_TEXT: "确认接单",
    SOUND_URL: chrome.runtime.getURL("alert.mp3"),
    SELECTOR: "uni-view", // 确保这里是正确的选择器，你之前提供的是 "uni-view"
    DEBOUNCE_TIME: 3000,
    TARGET_HASH_PATH: "#/subpages/tuidanOrder/tuidanOrder" // 修改为 TARGET_HASH_PATH，强调是纯净路径
  };

  // 工具函数：日志输出
  function log(...args) {
    if (CONFIG.LOG_ENABLED) {
      console.log(`[蜜蜂接单提醒 - Content]`, ...args);
    }
  }

  // 初始化音频对象
  let audio = new Audio(CONFIG.SOUND_URL);
  audio.preload = "auto"; // 尝试预加载音频
  audio.volume = 1.0; // 设置音量

  // 添加音频加载错误监听，便于调试
  audio.addEventListener("error", (e) => {
    log("音频加载失败或播放错误:", e);
  });

  let intervalId = null; // 用于存储定时器的ID
  let isMonitoringEnabled = false; // 插件的总开关状态，默认关闭，等待 background.js 的消息

  let lastPlayTime = 0; // 上次播放声音的时间戳，用于防抖

  // 播放声音函数，包含防抖逻辑
  function playSound() {
    const now = Date.now();
    if (now - lastPlayTime < CONFIG.DEBOUNCE_TIME) {
      log("声音播放太频繁，跳过。");
      return; // 防止短时间内重复播放
    }

    audio.currentTime = 0; // 从头开始播放
    audio.play().catch((e) => log("声音播放失败，可能用户未与文档交互：", e));
    lastPlayTime = now;
  }

  // 检查页面中是否存在“确认接单”按钮
  function checkForConfirmButton() {
    // 从 window.location.hash 中提取哈希路径部分，忽略任何查询参数
    const currentHashPath = window.location.hash.split('?')[0];

    // 只有当插件总开关开启且当前哈希路径匹配时才执行检查
    if (!isMonitoringEnabled || currentHashPath !== CONFIG.TARGET_HASH_PATH) {
      // log("监测已关闭或当前页面哈希不匹配，跳过检查。"); // 调试时可以打开
      return;
    }

    const elements = document.querySelectorAll(CONFIG.SELECTOR);
    let foundButton = false;

    for (const el of elements) {
      // 检查元素的文本内容是否匹配目标文本
      if (el.textContent.trim() === CONFIG.TARGET_TEXT) {
        log("检测到“确认接单”按钮！");
        playSound();
        foundButton = true;
        break; // 找到即停止遍历
      }
    }

    // if (!foundButton) {
    // log("页面中未发现“确认接单”按钮。"); // 调试时可以打开
    // }
  }

  // 启动监测（设置定时器）
  function startMonitoring() {
    if (intervalId === null) {
      intervalId = setInterval(checkForConfirmButton, CONFIG.POLLING_INTERVAL);
      log("监测已启动。");
    }
  }

  // 停止监测（清除定时器）
  function stopMonitoring() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
      log("监测已停止。");
    }
  }

  // 根据插件总开关状态和当前页面哈希来决定是否启动或停止监测
  function updateMonitoringBasedOnGlobalState() {
    // 从 window.location.hash 中提取哈希路径部分，忽略任何查询参数
    const currentHashPath = window.location.hash.split('?')[0];

    // 只有当 isMonitoringEnabled 为 true 且哈希路径匹配时才启动
    if (isMonitoringEnabled && currentHashPath === CONFIG.TARGET_HASH_PATH) {
      startMonitoring();
    } else {
      stopMonitoring();
    }
  }

  // 监听来自 background.js 的消息（用于同步开关状态）
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "updateMonitoringStatus") {
      isMonitoringEnabled = request.isEnabled; // 接收 background.js 发送的最新状态
      log(`接收到监测状态更新：${isMonitoringEnabled ? "开启" : "关闭"}`);
      updateMonitoringBasedOnGlobalState(); // 根据新状态更新监测
    }
  });

  // 监听 URL 哈希变化事件：这对于单页应用（SPA）在不刷新页面的情况下切换路由非常重要
  window.addEventListener('hashchange', () => {
    log(`URL 哈希变化：当前为 ${window.location.hash}`);
    updateMonitoringBasedOnGlobalState(); // 哈希变化时重新评估是否启动监测
  });

  // 当页面被卸载时（例如关闭标签页），停止监测以清理资源
  window.addEventListener("beforeunload", () => {
    stopMonitoring();
  });
})();